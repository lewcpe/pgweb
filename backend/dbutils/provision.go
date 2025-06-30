package dbutils

import (
	"crypto/rand"
	"database/sql"
	"fmt"
	"log"
	"math/big"
	"regexp"
	"strings"
	"time"

	"pgweb-backend/models" // To use models.ManagedPGUser

	pq "github.com/lib/pq" // PostgreSQL driver
)

var (
	safeIdentifierPattern = regexp.MustCompile(`^[a-z][a-z0-9_]*`)
	// Character set for password generation
	passwordChars  = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*"
	passwordLength = 16
)

// sanitizeIdentifier cleans a string to be a safe PostgreSQL identifier.
func sanitizeIdentifier(name string) (string, error) {
	name = strings.ToLower(name)
	// Replace common problematic characters first
	name = strings.ReplaceAll(name, "-", "_")
	name = strings.ReplaceAll(name, " ", "_")

	var sb strings.Builder
	for _, r := range name {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '_' {
			sb.WriteRune(r)
		}
	}
	name = sb.String()

	if len(name) == 0 {
		return "", fmt.Errorf("sanitized name is empty")
	}
	if !(name[0] >= 'a' && name[0] <= 'z') {
		// If it doesn't start with a letter, prefix one. This is a simple fix.
		// A better approach might be to reject or require user to fix.
		name = "u_" + name
	}

	if len(name) > 63 {
		name = name[:63]
	}
	name = strings.TrimRight(name, "_")
	if len(name) == 0 { // Re-check after potential trim
		return "", fmt.Errorf("sanitized name became empty after trimming trailing underscores")
	}
	if !(name[0] >= 'a' && name[0] <= 'z') { // Re-check start char
		return "", fmt.Errorf("sanitized name '%s' does not start with a letter after processing", name)
	}

	if !safeIdentifierPattern.MatchString(name) {
		return "", fmt.Errorf("sanitized name '%s' does not match safe identifier pattern ^[a-z][a-z0-9_]*$", name)
	}

	return name, nil
}

// generateStrongPassword creates a random password.
func generateStrongPassword(length int) (string, error) {
	if length <= 0 {
		return "", fmt.Errorf("password length must be positive")
	}

	result := make([]byte, length)
	charSetLength := big.NewInt(int64(len(passwordChars)))

	for i := 0; i < length; i++ {
		num, err := rand.Int(rand.Reader, charSetLength)
		if err != nil {
			return "", fmt.Errorf("failed to generate random number for password: %w", err)
		}
		result[i] = passwordChars[num.Int64()]
	}
	return string(result), nil
}

func connectToDB(dsn string) (*sql.DB, error) {
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open database connection: %w", err)
	}
	db.SetMaxOpenConns(5)
	db.SetMaxIdleConns(1)
	db.SetConnMaxLifetime(1 * time.Minute)
	err = db.Ping()
	if err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}
	return db, nil
}

// getSpecificDatabaseDSN modifies a general DSN to connect to a specific database.
func getSpecificDatabaseDSN(generalDSN, dbName string) string {
	var specificDSN string
	if strings.Contains(generalDSN, "dbname=") {
		re := regexp.MustCompile(`dbname=\S+`)
		specificDSN = re.ReplaceAllString(generalDSN, "dbname="+dbName)
	} else {
		separator := "?"
		if strings.Contains(generalDSN, "?") { // check if query params already exist
			separator = "&"
		}
		specificDSN = fmt.Sprintf("%s%sdbname=%s", generalDSN, separator, dbName)
		if !strings.Contains(specificDSN, "sslmode=") {
			specificDSN += "&sslmode=prefer"
		}
	}
	return specificDSN
}

