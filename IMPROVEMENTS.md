# Project Improvements

Concrete, actionable improvement opportunities identified across the codebase. Findings include file references and suggested fixes. Items are roughly ordered by impact within each category.

## Security

### 1. Final Docker image runs as root
- **File:** `Dockerfile:28-41`
- **Issue:** The `alpine:latest` final stage has no `USER` directive, so the Go server runs as root in production.
- **Fix:** Add a non-root user before `CMD`:
  ```dockerfile
  RUN addgroup -S app && adduser -S -G app app
  USER app
  ```

### 2. No path validation on backup downloads
- **File:** `backend/handlers/db_handlers.go:443-446`
- **Issue:** `c.File(job.FilePath)` is served using whatever path is stored in the DB row, without confirming the file lives inside the configured backup directory. If a row's `file_path` is ever corrupted or written from another code path, this is a path-traversal vector.
- **Fix:** Resolve `BACKUP_DIR` to an absolute path on startup, then verify `filepath.Clean(job.FilePath)` is rooted under it before serving. Reject otherwise.

### 3. Filename header not sanitized
- **File:** `backend/handlers/db_handlers.go:443-444`
- **Issue:** `Content-Disposition: attachment; filename=<pg_database_name>.dump` interpolates the DB name unquoted. Validation upstream limits the charset, but the header should still be quoted/escaped defensively.
- **Fix:** Use a quoted filename (`filename="..."`) and strip any non-`[A-Za-z0-9._-]` characters before emitting.

### 4. No rate limiting on auth or API endpoints
- **File:** `backend/main.go:131-171`
- **Issue:** OIDC login/callback and the API expose no per-IP/per-user rate limiting, leaving them open to brute-force or abuse.
- **Fix:** Add a middleware (e.g. `gin-contrib/limiter` or `tollbooth`) at least on `/auth/oidc/*` and the destructive `/api/databases` write paths.

### 5. Session secrets and admin DSNs hardcoded in compose files
- **File:** `docker-compose.yml`, `compose.dev.yaml`, `compose.test.yml`
- **Issue:** `SESSION_SECRET_KEY` and `PG_ADMIN_DSN` are hardcoded in compose. This is fine for dev/test but the file is easy to copy-paste into prod.
- **Fix:** Reference `${SESSION_SECRET_KEY:?required}` and ship a `.env.example` documenting required vars and warnings.

### 6. Async cleanup of provisioned PG resources on failure
- **File:** `backend/handlers/db_handlers.go` (DB create flow), `backend/handlers/pg_user_handlers.go`
- **Issue:** TODOs note that if a PG database/role is provisioned but the AppDB record insert fails, the PG resource is leaked. Over time this leaves orphan roles/DBs and consumes name space.
- **Fix:** Wrap the AppDB inserts and PG-side provisioning in a compensating-action pattern: insert AppDB row first in `pending` state, do the PG work, then flip to `active`; on failure drop the PG resource and update the row to `failed` (or delete it).

## Code Quality

### 1. No graceful shutdown
- **File:** `backend/main.go:69`, `backend/main.go:173-176`
- **Issue:** Comment says "Consider defer store.AppDB.Close() for graceful shutdown" but the server is started with `r.Run` and there is no signal handling. In-flight requests and DB connections are dropped abruptly on SIGTERM.
- **Fix:** Use `http.Server` with `signal.NotifyContext`, call `srv.Shutdown(ctx)` then `store.AppDB.Close()`.

### 2. Three near-identical table-creation funcs each open a fresh DSN
- **File:** `backend/store/appdb.go:46-129`, `:485-520`
- **Issue:** `CreateApplicationUsersTable`, `CreateManagedDatabasesTable`, `CreateManagedPgUsersTable`, `CreateBackupJobsTable` each call `sql.Open` with the DSN and `defer db.Close()` instead of reusing the already-initialised `AppDB` pool. Lots of duplication and pointless extra connections at startup.
- **Fix:** Take `*sql.DB` (the existing `AppDB`) and run a single `Exec` per migration. Better: collapse into a single `RunMigrations` that executes a slice of statements.

