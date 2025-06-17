## Project Plan: Self-Service PostgreSQL Provisioning

**Version:** 1.0
**Date:** 2025-06-17

**Objective:** To develop a Go backend and Svelte/TypeScript frontend application that enables OIDC-authenticated users to provision and manage their own isolated PostgreSQL databases (with pgvector enabled by default) within a shared PostgreSQL instance. Users can create multiple databases and, for each database, create multiple PostgreSQL users with 'read' or 'write' permissions. The development and testing environment will be managed via Docker Compose, including Dex for OIDC.

### 1. System Architecture Overview

The system comprises a frontend application, a backend API, a shared PostgreSQL instance, and an OIDC provider (Dex) for authentication.

```mermaid
graph TD
    User[End User] -- Interacts via Browser --> Frontend[Frontend (Vite/Svelte/TS)]
    Frontend -- API Calls --> Backend[Backend API (Go/Gin)]
    Backend -- OIDC Auth Flow --> Dex[OIDC Provider (Dex)]
    Backend -- Manages Users/DBs --> AppDB[(Application DB - within Backend or separate)]
    Backend -- Provisions/Manages --> PostgreSQL[Shared PostgreSQL Instance (with pgvector)]

    subgraph "User's Machine"
        User
        Browser
    end

    subgraph "Docker Compose Environment"
        Frontend
        Backend
        AppDB
        PostgreSQL
        Dex
    end
```

*   **Frontend (Vite/Svelte/TypeScript with Shadcn-Svelte):** Provides the user interface for authentication, database management, and PostgreSQL user management.
*   **Backend API (Go/Gin):** Handles business logic, OIDC authentication, interaction with the shared PostgreSQL instance for provisioning, and manages application-specific metadata.
*   **Application DB:** Stores metadata about application users, their managed databases, and associated PostgreSQL users. This could be a separate schema within the shared PostgreSQL instance or a dedicated database. For simplicity, we'll assume it's a schema/tables managed by the backend within the shared instance initially.
*   **Shared PostgreSQL Instance:** The central PostgreSQL server where user-specific databases are created. The `pgvector` extension will be enabled by default in each user-created database.
*   **OIDC Provider (Dex):** Handles user authentication via the OpenID Connect protocol.

### 2. Data Models

The backend will maintain the following data models (likely as tables in the Application DB):

**a. `application_users`**
   (Stores profiles of users authenticated via OIDC)
    *   `internal_user_id`: UUID (Primary Key), application-specific user identifier.
    *   `oidc_sub`: VARCHAR(255) (UNIQUE), the `sub` (subject) claim from the OIDC token.
    *   `email`: VARCHAR(255) (Optional, from OIDC token).
    *   `created_at`: TIMESTAMP WITH TIME ZONE.
    *   `updated_at`: TIMESTAMP WITH TIME ZONE.

**b. `managed_databases`**
   (Stores information about databases provisioned by application users)
    *   `database_id`: UUID (Primary Key), application-specific identifier for the managed database.
    *   `owner_user_id`: UUID (Foreign Key, references `application_users.internal_user_id`).
    *   `pg_database_name`: VARCHAR(63) (UNIQUE across the PostgreSQL instance), the actual name of the database in PostgreSQL.
    *   `status`: VARCHAR(20) (ENUM: `active`, `soft_deleted`, `pending_creation`, `creation_failed`, `pending_deletion`, `deletion_failed`).
    *   `created_at`: TIMESTAMP WITH TIME ZONE.
    *   `updated_at`: TIMESTAMP WITH TIME ZONE.

**c. `managed_pg_users`**
   (Stores information about PostgreSQL users created for a `managed_database`)
    *   `pg_user_id`: UUID (Primary Key), application-specific identifier for the managed PostgreSQL user.
    *   `managed_database_id`: UUID (Foreign Key, references `managed_databases.database_id`).
    *   `pg_username`: VARCHAR(63) (UNIQUE within its `managed_database_id` context in PostgreSQL).
    *   `permission_level`: VARCHAR(10) (ENUM: `read`, `write`).
    *   `status`: VARCHAR(20) (ENUM: `active`, `deactivated_db_soft_deleted`, `pending_creation`, `creation_failed`).
    *   `created_at`: TIMESTAMP WITH TIME ZONE.
    *   `updated_at`: TIMESTAMP WITH TIME ZONE.
    *   *Note: Passwords for these PostgreSQL users are not stored in this table; they are managed directly within the PostgreSQL instance.*

### 3. API Endpoints (Go/Gin Backend)

All API endpoints requiring authentication will be protected by OIDC token validation.