// CreatePostgresDatabase creates a new database and enables pgvector extension.
func CreatePostgresDatabase(pgAdminDSN, dbName string) error {
	log.Printf("Attempting to create database: %s", dbName)
	safeDBName, err := sanitizeIdentifier(dbName)
	if err != nil {
		return fmt.Errorf("invalid database name '%s': %w", dbName, err)
	}
	// Note: PROJECT_PLAN.md says user chosen name, globally unique.
	// The handler should ensure `dbName` is already globally unique and valid before calling this.
	// This sanitization is a safeguard.

	adminDB, err := connectToDB(pgAdminDSN)
	if err != nil {
		return fmt.Errorf("failed to connect to admin database: %w", err)
	}
	defer adminDB.Close()

	var exists bool
	// Parameterized query for checking database existence
	err = adminDB.QueryRow("SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1)", safeDBName).Scan(&exists)
	if err != nil {
		return fmt.Errorf("failed to check if database '%s' exists: %w", safeDBName, err)
	}
	if exists {
		return fmt.Errorf("database '%s' already exists", safeDBName)
	}

	log.Printf("Executing CREATE DATABASE %s", safeDBName)
	// Identifiers like database names cannot be parameterized directly in CREATE DATABASE.
	// Sanitize rigorously and use fmt.Sprintf.
	_, err = adminDB.Exec(fmt.Sprintf("CREATE DATABASE %s", safeDBName))
	if err != nil {
		return fmt.Errorf("failed to execute CREATE DATABASE %s: %w", safeDBName, err)
	}
	log.Printf("Database %s created successfully.", safeDBName)

	newDbDSN := getSpecificDatabaseDSN(pgAdminDSN, safeDBName)
	log.Printf("Connecting to new database %s using DSN: %s", safeDBName, newDbDSN)

	newDB, err := connectToDB(newDbDSN)
	if err != nil {
		log.Printf("Failed to connect to newly created database %s. Attempting to drop it.", safeDBName)
		_, dropErr := adminDB.Exec(fmt.Sprintf("DROP DATABASE %s", safeDBName)) // Sanitize again
		if dropErr != nil {
			log.Printf("CRITICAL: Failed to connect to new DB AND failed to drop it: %v. Manual cleanup for %s.", dropErr, safeDBName)
		} else {
			log.Printf("Successfully dropped database %s after failing to connect to it.", safeDBName)
		}
		return fmt.Errorf("failed to connect to newly created database '%s': %w", safeDBName, err)
	}
	defer newDB.Close()

	// Harden the database by revoking default privileges from PUBLIC, as per PGDOC.md.
	log.Printf("Revoking default public access on database %s", safeDBName)
	if _, err := newDB.Exec(fmt.Sprintf("REVOKE CONNECT ON DATABASE %s FROM PUBLIC", safeDBName)); err != nil {
		return fmt.Errorf("failed to revoke CONNECT on database from PUBLIC: %w", err)
	}
	if _, err := newDB.Exec("REVOKE ALL ON SCHEMA public FROM PUBLIC"); err != nil {
		return fmt.Errorf("failed to revoke ALL on public schema from PUBLIC: %w", err)
	}

	log.Printf("Creating vector extension in database %s", safeDBName)
	_, err = newDB.Exec("CREATE EXTENSION IF NOT EXISTS vector")
	if err != nil {
		log.Printf("Failed to create vector extension in %s. Attempting to drop it. Error: %v", safeDBName, err)
		_, dropErr := adminDB.Exec(fmt.Sprintf("DROP DATABASE %s", safeDBName)) // Sanitize again
		if dropErr != nil {
			log.Printf("CRITICAL: Failed to create extension AND failed to drop DB: %v. Manual cleanup for %s.", dropErr, safeDBName)
		} else {
			log.Printf("Successfully dropped database %s after failing to create extension.", safeDBName)
		}
		return fmt.Errorf("failed to create vector extension in database '%s': %w", safeDBName, err)
	}
	log.Printf("vector extension created successfully in %s.", safeDBName)

	// Harden the database by revoking default privileges from PUBLIC, as per PGDOC.md.
	log.Printf("Revoking default public access on database %s", safeDBName)
	if _, err := newDB.Exec(fmt.Sprintf("REVOKE CONNECT ON DATABASE %s FROM PUBLIC", safeDBName)); err != nil {
		return fmt.Errorf("failed to revoke CONNECT on database from PUBLIC: %w", err)
	}
	if _, err := newDB.Exec("REVOKE ALL ON SCHEMA public FROM PUBLIC"); err != nil {
		return fmt.Errorf("failed to revoke ALL on public schema from PUBLIC: %w", err)
	}

	// New: Create read and write roles for the database
	readRole := fmt.Sprintf("%s_read", safeDBName)
	writeRole := fmt.Sprintf("%s_write", safeDBName)

	log.Printf("Creating role %s for database %s", readRole, safeDBName)
	_, err = newDB.Exec(fmt.Sprintf("CREATE ROLE %s", readRole))
	if err != nil {
		return fmt.Errorf("failed to create read role %s: %w", readRole, err)
	}

	log.Printf("Creating role %s for database %s", writeRole, safeDBName)
	_, err = newDB.Exec(fmt.Sprintf("CREATE ROLE %s", writeRole))
	if err != nil {
		return fmt.Errorf("failed to create write role %s: %w", writeRole, err)
	}

	// Grant CONNECT on the database to both roles
	_, err = newDB.Exec(fmt.Sprintf("GRANT CONNECT ON DATABASE %s TO %s, %s", safeDBName, readRole, writeRole))
	if err != nil {
		return fmt.Errorf("failed to grant CONNECT to roles: %w", err)
	}

	// --- Schema and Role Permissions ---

	// Grant basic USAGE on the public schema to both roles.
	_, err = newDB.Exec(fmt.Sprintf("GRANT USAGE ON SCHEMA public TO %s, %s", readRole, writeRole))
	if err != nil {
		return fmt.Errorf("failed to grant USAGE on public schema to roles: %w", err)
	}

	// Grant CREATE permission on the public schema to the write role, so it can create tables.
	_, err = newDB.Exec(fmt.Sprintf("GRANT CREATE ON SCHEMA public TO %s", writeRole))
	if err != nil {
		return fmt.Errorf("failed to grant CREATE on public schema to write role %s: %w", writeRole, err)
	}

	// Grant privileges on existing objects (none at this point, but good practice).
	_, err = newDB.Exec(fmt.Sprintf("GRANT SELECT ON ALL TABLES IN SCHEMA public TO %s", readRole))
	if err != nil {
		return fmt.Errorf("failed to grant SELECT on existing public tables to read role %s: %w", readRole, err)
	}
	_, err = newDB.Exec(fmt.Sprintf("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %s", readRole))
	if err != nil {
		return fmt.Errorf("failed to grant SELECT on existing public sequences to read role %s: %w", readRole, err)
	}
	_, err = newDB.Exec(fmt.Sprintf("GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO %s", writeRole))
	if err != nil {
		return fmt.Errorf("failed to grant ALL on existing public tables to write role %s: %w", writeRole, err)
	}
	_, err = newDB.Exec(fmt.Sprintf("GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO %s", writeRole))
	if err != nil {
		return fmt.Errorf("failed to grant ALL on existing public sequences to write role %s: %w", writeRole, err)
	}

	// --- Default Privileges for Future Objects ---
	var currentUser string
	err = newDB.QueryRow("SELECT current_user").Scan(&currentUser)
	if err != nil {
		return fmt.Errorf("failed to get current user to set default privileges: %w", err)
	}

	log.Printf("Temporarily granting role %s to admin user %s to set default privileges", writeRole, currentUser)
	_, err = newDB.Exec(fmt.Sprintf("GRANT %s TO %s", writeRole, currentUser))
	if err != nil {
		return fmt.Errorf("failed to grant write role to admin user '%s': %w", currentUser, err)
	}

	// For objects created by writeRole, grant SELECT to PUBLIC.
	// This is safe because only authenticated roles can connect to the database.
	_, err = newDB.Exec(fmt.Sprintf("ALTER DEFAULT PRIVILEGES FOR ROLE %s IN SCHEMA public GRANT SELECT ON TABLES TO PUBLIC", writeRole))
	if err != nil {
		return fmt.Errorf("failed to set default SELECT on tables for PUBLIC: %w", err)
	}
	_, err = newDB.Exec(fmt.Sprintf("ALTER DEFAULT PRIVILEGES FOR ROLE %s IN SCHEMA public GRANT SELECT ON SEQUENCES TO PUBLIC", writeRole))
	if err != nil {
		return fmt.Errorf("failed to set default SELECT on sequences for PUBLIC: %w", err)
	}

	// Grant write-level privileges only to the write role.
	_, err = newDB.Exec(fmt.Sprintf("ALTER DEFAULT PRIVILEGES FOR ROLE %s IN SCHEMA public GRANT INSERT, UPDATE, DELETE, TRUNCATE ON TABLES TO %s", writeRole, writeRole))
	if err != nil {
		return fmt.Errorf("failed to set default write privileges on tables for write role: %w", err)
	}
	_, err = newDB.Exec(fmt.Sprintf("ALTER DEFAULT PRIVILEGES FOR ROLE %s IN SCHEMA public GRANT UPDATE ON SEQUENCES TO %s", writeRole, writeRole))
	if err != nil {
		return fmt.Errorf("failed to set default write privileges on sequences for write role: %w", err)
	}

	log.Printf("Revoking role %s from admin user %s", writeRole, currentUser)
	_, err = newDB.Exec(fmt.Sprintf("REVOKE %s FROM %s", writeRole, currentUser))
	if err != nil {
		log.Printf("Warning: failed to revoke write role from admin user '%s': %v", currentUser, err)
	}

	return nil
}

