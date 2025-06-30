This document summarizes the process for creating a secure, isolated user and database in PostgreSQL, suitable for automated processing and analysis. It covers foundational principles, a hardened security script, architectural limitations, and multi-tenancy patterns.

### 1\. Core PostgreSQL Security Concepts

  * **Unified Role System:** PostgreSQL uses a single "role" concept. A "user" is simply a role that has been granted the `LOGIN` privilege.[1, 2] `CREATE USER` is an alias for `CREATE ROLE... WITH LOGIN`.[3, 4]
  * **Three-Gate Access Hierarchy:** To access data, a role needs to pass through three permission gates in sequence:
    1.  **Database `CONNECT`:** Permission to establish a connection to the database itself.[1, 5]
    2.  **Schema `USAGE`:** Permission to "look up" or access objects within a schema. This is a prerequisite for any object-level access.[6, 7]
    3.  **Object Privileges (`SELECT`, `INSERT`, etc.):** Permissions to read from or write to specific tables, sequences, and other objects.[8, 5]
  * **The `PUBLIC` Role and Schema:** Every role is a member of the implicit `PUBLIC` group.[1] By default, `PUBLIC` is granted `CONNECT` on new databases.[9] In PostgreSQL versions before 15, `PUBLIC` was also granted `CREATE` and `USAGE` on the `public` schema, a significant security risk that allowed any user to create objects in a shared namespace.[10, 11]

### 2\. Hardened Security Model: The "Revoke-First" Principle

A secure configuration is achieved by first revoking default permissive grants and then explicitly granting only the necessary privileges. This follows the principle of least privilege.[12]

**Key Steps:**

1.  **Revoke Default Privileges:** Immediately after creating a database, connect to it and revoke all default permissions from the `PUBLIC` role. This is the most critical step for isolation.
      * `REVOKE CONNECT ON DATABASE your_database_name FROM PUBLIC;` [1, 9]
      * `REVOKE ALL ON SCHEMA public FROM PUBLIC;` [12, 10]
2.  **Grant Specific Privileges:** Grant the minimal required permissions to the application user.
      * `GRANT CONNECT ON DATABASE your_database_name TO your_user;`
      * `GRANT USAGE ON SCHEMA public TO your_user;`
      * `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO your_user;`
      * `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO your_user;`
3.  **Secure Future Objects:** Use `ALTER DEFAULT PRIVILEGES` to ensure that any new tables or sequences created in the schema will automatically have the correct permissions granted to the application user. This is mandatory for applications with evolving schemas.[13, 14]
      * `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO your_user;`
      * `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO your_user;`

### 3\. Definitive Provisioning Script

The following SQL script provides a complete, production-ready template for creating an isolated database and user. It must be run by a superuser.

```sql
-- Step 1: Create the application role (user) with a password and no special privileges.
CREATE USER my_app_user WITH ENCRYPTED PASSWORD 'a_very_strong_password';

-- Step 2: Create the application database.
CREATE DATABASE my_app_db;

-- Step 3: Connect to the new database to apply subsequent permissions.
-- In psql: \c my_app_db

-- Step 4: Harden the environment by revoking default public access.
REVOKE CONNECT ON DATABASE my_app_db FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM PUBLIC;

-- Step 5: Grant minimal, explicit privileges to the application user.
-- Gate 1: Allow connection to the database.
GRANT CONNECT ON DATABASE my_app_db TO my_app_user;

-- Gate 2: Allow access to the schema.
GRANT USAGE ON SCHEMA public TO my_app_user;

-- Gate 3: Grant read/write permissions on existing tables and sequences.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO my_app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO my_app_user;

-- Step 6: Set default privileges for future objects (run by the role that creates objects).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO my_app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO my_app_user;
```

### 4\. Limitations and Multi-Tenancy Architectures

  * **Database Visibility:** The security model described prevents a user from *connecting to* or *accessing data in* other databases. However, it does **not** prevent the user from seeing the *names* of other databases on the same server instance (e.g., by querying the `pg_database` system catalog).[9]
  * **Multi-Tenancy Patterns:** Achieving true tenant isolation is a multi-tenancy problem. There are three primary architectural patterns, each with different trade-offs:
    1.  **Database-per-Tenant:** Highest data isolation, but high resource overhead and management complexity. Does not solve the database visibility issue on a shared instance.[15, 16]
    2.  **Schema-per-Tenant:** A good balance of isolation and resource efficiency. All tenants share one database but have separate schemas. Can become complex to manage at a very large scale.[17, 16]
    3.  **Shared Schema with Row-Level Security (RLS):** Most resource-efficient and scalable. All tenants share tables, and a `tenant_id` column with RLS policies enforces data separation. Requires careful implementation to prevent data leakage.[18, 19]