*   **Authentication (`/auth`)**
    *   `GET /oidc/login`: Initiates OIDC login flow, redirects to Dex.
    *   `GET /oidc/callback`: Handles the OIDC callback from Dex. On success, creates/updates `application_users` record, sets session/token for the frontend.
    *   `POST /logout`: Clears user session/token.
    *   `GET /api/me`: Retrieves the profile of the currently authenticated `application_user`.

*   **Database Management (`/api/databases`)**
    *   `POST /`: Create a new PostgreSQL database.
        *   Request Body: `{ "name": "user_chosen_db_name" }`
        *   Response: Details of the created `managed_databases` record.
    *   `GET /`: List all `managed_databases` for the authenticated user.
    *   `GET /{database_id}`: Get details of a specific `managed_database`.
    *   `DELETE /{database_id}`: Soft-delete a `managed_database`. (Changes status to `soft_deleted`, deactivates associated `managed_pg_users`).
    *   `POST /{database_id}/restore`: (Future) Restore a `soft_deleted` database.

*   **PostgreSQL User Management (`/api/databases/{database_id}/users`)**
    *   `POST /`: Create a new PostgreSQL user for the specified `managed_database`.
        *   Request Body: `{ "username": "user_chosen_pg_username" }`
        *   Response: Details of the created `managed_pg_users` record, including the *generated password* (one-time display).
    *   `GET /`: List all `managed_pg_users` for the specified `managed_database`.
    *   `POST /{pg_user_id}/regenerate-password`: Generates a new password for the specified `managed_pg_user`.
        *   Response: `{ "new_password": "generated_password" }` (one-time display).

### 4. Backend Logic (Go)

Key logic areas for the Go backend:

*   **OIDC Integration:**
    *   Use a library like [`coreos/go-oidc`](https://github.com/coreos/go-oidc) for OIDC flow management.
    *   Token validation middleware for protected API routes.
    *   User profile creation/synchronization in `application_users` table based on OIDC claims (especially `sub`).

*   **Database Provisioning (`database/sql` with `pq` driver):**
    *   The backend connects to the shared PostgreSQL instance using admin credentials (configured via env vars).
    *   **Create Database:**
        1.  Validate `pg_database_name` for uniqueness and PostgreSQL naming rules.
        2.  Execute `CREATE DATABASE {sanitized_pg_database_name};`
        3.  Connect to the newly created database.
        4.  Execute `CREATE EXTENSION IF NOT EXISTS pgvector;`
        5.  Record metadata in `managed_databases`.
    *   **Soft-Delete Database:**
        1.  Update status of `managed_databases` record to `soft_deleted`.
        2.  For each associated `managed_pg_users`:
            *   Connect to the target user database (as admin).
            *   Execute `REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM {pg_username};` (and other schemas if applicable).
            *   Execute `REVOKE ALL PRIVILEGES ON SCHEMA public FROM {pg_username};`
            *   Execute `REVOKE CONNECT ON DATABASE {pg_database_name} FROM {pg_username};`
            *   Update status of `managed_pg_users` record to `deactivated_db_soft_deleted`.
    *   **Restore Database (Future):**
        1.  Update status of `managed_databases` record to `active`.
        2.  For each associated `managed_pg_users` (previously `deactivated_db_soft_deleted`):
            *   Re-grant original permissions (CONNECT, USAGE on schema, table permissions based on `permission_level`).
            *   Update status of `managed_pg_users` record to `active`.

*   **PostgreSQL User Provisioning (within a specific user-owned database):**
    *   The backend connects to the specific user-owned database (e.g., as the database owner or an admin).
    *   **Create PostgreSQL User:**
        1.  Generate a cryptographically strong random password.
        2.  Validate `pg_username` for uniqueness (within that database) and PostgreSQL naming rules.
        3.  Execute `CREATE USER {sanitized_pg_username} WITH PASSWORD '{generated_password}';`
        4.  Execute `GRANT CONNECT ON DATABASE CURRENT_DATABASE() TO {sanitized_pg_username};` (CURRENT_DATABASE() refers to the user-owned DB the backend is connected to).
        5.  Execute `GRANT USAGE ON SCHEMA public TO {sanitized_pg_username};`
        6.  If `permission_level` is 'read':
            *   `GRANT SELECT ON ALL TABLES IN SCHEMA public TO {sanitized_pg_username};`
            *   `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO {sanitized_pg_username};`
        7.  If `permission_level` is 'write':
            *   `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {sanitized_pg_username};`
            *   `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {sanitized_pg_username};`
        8.  Record metadata in `managed_pg_users`.
    *   **Regenerate Password:**
        1.  Generate a new strong random password.
        2.  Execute `ALTER USER {sanitized_pg_username} WITH PASSWORD '{new_generated_password}';`

*   **Authorization & Error Handling:**
    *   Middleware to ensure an authenticated `application_user` can only manage resources (`managed_databases`, `managed_pg_users`) they own.
    *   Proper error handling and status codes for API responses.

### 5. Frontend (Vite/Svelte/TypeScript/Shadcn-Svelte)

*   **Core Pages/Views:**
    *   `LoginPage`: Simple page, possibly just a "Login with OIDC Provider" button.
    *   `DashboardPage`:
        *   Displays a list of the user's `managed_databases` (name, status, actions).
        *   Button/form to create a new database.
    *   `DatabaseDetailPage (/databases/{db_id})`:
        *   Displays details of the selected database.
        *   Lists `managed_pg_users` for this database (username, permissions, actions).
        *   Button/form to create a new PostgreSQL user for this database.
        *   Action to regenerate password for a PostgreSQL user.
        *   Action to soft-delete the database.
*   **Key Components (using Shadcn-Svelte):**
    *   `DataTable` for listing databases and PostgreSQL users.
    *   `Dialog` / `Modal` for creation forms (database, PG user).
    *   `Input`, `Button`, `Select` for forms.
    *   `Alert` for displaying messages (e.g., generated passwords, errors).
*   **State Management:**
    *   Svelte stores for authentication status, user profile.
    *   Local component state or stores for API data (databases, PG users).
    *   Consider using SvelteQuery/TanStack Query for data fetching, caching, and mutations.
*   **API Client:**
    *   A service/module with functions to make `fetch` requests to the backend API endpoints.
    *   Handles request/response formatting, error handling, and authentication token attachment.

### 6. Docker Compose Configuration (`docker-compose.yml`)

```yaml
version: '3.8'

services:
  postgres:
    image: pgvector/pgvector:pg16 # Or your preferred PostgreSQL version with pgvector
    container_name: pgweb_postgres
    environment:
      POSTGRES_USER: admin_user # Admin user for the instance
      POSTGRES_PASSWORD: admin_password
      POSTGRES_DB: admin_db # Initial admin database
    ports:
      - "5432:5432"
    volumes:
      - pgweb_data:/var/lib/postgresql/data
    restart: unless-stopped

  dex:
    image: ghcr.io/dexidp/dex:v2.30.0 # Use a specific version
    container_name: pgweb_dex
    ports:
      - "5556:5556" # HTTP
      - "5557:5557" # gRPC
      - "5558:5558" # Metrics
    volumes:
      - ./dex_config.yml:/etc/dex/config.yml:ro # Mount Dex configuration
    restart: unless-stopped

  backend:
    build:
      context: ./backend # Assuming backend code is in a 'backend' subdirectory
      dockerfile: Dockerfile
    container_name: pgweb_backend
    ports:
      - "8080:8080"
    environment:
      # For connecting to PostgreSQL as admin to manage databases/users
      PG_ADMIN_DSN: "postgres://admin_user:admin_password@postgres:5432/admin_db?sslmode=disable"
      # For connecting to the application's own metadata tables (if separate or different user)
      # APP_DB_DSN: "postgres://app_user:app_password@postgres:5432/app_metadata_db?sslmode=disable"
      OIDC_ISSUER_URL: "http://dex:5556/dex" # Internal Docker network hostname
      OIDC_CLIENT_ID: "pgweb-frontend"
      OIDC_CLIENT_SECRET: "your-client-secret" # Should be a strong secret
      GIN_MODE: "debug" # or "release"
      # Other backend configs
    depends_on:
      - postgres
      - dex
    restart: unless-stopped

  frontend:
    build:
      context: ./frontend # Assuming frontend code is in a 'frontend' subdirectory
      dockerfile: Dockerfile # Dockerfile for Vite/Svelte app
    container_name: pgweb_frontend
    ports:
      - "5173:5173" # Default Vite dev port
    environment:
      VITE_API_BASE_URL: "http://localhost:8080/api" # For calls from user's browser to backend
      VITE_OIDC_LOGIN_URL: "http://localhost:8080/auth/oidc/login"
    depends_on:
      - backend
    restart: unless-stopped

volumes:
  pgweb_data:
```
*Note: `dex_config.yml` needs to be created with appropriate static clients, connectors, etc. A sample `Dockerfile` for Go backend and Vite/Svelte frontend would also be needed.*

### 7. Configuration Management

*   **Backend (Environment Variables):**
    *   `PG_ADMIN_DSN`: DSN for the backend to connect to PostgreSQL with admin rights.
    *   `APP_DB_DSN`: (If app metadata is in a separate DB or uses a different user) DSN for application metadata.
    *   `OIDC_ISSUER_URL`: URL of the Dex issuer.
    *   `OIDC_CLIENT_ID`: Client ID registered with Dex for the backend.
    *   `OIDC_CLIENT_SECRET`: Client secret for the backend.
    *   `GIN_MODE`: `debug` or `release`.
    *   `SESSION_SECRET_KEY`: For session management.
    *   `API_BASE_PATH`: e.g., `/api`
*   **Frontend (Vite Environment Variables - prefixed with `VITE_`):**
    *   `VITE_API_BASE_URL`: Base URL for backend API calls (e.g., `http://localhost:8080/api`).
    *   `VITE_OIDC_LOGIN_URL`: Full URL to backend's OIDC login initiation endpoint (e.g., `http://localhost:8080/auth/oidc/login`).

### 8. Key Workflows (Conceptual Sequence Diagrams)

**a. New User Authentication & Profile Creation**
```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant Dex

    User->>Frontend: Clicks Login
    Frontend->>Backend: GET /auth/oidc/login (redirect)
    Backend-->>User: Redirect to Dex
    User->>Dex: Authenticates
    Dex-->>Backend: OIDC Callback with Auth Code
    Backend->>Dex: Exchange Auth Code for Tokens
    Dex-->>Backend: ID Token, Access Token
    Backend->>Backend: Validate ID Token
    Backend->>AppDB: Check if oidc_sub exists in application_users
    alt User is new
        Backend->>AppDB: Create new application_user record
    else User exists
        Backend->>AppDB: Update application_user record (e.g., last login)
    end
    Backend-->>Frontend: Set session/token & redirect to dashboard
    Frontend-->>User: Displays Dashboard
```

**b. Authenticated User Creates a New Database**
```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant PostgreSQL
    participant AppDB

    User->>Frontend: Enters DB Name, Clicks Create
    Frontend->>Backend: POST /api/databases (name) with Auth Token
    Backend->>Backend: Validate Auth Token (Ownership implicit by user session)
    Backend->>AppDB: Check for pg_database_name uniqueness (globally)
    alt Name available
        Backend->>PostgreSQL: CREATE DATABASE {db_name} (as admin)
        Backend->>PostgreSQL: (Connect to new DB) CREATE EXTENSION pgvector;
        Backend->>AppDB: Create managed_databases record (status: active)
        Backend-->>Frontend: Success response (DB details)
        Frontend-->>User: Shows new DB in list, success message
    else Name taken
        Backend-->>Frontend: Error response (name taken)
        Frontend-->>User: Shows error message
    end
```

**c. User Creates a PostgreSQL User for Their Database**
```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant PostgreSQL
    participant AppDB

    User->>Frontend: Enters PG Username, Selects Permissions, Clicks Create
    Frontend->>Backend: POST /api/databases/{db_id}/users (username, permissions) with Auth Token
    Backend->>Backend: Validate Auth Token & User owns {db_id}
    Backend->>AppDB: Get pg_database_name for {db_id}
    Backend->>PostgreSQL: (Connect to user's {pg_database_name} as admin/owner)
    Backend->>PostgreSQL: CREATE USER {pg_username} WITH PASSWORD '{generated_password}';
    Backend->>PostgreSQL: GRANT CONNECT, USAGE, table permissions (SELECT/CRUD)
    Backend->>AppDB: Create managed_pg_users record (status: active)
    Backend-->>Frontend: Success response (PG User details + generated_password)
    Frontend-->>User: Shows new PG User, displays generated password (one-time)
```

**d. User Soft-Deletes a Database**
```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant PostgreSQL
    participant AppDB

    User->>Frontend: Clicks Delete on a Database
    Frontend->>Backend: DELETE /api/databases/{db_id} with Auth Token
    Backend->>Backend: Validate Auth Token & User owns {db_id}
    Backend->>AppDB: Update managed_databases status to 'soft_deleted'
    Backend->>AppDB: Get all managed_pg_users for this {db_id}
    loop for each PG User
        Backend->>AppDB: Get pg_username and pg_database_name
        Backend->>PostgreSQL: (Connect to {pg_database_name}) REVOKE permissions, REVOKE CONNECT from {pg_username}
        Backend->>AppDB: Update managed_pg_users status to 'deactivated_db_soft_deleted'
    end
    Backend-->>Frontend: Success response
    Frontend-->>User: Updates DB list (shows as soft-deleted or hides), success message