### 3. Missing indexes on frequently-filtered columns
- **File:** `backend/store/appdb.go` (DDL strings)
- **Issue:** `managed_databases.owner_user_id`, `managed_pg_users.managed_database_id`, and `backup_jobs(database_id, status)` are queried in nearly every list/lookup path but not indexed. The unique constraint on `pg_database_name` already covers that lookup.
- **Fix:** Add `CREATE INDEX IF NOT EXISTS` for at least:
  - `managed_databases(owner_user_id)`
  - `backup_jobs(database_id, status)`
  - `backup_jobs(database_id, type, created_at DESC)` for `GetLatestBackupJobForDatabase`.

### 4. Inconsistent connection-pool tuning
- **File:** `backend/store/appdb.go:29-31` (AppDB: 25/25), `backend/dbutils/provision.go:73-75` (utility: 5/1)
- **Issue:** Hardcoded numbers, no env override, and noticeably divergent between the two paths with no comment explaining why.
- **Fix:** Centralize pool config (`APP_DB_MAX_OPEN`, `APP_DB_MAX_IDLE`, `APP_DB_CONN_LIFETIME`) and document what each is sized for.

### 5. Plain `log` package everywhere
- **File:** Most files in `backend/`
- **Issue:** Mix of `log.Printf`, `log.Println`, and `log.Fatalf`. No levels, no structured fields, hard to grep in aggregated logs.
- **Fix:** Migrate to `log/slog` (Go 1.21+) with JSON handler in production. Add request_id/user_id to all handler log lines.

### 6. Backup file cleanup uses a per-request goroutine with `time.Sleep(1*time.Hour)`
- **File:** `backend/handlers/db_handlers.go:449-454`
- **Issue:** Each download spawns a goroutine that sleeps an hour. If the process restarts in that window, the file is leaked (the startup `CleanupOldDumpFiles` only catches files >24h, so the leak is bounded but real). Lots of stranded goroutines under load.
- **Fix:** Drop the per-request goroutine; rely on a periodic janitor (a `time.Ticker` started in `main`) plus the existing startup sweep, configurable via env.

### 7. Two near-duplicate `GetBackupJobByID` functions
- **File:** `backend/store/appdb.go:541-595`
- **Issue:** `GetBackupJobByID` and `GetBackupJobByIDInternal` differ only in whether they join through `managed_databases` for an ownership check. Easy to update one and forget the other.
- **Fix:** Have the public version call the internal version, or factor scanning into a shared helper.

## Testing

### 1. No HTTP-level integration tests for handlers
- **File:** `backend/handlers/`
- **Issue:** `dbutils` has solid unit tests, but the Gin handlers are only exercised via the Playwright E2E suite, which is slow and tests via the real frontend.
- **Fix:** Add `httptest`-based handler tests with a real test Postgres (the existing `compose.test.yml` already provides one). Cover auth bypass, ownership boundaries, and validation errors specifically.

### 2. Error paths under-tested in dbutils
- **File:** `backend/dbutils/provision_test.go`
- **Issue:** Happy-path and permission-isolation coverage is good; not much for connection failures, duplicate-name races, or invalid DSN handling.
- **Fix:** Add tests that point at a closed port, send an already-existing role/DB name, and pass malformed DSNs.

### 3. Test artifacts not cleaned up on interrupted runs
- **File:** `compose.test.yml:42-54`, backup-restore E2E suite
- **Issue:** Aborted runs can leave `db_test_*` databases/roles or dump files behind. The suite already had to be moved to serial mode and a 24h startup janitor was added; both point at the same cleanup gap.
- **Fix:** A `TestMain` (or a shared `t.Cleanup`) that drops `db_test_*` databases/roles and removes any test dumps under `BACKUP_DIR` regardless of test result.

## DevOps / Docker

### 1. No `.dockerignore`
- **File:** project root (file missing)
- **Issue:** `node_modules/`, `test-results/`, `frontend/dist`, `.git`, etc. all stream into the build context. Slows builds and risks leaking secrets in `.env` files.
- **Fix:** Add `.dockerignore` covering `node_modules`, `test-results`, `.git`, `*.log`, `.env*`, `playwright-report`, `frontend/dist`.