// CreateApplicationUsersTable creates the application_users table if it doesn't exist.
func CreateApplicationUsersTable(appDbDSN string) error {
	log.Println("Attempting to create application_users table if not exists...")
	db, err := connectToDB(appDbDSN)
	if err != nil {
		return fmt.Errorf("failed to connect to application database to create users table: %w", err)
	}
	defer db.Close()

	createTableSQL := `
	CREATE TABLE IF NOT EXISTS application_users (
		internal_user_id UUID PRIMARY KEY,
		oidc_sub TEXT UNIQUE,
		email TEXT UNIQUE NOT NULL,
		created_at TIMESTAMP WITH TIME ZONE NOT NULL,
		updated_at TIMESTAMP WITH TIME ZONE NOT NULL
	);`

	_, err = db.Exec(createTableSQL)
	if err != nil {
		return fmt.Errorf("failed to create application_users table: %w", err)
	}
	log.Println("application_users table ensured to exist.")
	return nil
}

// CreatePostgresUser creates a new PostgreSQL user with specified permissions.
func CreatePostgresUser(pgAdminDSN, targetDbName, pgUserName, permissionLevel string) (string, error) {
	log.Printf("Attempting to create user %s for database %s with permission %s", pgUserName, targetDbName, permissionLevel)

	safePgUserName, err := sanitizeIdentifier(pgUserName)
	if err != nil {
		return "", fmt.Errorf("invalid PostgreSQL username '%s': %w", pgUserName, err)
	}
	// As with dbName, handler should ensure pgUserName is valid and unique within the target DB.

	generatedPassword, err := generateStrongPassword(passwordLength)
	if err != nil {
		return "", fmt.Errorf("failed to generate password for user %s: %w", safePgUserName, err)
	}

	targetDbDSN := getSpecificDatabaseDSN(pgAdminDSN, targetDbName)
	db, err := connectToDB(targetDbDSN)
	if err != nil {
		return "", fmt.Errorf("failed to connect to target database %s for user creation: %w", targetDbName, err)
	}
	defer db.Close()

	// Use parameterized queries where possible, but identifiers and keywords often require fmt.Sprintf.
	// Ensure safePgUserName is thoroughly sanitized. Passwords should always be parameterized.
	// Passwords should be quoted as literals in CREATE USER statements.
	// The pq driver's QuoteLiteral function handles proper escaping.
	quotedPassword := pq.QuoteLiteral(generatedPassword)
	createUserSQL := fmt.Sprintf("CREATE USER %s WITH PASSWORD %s NOSUPERUSER NOCREATEDB NOCREATEROLE", safePgUserName, quotedPassword)
	_, err = db.Exec(createUserSQL)
	if err != nil {
		return "", fmt.Errorf("failed to create user %s: %w", safePgUserName, err)
	}
	log.Printf("User %s created.", safePgUserName)

	// Grant the appropriate role to the user
	var roleName string
	switch permissionLevel {
	case "read":
		roleName = fmt.Sprintf("%s_read", targetDbName)
	case "write":
		roleName = fmt.Sprintf("%s_write", targetDbName)
	}

	grantRoleSQL := fmt.Sprintf("GRANT %s TO %s", roleName, safePgUserName)
	_, err = db.Exec(grantRoleSQL)
	if err != nil {
		// Attempt to drop the user if role grant fails to avoid inconsistent state
		log.Printf("Failed to grant role to user %s: %v. Attempting to drop user.", safePgUserName, err)
		_, dropUserErr := db.Exec(fmt.Sprintf("DROP USER IF EXISTS %s", safePgUserName))
		if dropUserErr != nil {
			log.Printf("CRITICAL: Failed to grant role AND failed to drop user: %v. Manual cleanup for user %s.", dropUserErr, safePgUserName)
		}
		return "", fmt.Errorf("failed to grant role %s to user %s: %w", roleName, safePgUserName, err)
	}
	log.Printf("Role %s granted to user %s.", roleName, safePgUserName)

	// For write users, set their default role to the writeRole.
	// This ensures that objects they create are owned by the writeRole, not the user.
	if permissionLevel == "write" {
		setRoleSQL := fmt.Sprintf("ALTER ROLE %s SET ROLE %s", safePgUserName, roleName)
		if _, err := db.Exec(setRoleSQL); err != nil {
			return "", fmt.Errorf("failed to set default role for user %s: %w", safePgUserName, err)
		}
		log.Printf("Set default role for user %s to %s.", safePgUserName, roleName)

		// Also set the search path to ensure objects are created in the public schema.
		setSearchPathSQL := fmt.Sprintf("ALTER ROLE %s SET search_path TO public", safePgUserName)
		if _, err := db.Exec(setSearchPathSQL); err != nil {
			log.Printf("Warning: failed to set search_path for user %s: %v", safePgUserName, err)
		}
	}
	log.Printf("Permissions granted for user %s on database %s with level %s.", safePgUserName, targetDbName, permissionLevel)
	return generatedPassword, nil
}

