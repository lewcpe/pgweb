# Project Title: Self-Service PostgreSQL Provisioning

## 1. Overview

This project provides a self-service platform for users to provision and manage their own isolated PostgreSQL databases. It features a Go backend API and a Svelte/TypeScript frontend. Users authenticate via OIDC (using Dex in the development environment) and can create databases, manage PostgreSQL users within those databases (with 'read' or 'write' permissions), and enable the `pgvector` extension by default for each created database.

The system is designed to be run using Docker Compose, which orchestrates the frontend, backend, PostgreSQL instance, and Dex for OIDC.

## 2. Features

*   **User Authentication:** Secure login via OIDC.
*   **Database Provisioning:** Users can create their own PostgreSQL databases.
*   **`pgvector` Enabled:** The `pgvector` extension is automatically enabled in newly created databases.
*   **User Management:** Create and manage PostgreSQL users (e.g., `db_user_1`) for each database.
*   **Permission Control:** Assign 'read' or 'write' permissions to PostgreSQL users.
*   **Password Management:** Regenerate passwords for PostgreSQL users.
*   **Database Deletion:** Soft-delete functionality for managed databases.
*   **API:** A RESTful API for all backend operations.

## 3. Tech Stack

*   **Backend:** Go (Gin framework)
*   **Frontend:** Svelte, TypeScript, Vite, Shadcn-Svelte
*   **Database:** PostgreSQL with `pgvector` extension
*   **Authentication:** OIDC (Dex for development/testing)
*   **Containerization:** Docker, Docker Compose
*   **Testing:** Cypress (for E2E tests on the API)

## 4. API Endpoints

The backend exposes several API endpoints for managing authentication, databases, and PostgreSQL users. Key endpoints include:

*   **Authentication (`/auth`):**
    *   `POST /login`: Initiates OIDC login.
    *   `GET /callback`: Handles OIDC callback.
    *   `POST /logout`: Logs out the user.
    *   `GET /me`: Retrieves current user information.
*   **Database Management (`/api/databases`):**
    *   `POST /`: Create a new database.
    *   `GET /`: List user's databases.
    *   `GET /{database_id}`: Get specific database details.
    *   `DELETE /{database_id}`: Soft-delete a database.
*   **PostgreSQL User Management (`/api/databases/{database_id}/users`):**
    *   `POST /`: Create a PostgreSQL user for a database.
    *   `GET /`: List PostgreSQL users for a database.
    *   `POST /{pg_user_id}/regenerate-password`: Regenerate password for a PostgreSQL user.

For detailed API documentation, please refer to `backend/API.md`.

## 5. Getting Started

To run the application suite (frontend, backend, PostgreSQL, Dex), use Docker Compose:

1.  **Prerequisites:**
    *   Docker installed and running.
    *   Docker Compose installed.
    *   Ensure ports `5432`, `5556`, `8080`, `5173` are available on your host machine.

2.  **Configuration:**
    *   A `dex_config.yml` file is required in the root directory for Dex to function. An example `dex_config.test.yml` is provided, which can be copied or adapted:
        ```bash
        cp dex_config.test.yml dex_config.yml
        ```
    *   The backend service requires environment variables for database connections and OIDC. These are pre-configured in the `docker-compose.yml` file for the development environment.
        *   `PG_ADMIN_DSN`: Connects to the main PostgreSQL instance.
        *   `OIDC_ISSUER_URL`: Points to the Dex service.
        *   `OIDC_CLIENT_ID` & `OIDC_CLIENT_SECRET`: Credentials for the OIDC client.
    *   The frontend service uses Vite environment variables (e.g., `VITE_API_BASE_URL`) which are also set in `docker-compose.yml`.

3.  **Build and Run:**
    Navigate to the project root directory and run:
    ```bash
    docker compose -f docker-compose.yml up --build
    ```
    This command will:
    *   Build the Docker images for the `backend` and `frontend` services if they don't exist or if their context has changed.
    *   Start all services defined in `docker-compose.yml`: `postgres`, `dex`, `backend`, `frontend`.

4.  **Accessing Services:**
    *   **Frontend Application:** `http://localhost:5173`
    *   **Backend API:** `http://localhost:8080`
    *   **Dex OIDC Provider:** `http://localhost:5556/dex`
    *   **PostgreSQL (admin):** Connect via `psql -h localhost -p 5432 -U admin_user -d admin_db` (password: `admin_password` as per `docker-compose.yml`)

## 6. Testing

The project includes end-to-end tests for the backend API using Cypress. These tests are defined in the `tests/cypress` directory and can be run in a Dockerized environment using `compose.test.yml`.

1.  **Prerequisites:**
    *   Docker installed and running.
    *   Docker Compose installed.

2.  **Configuration for Testing:**
    *   The test environment uses its own Dex configuration: `dex_config.test.yml`. This is automatically mounted by `compose.test.yml`.
    *   The backend service in the test environment (`pgweb_test_backend`) is configured with specific test environment variables (e.g., test database connection strings, test OIDC client details).

3.  **Running Tests:**
    Navigate to the project root directory and run:
    ```bash
    docker compose -f compose.test.yml up --build
    ```
    This command will:
    *   Build images if necessary.
    *   Start `postgres`, `dex`, and `backend` services configured for testing.
    *   Run the Cypress tests in the `cypress` service. Test results will be output to the console.
    *   The services will typically shut down after the tests complete.

    To run tests again without rebuilding (if no code changes):
    ```bash
    docker compose -f compose.test.yml up cypress
    ```

    To run Cypress in interactive mode (ensure other services from `compose.test.yml` are running, e.g., `docker compose -f compose.test.yml up -d backend`):
    ```bash
    cd tests
    npx cypress open --config-file cypress.config.js
    ```
    *(Note: Ensure the `CYPRESS_BASE_URL` in `compose.test.yml` or your local Cypress config points to the correct backend URL for testing, typically `http://backend:8080` when run via compose, or `http://localhost:8080` if backend is run directly on host for local Cypress development).*

## 7. Project Structure

```
.
├── .github/workflows/    # GitHub Actions workflows (CI, Docker builds)
├── backend/              # Go backend source code
│   ├── Dockerfile        # Dockerfile for backend
│   ├── API.md            # Detailed API documentation
│   └── ...
├── frontend/             # Svelte/TS frontend source code
│   ├── Dockerfile        # Dockerfile for frontend
│   └── ...
├── tests/                # Cypress E2E tests
│   └── cypress/
├── compose.test.yml      # Docker Compose for running tests
├── dex_config.yml        # Dex OIDC provider configuration (user provided)
├── dex_config.test.yml   # Dex OIDC provider configuration for tests
├── docker-compose.yml    # Docker Compose for development environment
├── PROJECT_PLAN.md       # Project planning document
└── README.md             # This file
```

## 8. Docker Image Building Workflow

The project includes a GitHub Actions workflow defined in `.github/workflows/docker-build.yml`. This workflow automatically builds Docker images for the `backend` and `frontend` services upon pushes and pull requests to the `main` branch.

*(The plan includes updating this workflow to push images to a container registry.)*
