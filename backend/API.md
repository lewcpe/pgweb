# API Documentation

## Introduction

This document provides details about the backend API for pgweb-backend. The API allows users to manage PostgreSQL databases and their associated users. All API endpoints prefixed with `/api` require OIDC authentication via a valid session cookie.

## Endpoints

### Authentication

- **POST /auth/login**
  - Initiates the OIDC login flow.
  - Redirects the user to the OIDC provider.
- **GET /auth/oidc/login**
  - Initiates the OIDC login flow (alias).
- **GET /auth/oidc/callback**
  - Handles the OIDC callback after successful authentication.
  - Exchanges the authorization code for tokens and establishes a session.
- **POST /auth/logout**
  - Clears the user's session.
  - Redirects the user to a configured logout URL or the home page.
- **GET /api/me**
  - Retrieves the current authenticated user's information from the session.
  - Returns user details if a session exists.
  - Returns 401 Unauthorized if no session is found.

### Database Management

- **POST /databases**
  - Creates a new managed PostgreSQL database for the authenticated user.
  - Request body: `{"name": "your_database_name"}`
    - `name`: Desired database name (string, required, 3-63 chars, alphanumeric, underscores, hyphens, start/end with alphanumeric, no "pg_" or "postgres" prefix).
  - Returns 201 Created with database details on success.
  - Returns 400 Bad Request for invalid name or payload.
  - Returns 401 Unauthorized if the user is not authenticated.
  - Returns 409 Conflict if the database name is already taken.
  - Returns 500 Internal Server Error for provisioning or database record issues.

- **GET /databases**
  - Lists all managed databases for the authenticated user.
  - Returns 200 OK with a list of database objects.
  - Returns 401 Unauthorized if the user is not authenticated.
  - Returns 500 Internal Server Error if retrieval fails.

- **GET /databases/{database_id}**
  - Retrieves details for a specific managed database.
  - `{database_id}`: UUID of the database.
  - Returns 200 OK with database details.
  - Returns 400 Bad Request for invalid database ID format.
  - Returns 401 Unauthorized if the user is not authenticated.
  - Returns 404 Not Found if the database doesn't exist or is not owned by the user.
  - Returns 500 Internal Server Error if retrieval fails.

- **DELETE /databases/{database_id}**
  - Soft-deletes a managed database. This action revokes user access and marks the database for potential cleanup.
  - `{database_id}`: UUID of the database.
  - Returns 200 OK with a success message and database details.
  - Returns 400 Bad Request for invalid database ID format.
  - Returns 401 Unauthorized if the user is not authenticated.
  - Returns 403 Forbidden if the user does not own the database.
  - Returns 404 Not Found if the database doesn't exist.
  - Returns 409 Conflict if deletion is already in progress.
  - Returns 500 Internal Server Error for issues during the soft-deletion process.

### Backup & Restore

- **POST /databases/{database_id}/backup**
  - Initiates an asynchronous backup job for the specified database.
  - `{database_id}`: UUID of the database.
  - Returns 202 Accepted with the backup job details.
  - Returns 400 Bad Request if the database is not active.
  - Returns 401 Unauthorized if the user is not authenticated.
  - Returns 404 Not Found if the database doesn't exist or is not owned by the user.
  - Returns 409 Conflict if another job (backup or restore) is already in progress.
  - Returns 500 Internal Server Error for provisioning issues.

- **GET /databases/{database_id}/backup/{job_id}**
  - Returns the status of a specific backup job.
  - `{database_id}`: UUID of the database.
  - `{job_id}`: UUID of the backup job.
  - Returns 200 OK with the backup job details.
  - Returns 401 Unauthorized if the user is not authenticated.
  - Returns 404 Not Found if the job doesn't exist or is not owned by the user.

- **GET /databases/{database_id}/backup/{job_id}/download**
  - Downloads the dump file for a completed backup job.
  - `{database_id}`: UUID of the database.
  - `{job_id}`: UUID of the backup job.
  - Returns 200 OK with the dump file as an attachment.
  - Returns 400 Bad Request if the backup is not yet completed.
  - Returns 401 Unauthorized if the user is not authenticated.
  - Returns 403 Forbidden if the file path is outside the backup directory.
  - Returns 404 Not Found if the job doesn't exist or is not owned by the user.