// RegeneratePostgresUserPassword generates a new password for a PostgreSQL user.
func RegeneratePostgresUserPassword(pgAdminDSN, targetDbName, pgUserName string) (string, error) {
	log.Printf("Attempting to regenerate password for user %s on database %s", pgUserName, targetDbName)
	safePgUserName, err := sanitizeIdentifier(pgUserName)
	if err != nil {
		return "", fmt.Errorf("invalid PostgreSQL username '%s' for password regeneration: %w", pgUserName, err)
	}

	newGeneratedPassword, err := generateStrongPassword(passwordLength)
	if err != nil {
		return "", fmt.Errorf("failed to generate new password for user %s: %w", safePgUserName, err)
	}

	targetDbDSN := getSpecificDatabaseDSN(pgAdminDSN, targetDbName)
	db, err := connectToDB(targetDbDSN)
	if err != nil {
		return "", fmt.Errorf("failed to connect to target database %s for password regeneration: %w", targetDbName, err)
	}
	defer db.Close()

	// The password must be properly quoted to be included in the DDL statement.
	// Using a parameterized query for the password in an ALTER USER is not standard.
	// QuoteLiteral handles escaping correctly.
	quotedPassword := pq.QuoteLiteral(newGeneratedPassword)
	alterUserSQL := fmt.Sprintf("ALTER USER %s WITH PASSWORD %s", safePgUserName, quotedPassword)

	_, err = db.Exec(alterUserSQL)
	if err != nil {
		return "", fmt.Errorf("failed to alter user %s password: %w", safePgUserName, err)
	}

	log.Printf("Password regenerated successfully for user %s on database %s.", safePgUserName, targetDbName)
	return newGeneratedPassword, nil
}

