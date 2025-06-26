# Frontend Specification

This document outlines the functionality of the pgweb frontend.

## Overview

The frontend is a single-page application (SPA) that allows users to manage their PostgreSQL databases. Since authentication is handled by an external `oauth2-proxy`, the frontend assumes that all users accessing it are already authenticated.

## Core Functionalities

### 1. Database Management

-   **List Databases:**
    -   Users can view a list of their created databases.
    -   The list displays the database name, its current status (e.g., `active`, `pending_creation`), and the creation date.
    -   From the list, users can navigate to create a new database or view the details of an existing one.

-   **Create Database:**
    -   Users can create a new PostgreSQL database by providing a name.
    -   The database name is subject to validation rules (e.g., length, allowed characters, restricted prefixes).

-   **View Database Details:**
    -   Users can view detailed information about a specific database.
    -   This includes its status, owner, creation date, and other metadata.

### 2. PostgreSQL User Management (within a Database)

-   **List PostgreSQL Users:**
    -   Within the details view of a database, users can see a list of all PostgreSQL users associated with that database.
    -   The list shows the username, permission level (`read` or `write`), and status.

-   **Create PostgreSQL User:**
    -   Users can create new PostgreSQL users for a database.
    -   This requires specifying a username and a permission level (`read` or `write`).
    -   Upon creation, a password for the new user is displayed.

-   **Regenerate PostgreSQL User Password:**
    -   Users can regenerate the password for an existing PostgreSQL user.
    -   The new password is displayed upon regeneration.

### 3. User Interface Components

-   **Theme Toggle:**
    -   A theme toggle button allows users to switch between light, dark, and system default themes.
    -   The selected theme is persisted in the browser's local storage.

-   **Navigation:**
    -   The application uses a simple routing system to navigate between different views (e.g., Dashboard, Database List, Database Detail).

## API Interaction

The frontend communicates with a backend API to perform all its functions. The key API endpoints used are:

-   `GET /me`: Fetches the current user's information.
-   `GET /databases`: Lists all databases for the current user.
-   `POST /databases`: Creates a new database.
-   `GET /databases/{databaseId}`: Retrieves details for a specific database.
-   `DELETE /databases/{databaseId}`: Deletes a database.
-   `GET /databases/{databaseId}/pgusers`: Lists all PostgreSQL users for a database.
-   `POST /databases/{databaseId}/pgusers`: Creates a new PostgreSQL user for a database.
-   `POST /databases/{databaseId}/pgusers/{pgUserId}/regenerate-password`: Regenerates a password for a PostgreSQL user.
