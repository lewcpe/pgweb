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

	_ "github.com/lib/pq" // PostgreSQL driver
)

var (
	safeIdentifierPattern = regexp.MustCompile(`^[a-z][a-z0-9_]*$`)
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

	log.Printf("Creating pgvector extension in database %s", safeDBName)
	_, err = newDB.Exec("CREATE EXTENSION IF NOT EXISTS pgvector")
	if err != nil {
		log.Printf("Failed to create pgvector extension in %s. Attempting to drop it. Error: %v", safeDBName, err)
		_, dropErr := adminDB.Exec(fmt.Sprintf("DROP DATABASE %s", safeDBName)) // Sanitize again
		if dropErr != nil {
			log.Printf("CRITICAL: Failed to create extension AND failed to drop DB: %v. Manual cleanup for %s.", dropErr, safeDBName)
		} else {
			log.Printf("Successfully dropped database %s after failing to create extension.", safeDBName)
		}
		return fmt.Errorf("failed to create pgvector extension in database '%s': %w", safeDBName, err)
	}
	log.Printf("pgvector extension created successfully in %s.", safeDBName)
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
	createUserSQL := fmt.Sprintf("CREATE USER %s WITH PASSWORD $1", safePgUserName)
	_, err = db.Exec(createUserSQL, generatedPassword)
	if err != nil {
		return "", fmt.Errorf("failed to create user %s: %w", safePgUserName, err)
	}
	log.Printf("User %s created.", safePgUserName)

	grantConnectSQL := fmt.Sprintf("GRANT CONNECT ON DATABASE %s TO %s", targetDbName, safePgUserName) // targetDbName here is safe as it's from our system.
	_, err = db.Exec(grantConnectSQL)
	if err != nil {
		log.Printf("Warning: failed to grant CONNECT on database %s to user %s: %v", targetDbName, safePgUserName, err)
		// Proceed, as user is created. More robust error handling might be needed.
	}

	grantUsageSQL := fmt.Sprintf("GRANT USAGE ON SCHEMA public TO %s", safePgUserName)
	_, err = db.Exec(grantUsageSQL)
	if err != nil {
		log.Printf("Warning: failed to grant USAGE on schema public to user %s: %v", safePgUserName, err)
	}

	switch permissionLevel {
	case "read":
		grantSelectSQL := fmt.Sprintf("GRANT SELECT ON ALL TABLES IN SCHEMA public TO %s", safePgUserName)
		_, err = db.Exec(grantSelectSQL)
		if err != nil {
			log.Printf("Warning: failed to grant SELECT for user %s: %v", safePgUserName, err)
		}

		alterDefaultSelectSQL := fmt.Sprintf("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO %s", safePgUserName)
		_, err = db.Exec(alterDefaultSelectSQL)
		if err != nil {
			log.Printf("Warning: failed to alter default SELECT privileges for user %s: %v", safePgUserName, err)
		}
	case "write":
		grantDMLSQL := fmt.Sprintf("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %s", safePgUserName)
		_, err = db.Exec(grantDMLSQL)
		if err != nil {
			log.Printf("Warning: failed to grant DML for user %s: %v", safePgUserName, err)
		}

		alterDefaultDMLSQL := fmt.Sprintf("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %s", safePgUserName)
		_, err = db.Exec(alterDefaultDMLSQL)
		if err != nil {
			log.Printf("Warning: failed to alter default DML privileges for user %s: %v", safePgUserName, err)
		}
	default:
		return "", fmt.Errorf("invalid permission level: %s. Must be 'read' or 'write'", permissionLevel)
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

	alterUserSQL := fmt.Sprintf("ALTER USER %s WITH PASSWORD $1", safePgUserName)
	_, err = db.Exec(alterUserSQL, newGeneratedPassword)
	if err != nil {
		return "", fmt.Errorf("failed to alter user %s password: %w", safePgUserName, err)
	}

	log.Printf("Password regenerated successfully for user %s on database %s.", safePgUserName, targetDbName)
	return newGeneratedPassword, nil
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
			log.Printf("Revoking schema/table privileges for user %s on database %s", safeUsername, safeDBName)
			// Must be connected to the specific database (targetDB)
			if _, err := targetDB.Exec(fmt.Sprintf("REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %s", safeUsername)); err != nil {
				log.Printf("Warning: Failed to revoke table privileges for user %s on %s: %v", safeUsername, safeDBName, err)
			}
			if _, err := targetDB.Exec(fmt.Sprintf("REVOKE ALL PRIVILEGES ON SCHEMA public FROM %s", safeUsername)); err != nil {
				log.Printf("Warning: Failed to revoke schema privileges for user %s on %s: %v", safeUsername, safeDBName, err)
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