// DeletePostgresUser drops a PostgreSQL user and revokes their privileges.
func DeletePostgresUser(pgAdminDSN, targetDbName, pgUserName string) error {
	log.Printf("Attempting to delete user %s from database %s", pgUserName, targetDbName)

	safePgUserName, err := sanitizeIdentifier(pgUserName)
	if err != nil {
		return fmt.Errorf("invalid PostgreSQL username '%s' for deletion: %w", pgUserName, err)
	}

	targetDbDSN := getSpecificDatabaseDSN(pgAdminDSN, targetDbName)
	db, err := connectToDB(targetDbDSN)
	if err != nil {
		return fmt.Errorf("failed to connect to target database %s for user deletion: %w", targetDbName, err)
	}
	defer db.Close()

	dropOwnedSQL := fmt.Sprintf("DROP OWNED BY %s", safePgUserName)
	if _, err := db.Exec(dropOwnedSQL); err != nil {
		log.Printf("Warning: could not drop objects owned by %s: %v", safePgUserName, err)
	}

	// Revoke roles from the user
	revokeReadRoleSQL := fmt.Sprintf("REVOKE %s_read FROM %s", targetDbName, safePgUserName)
	if _, err := db.Exec(revokeReadRoleSQL); err != nil {
		log.Printf("Warning: failed to revoke read role from user %s: %v", safePgUserName, err)
	}
	revokeWriteRoleSQL := fmt.Sprintf("REVOKE %s_write FROM %s", targetDbName, safePgUserName)
	if _, err := db.Exec(revokeWriteRoleSQL); err != nil {
		log.Printf("Warning: failed to revoke write role from user %s: %v", safePgUserName, err)
	}

	// Finally, drop the user.
	dropUserSQL := fmt.Sprintf("DROP USER IF EXISTS %s", safePgUserName)
	if _, err := db.Exec(dropUserSQL); err != nil {
		return fmt.Errorf("failed to drop user %s: %w", safePgUserName, err)
	}

	log.Printf("User %s deleted successfully from database %s.", safePgUserName, targetDbName)
	return nil
}