### 2. No `HEALTHCHECK` in the production Dockerfile
- **File:** `Dockerfile`
- **Issue:** `compose.test.yml` defines healthchecks but the deployable image does not, so orchestrators that consume the image (Kubernetes, plain Docker) have no readiness signal beyond TCP.
- **Fix:** `HEALTHCHECK CMD wget -qO- http://localhost:8080/health || exit 1` (the `/health` endpoint already exists at `backend/main.go:74`).

### 3. No `.env.example`
- **File:** project root (file missing)
- **Issue:** Required env vars (`APP_DB_DSN`, `PG_ADMIN_DSN`, `SESSION_SECRET_KEY`, `BACKUP_DIR`, `FRONTEND_DIST`, OIDC config, etc.) are scattered across compose files and `main.go`. New contributors have to grep them out.
- **Fix:** A single `.env.example` listing every consumed variable, with a one-line comment per var.

## Documentation

### 1. README claims a Svelte frontend; the code is React
- **File:** `README.md:5`, `README.md:23`, `PROJECT_PLAN.md` ("Tech Stack" section)
- **Issue:** README says *"Go backend API and a Svelte/TypeScript frontend"* and *"Frontend: Svelte, TypeScript, Vite, Shadcn-Svelte"*. Verified `frontend/package.json` shows React 19 plus the full `@radix-ui/react-*` / `lucide-react` / `react-hook-form` stack.
- **Fix:** Update both documents to "React, TypeScript, Vite, shadcn/ui".

### 2. README claims Cypress for E2E; the project uses Playwright
- **File:** `README.md:27`
- **Issue:** README says *"Testing: Cypress (for E2E tests on the API)"*. The repo has `playwright.config.js`, `Dockerfile.playwright`, `tests/`, and a `playwright-report` directory.
- **Fix:** Replace with Playwright; mention the `npx playwright test` invocation.

### 3. `backend/API.md` drift
- **File:** `backend/API.md` vs. routes in `backend/main.go:131-171`
- **Issue:** Worth a pass to confirm the backup/restore endpoints (`POST /databases/:id/backup`, `GET /databases/:id/backup/:job_id`, `GET .../download`, `POST /databases/:id/restore`, `GET /databases/:id/restore/:job_id`) are documented with current request/response shapes — these were added relatively recently per the recent commit log.
- **Fix:** Reconcile and add status-code/error tables.

## Performance

### 1. Per-download cleanup goroutines
- See **Code Quality #6** above — also a perf concern under burst download load.

### 2. Serial `pg_dump`/`pg_restore` invocations share the AppDB pool
- **File:** `backend/dbutils/backup.go`, `backend/dbutils/restore.go` (whatever the pair is)
- **Issue:** Backup/restore opens fresh PG connections on every invocation rather than reusing a small dedicated pool, and there is no concurrency cap, so N simultaneous restores can saturate `max_connections`.
- **Fix:** A bounded worker pool (semaphore) for backup/restore plus a documented per-instance concurrency limit.

## Architecture

### 1. No audit log
- **Issue:** Database creation, deletion, role changes, password regenerations, and restores are only logged to stdout. Nothing in the AppDB records *who did what when*.
- **Fix:** Add an append-only `audit_log` table (`actor_user_id`, `action`, `target_type`, `target_id`, `payload jsonb`, `created_at`) and write to it from each mutating handler.

### 2. AppDB and managed PG share one instance
- **Issue:** Application metadata and user-provisioned databases live on the same Postgres. A misbehaving user database can starve AppDB (connection storms, lock contention).
- **Fix:** Document the option (and config knob) to point `APP_DB_DSN` at a separate Postgres in production. Long-term: mandate it.

### 3. Disaster recovery for the AppDB itself is undocumented
- **Issue:** The product backs up *user* databases but says nothing about backing up the metadata DB that owns those records. If AppDB is lost, the orphan PG databases/roles cannot be reattached.
- **Fix:** Add a short "Operations" section to the README describing how to back up the AppDB and how the schema can be recreated from the live PG cluster if needed.