- **POST /databases/{database_id}/restore**
  - Accepts a dump file upload and starts an asynchronous restore job.
  - `{database_id}`: UUID of the database.
  - Request body: raw dump file content (binary).
  - Returns 202 Accepted with the restore job details.
  - Returns 400 Bad Request if the database is not active or upload is empty.
  - Returns 401 Unauthorized if the user is not authenticated.
  - Returns 404 Not Found if the database doesn't exist or is not owned by the user.
  - Returns 409 Conflict if another job (backup or restore) is already in progress.
  - Returns 500 Internal Server Error for provisioning issues.

- **GET /databases/{database_id}/restore/{job_id}**
  - Returns the status of a specific restore job.
  - `{database_id}`: UUID of the database.
  - `{job_id}`: UUID of the restore job.
  - Returns 200 OK with the restore job details.
  - Returns 401 Unauthorized if the user is not authenticated.
  - Returns 404 Not Found if the job doesn't exist or is not owned by the user.

### PostgreSQL User Management (for a specific database)

Endpoints are prefixed with `/databases/{database_id}`.

- **POST /databases/{database_id}/pgusers**
  - Creates a new PostgreSQL user for the specified managed database.
  - `{database_id}`: UUID of the parent managed database.
  - Request body: `{"username": "new_user", "permission_level": "read|write"}`
    - `username`: Desired PostgreSQL username (string, required, 3-63 chars, lowercase alphanumeric, underscores, start with letter, no "pg_" prefix).
    - `permission_level`: "read" or "write" (string, required).
  - Returns 201 Created with the new PG user details, including a generated password.
  - Returns 400 Bad Request for invalid payload or username.
  - Returns 401 Unauthorized if the user is not authenticated.
  - Returns 404 Not Found if the parent database doesn't exist or is not owned by the user.
  - Returns 409 Conflict if the database is not active or the PG username already exists in that database.
  - Returns 500 Internal Server Error for provisioning or database record issues.

- **GET /databases/{database_id}/pgusers**
  - Lists all PostgreSQL users for the specified managed database.
  - `{database_id}`: UUID of the parent managed database.
  - Returns 200 OK with a list of PG user objects (passwords are not included).
  - Returns 400 Bad Request for invalid database ID format.
  - Returns 401 Unauthorized if the user is not authenticated.
  - Returns 404 Not Found if the parent database doesn't exist or is not owned by the user.
  - Returns 500 Internal Server Error if retrieval fails.

- **POST /databases/{database_id}/pgusers/{pg_user_id}/regenerate-password**
  - Generates a new password for the specified PostgreSQL user.
  - `{database_id}`: UUID of the parent managed database.
  - `{pg_user_id}`: UUID of the PostgreSQL user.
  - Returns 200 OK with the new password.
  - Returns 400 Bad Request for invalid database or PG user ID format, or if the user doesn't belong to the database.
  - Returns 401 Unauthorized if the user is not authenticated.
  - Returns 404 Not Found if the parent database or PG user doesn't exist or is not owned by the user.
  - Returns 409 Conflict if the PG user is not in an active state.
  - Returns 500 Internal Server Error if password regeneration fails.

- **DELETE /databases/{database_id}/pgusers/{pg_user_id}**
  - Deletes a PostgreSQL user from the specified managed database.
  - `{database_id}`: UUID of the parent managed database.
  - `{pg_user_id}`: UUID of the PostgreSQL user.
  - Returns 204 No Content on success.
  - Returns 400 Bad Request for invalid database or PG user ID format, or if the user doesn't belong to the database.
  - Returns 401 Unauthorized if the user is not authenticated.
  - Returns 404 Not Found if the parent database or PG user doesn't exist or is not owned by the user.
  - Returns 500 Internal Server Error if deletion fails.