// SoftDeletePostgresDatabase revokes user privileges on a database.
func SoftDeletePostgresDatabase(pgAdminDSN, dbName string, pgUsers []models.ManagedPGUser) error {
	log.Printf("Attempting to soft delete database (revoke access): %s", dbName)
	safeDBName, err := sanitizeIdentifier(dbName)
	if err != nil {
		return fmt.Errorf("invalid database name '%s' for soft delete: %w", dbName, err)
	}

	targetDbDSN := getSpecificDatabaseDSN(pgAdminDSN, safeDBName)
	targetDB, err := connectToDB(targetDbDSN)
	if err != nil {
		log.Printf("Warning: Failed to connect to target database %s for full soft delete: %v. Will attempt to revoke CONNECT only.", safeDBName, err)
	} else {
		defer targetDB.Close()
	}

	adminDB, err := connectToDB(pgAdminDSN)
	if err != nil {
		return fmt.Errorf("failed to connect to admin database for soft delete: %w", err)
	}
	defer adminDB.Close()

	for _, user := range pgUsers {
		safeUsername, err := sanitizeIdentifier(user.PGUsername)
		if err != nil {
			log.Printf("Skipping user %s due to invalid username for soft delete: %v", user.PGUsername, err)
			continue
		}

		if targetDB != nil {
			log.Printf("Revoking roles for user %s on database %s", safeUsername, safeDBName)
			// Revoke read role
			revokeReadRoleSQL := fmt.Sprintf("REVOKE %s_read FROM %s", safeDBName, safeUsername)
			if _, err := targetDB.Exec(revokeReadRoleSQL); err != nil {
				log.Printf("Warning: Failed to revoke read role from user %s on %s: %v", safeUsername, safeDBName, err)
			}
			// Revoke write role
			revokeWriteRoleSQL := fmt.Sprintf("REVOKE %s_write FROM %s", safeDBName, safeUsername)
			if _, err := targetDB.Exec(revokeWriteRoleSQL); err != nil {
				log.Printf("Warning: Failed to revoke write role from user %s on %s: %v", safeUsername, safeDBName, err)
			}
		}

		// REVOKE CONNECT must be run from a different database (adminDB)
		log.Printf("Revoking CONNECT privilege for user %s on database %s", safeUsername, safeDBName)
		if _, err := adminDB.Exec(fmt.Sprintf("REVOKE CONNECT ON DATABASE %s FROM %s", safeDBName, safeUsername)); err != nil {
			log.Printf("Warning: Failed to revoke connect for user %s on %s: %v", safeUsername, safeDBName, err)
		}
	}

	log.Printf("Soft delete process completed for database %s (privileges revoked).", safeDBName)
	return nil
}
