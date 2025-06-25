package store

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"time"

	"pgweb-backend/models" // Assuming 'backend' is the module name

	"github.com/google/uuid"
	_ "github.com/lib/pq" // PostgreSQL driver
)

var (
	AppDB *sql.DB
)

func InitAppDB(dataSourceName string) error {
	if dataSourceName == "" {
		return errors.New("database DSN (dataSourceName) must be provided")
	}
	var err error
	AppDB, err = sql.Open("postgres", dataSourceName)
	if err != nil {
		return fmt.Errorf("failed to open database connection: %w", err)
	}
	AppDB.SetMaxOpenConns(25)
	AppDB.SetMaxIdleConns(25)
	AppDB.SetConnMaxLifetime(5 * time.Minute)
	err = AppDB.Ping()
	if err != nil {
		AppDB.Close()
		return fmt.Errorf("failed to ping database: %w", err)
	}
	log.Println("Successfully connected to the application database.")
	// Ensure application_users table exists after successful connection
	if err := CreateApplicationUsersTable(dataSourceName); err != nil {
		return fmt.Errorf("failed to ensure application_users table exists: %w", err)
	}
	return nil
}

// CreateApplicationUsersTable creates the application_users table if it doesn't exist.
func CreateApplicationUsersTable(appDbDSN string) error {
	log.Println("Attempting to create application_users table if not exists...")
	db, err := sql.Open("postgres", appDbDSN)
	if err != nil {
		return fmt.Errorf("failed to open database connection to create users table: %w", err)
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

// CreateManagedDatabasesTable creates the managed_databases table if it doesn't exist.
func CreateManagedDatabasesTable(appDbDSN string) error {
	log.Println("Attempting to create managed_databases table if not exists...")
	db, err := sql.Open("postgres", appDbDSN)
	if err != nil {
		return fmt.Errorf("failed to open database connection to create managed databases table: %w", err)
	}
	defer db.Close()

	createTableSQL := `
CREATE TABLE IF NOT EXISTS managed_databases (
	database_id UUID PRIMARY KEY,
	owner_user_id UUID NOT NULL,
	pg_database_name TEXT UNIQUE NOT NULL,
	status TEXT NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);`

	_, err = db.Exec(createTableSQL)
	if err != nil {
		return fmt.Errorf("failed to create managed_databases table: %w", err)
	}
	log.Println("managed_databases table ensured to exist.")
	return nil
}

// CreateManagedPgUsersTable creates the managed_pg_users table if it doesn't exist.
func CreateManagedPgUsersTable(appDbDSN string) error {
	log.Println("Attempting to create managed_pg_users table if not exists...")
	db, err := sql.Open("postgres", appDbDSN)
	if err != nil {
		return fmt.Errorf("failed to open database connection to create managed PG users table: %w", err)
	}
	defer db.Close()

	createTableSQL := `
CREATE TABLE IF NOT EXISTS managed_pg_users (
	pg_user_id UUID PRIMARY KEY,
	managed_database_id UUID NOT NULL,
	pg_username TEXT NOT NULL,
	permission_level TEXT NOT NULL,
	status TEXT NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
	CONSTRAINT fk_managed_database
		FOREIGN KEY(managed_database_id)
		REFERENCES managed_databases(database_id)
		ON DELETE CASCADE,
	UNIQUE (managed_database_id, pg_username)
);`

	_, err = db.Exec(createTableSQL)
	if err != nil {
		return fmt.Errorf("failed to create managed_pg_users table: %w", err)
	}
	log.Println("managed_pg_users table ensured to exist.")
	return nil
}

// --- ApplicationUser CRUD ---

func GetApplicationUserByOIDCSub(oidcSub string) (*models.ApplicationUser, error) {
	if AppDB == nil {
		return nil, errors.New("database not initialized")
	}
	if oidcSub == "" {
		return nil, errors.New("OIDC subject must be provided")
	}
	query := `SELECT internal_user_id, oidc_sub, email, created_at, updated_at FROM application_users WHERE oidc_sub = $1`
	user := &models.ApplicationUser{}
	var nullableOIDCSub sql.NullString
	err := AppDB.QueryRow(query, oidcSub).Scan(&user.InternalUserID, &nullableOIDCSub, &user.Email, &user.CreatedAt, &user.UpdatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, sql.ErrNoRows
		}
		return nil, fmt.Errorf("error querying application user by oidc_sub %s: %w", oidcSub, err)
	}
	if nullableOIDCSub.Valid {
		user.OIDCSub = nullableOIDCSub.String
	}
	return user, nil
}

func GetApplicationUserByEmail(email string) (*models.ApplicationUser, error) {
	if AppDB == nil {
		return nil, errors.New("database not initialized")
	}
	if email == "" {
		return nil, errors.New("email must be provided")
	}
	query := `SELECT internal_user_id, oidc_sub, email, created_at, updated_at FROM application_users WHERE email = $1`
	user := &models.ApplicationUser{}
	var nullableOIDCSub sql.NullString
	err := AppDB.QueryRow(query, email).Scan(&user.InternalUserID, &nullableOIDCSub, &user.Email, &user.CreatedAt, &user.UpdatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, sql.ErrNoRows
		}
		return nil, fmt.Errorf("error querying application user by email %s: %w", email, err)
	}
	if nullableOIDCSub.Valid {
		user.OIDCSub = nullableOIDCSub.String
	}
	return user, nil
}

func CreateApplicationUser(user *models.ApplicationUser) error {
	if AppDB == nil {
		return errors.New("database not initialized")
	}
	if user == nil {
		return errors.New("user must not be nil")
	}
	if user.InternalUserID == uuid.Nil {
		user.InternalUserID = uuid.New()
	}
	user.CreatedAt = time.Now()
	user.UpdatedAt = time.Now()

	var oidcSub sql.NullString
	if user.OIDCSub != "" {
		oidcSub = sql.NullString{String: user.OIDCSub, Valid: true}
	} else {
		oidcSub = sql.NullString{Valid: false}
	}

	query := `INSERT INTO application_users (internal_user_id, oidc_sub, email, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)`
	_, err := AppDB.Exec(query, user.InternalUserID, oidcSub, user.Email, user.CreatedAt, user.UpdatedAt)
	if err != nil {
		return fmt.Errorf("error creating application user with oidc_sub %s: %w", user.OIDCSub, err)
	}
	return nil
}

// --- ManagedDatabase CRUD ---

func CreateManagedDatabase(db *models.ManagedDatabase) error {
	if AppDB == nil {
		return errors.New("database not initialized")
	}
	if db == nil {
		return errors.New("database model must not be nil")
	}
	if db.DatabaseID == uuid.Nil {
		db.DatabaseID = uuid.New()
	}
	db.CreatedAt = time.Now()
	db.UpdatedAt = time.Now()
	query := `INSERT INTO managed_databases (database_id, owner_user_id, pg_database_name, status, created_at, updated_at)
	           VALUES ($1, $2, $3, $4, $5, $6)`
	_, err := AppDB.Exec(query, db.DatabaseID, db.OwnerUserID, db.PGDatabaseName, db.Status, db.CreatedAt, db.UpdatedAt)
	if err != nil {
		return fmt.Errorf("error creating managed_database record for %s: %w", db.PGDatabaseName, err)
	}
	return nil
}

func GetManagedDatabasesByOwner(ownerUserID uuid.UUID) ([]models.ManagedDatabase, error) {
	if AppDB == nil {
		return nil, errors.New("database not initialized")
	}
	query := `SELECT database_id, owner_user_id, pg_database_name, status, created_at, updated_at
	           FROM managed_databases WHERE owner_user_id = $1 ORDER BY created_at DESC`
	rows, err := AppDB.Query(query, ownerUserID)
	if err != nil {
		return nil, fmt.Errorf("error querying managed databases for owner %s: %w", ownerUserID, err)
	}
	defer rows.Close()
	var databases []models.ManagedDatabase
	for rows.Next() {
		var db models.ManagedDatabase
		if err := rows.Scan(&db.DatabaseID, &db.OwnerUserID, &db.PGDatabaseName, &db.Status, &db.CreatedAt, &db.UpdatedAt); err != nil {
			log.Printf("Error scanning managed database row: %v", err)
			continue
		}
		databases = append(databases, db)
	}
	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating managed database rows for owner %s: %w", ownerUserID, err)
	}
	return databases, nil
}

func GetManagedDatabaseByID(databaseID uuid.UUID, ownerUserID uuid.UUID) (*models.ManagedDatabase, error) {
	if AppDB == nil {
		return nil, errors.New("database not initialized")
	}
	query := `SELECT database_id, owner_user_id, pg_database_name, status, created_at, updated_at
	           FROM managed_databases WHERE database_id = $1 AND owner_user_id = $2`
	db := &models.ManagedDatabase{}
	err := AppDB.QueryRow(query, databaseID, ownerUserID).Scan(
		&db.DatabaseID, &db.OwnerUserID, &db.PGDatabaseName, &db.Status, &db.CreatedAt, &db.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, sql.ErrNoRows
		}
		return nil, fmt.Errorf("error querying managed database ID %s for owner %s: %w", databaseID, ownerUserID, err)
	}
	return db, nil
}

func UpdateManagedDatabaseStatus(databaseID uuid.UUID, ownerUserID uuid.UUID, status string) error {
	if AppDB == nil {
		return errors.New("database not initialized")
	}
	query := `UPDATE managed_databases SET status = $1, updated_at = $2
	           WHERE database_id = $3 AND owner_user_id = $4`
	result, err := AppDB.Exec(query, status, time.Now(), databaseID, ownerUserID)
	if err != nil {
		return fmt.Errorf("error updating status for managed database ID %s, owner %s: %w", databaseID, ownerUserID, err)
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("error getting rows affected after updating status for managed database ID %s: %w", databaseID, err)
	}
	if rowsAffected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func CheckIfPGDatabaseNameExists(name string) (bool, error) {
	if AppDB == nil {
		return false, errors.New("database not initialized")
	}
	query := `SELECT EXISTS(SELECT 1 FROM managed_databases WHERE pg_database_name = $1)`
	var exists bool
	err := AppDB.QueryRow(query, name).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("error checking existence of pg_database_name %s: %w", name, err)
	}
	return exists, nil
}

// CheckIfManagedDatabaseExists checks if a managed database record exists by its UUID.
func CheckIfManagedDatabaseExists(databaseID uuid.UUID) (bool, error) {
    if AppDB == nil {
        return false, errors.New("database not initialized")
    }
    query := `SELECT EXISTS(SELECT 1 FROM managed_databases WHERE database_id = $1)`
    var exists bool
    err := AppDB.QueryRow(query, databaseID).Scan(&exists)
    if err != nil {
        return false, fmt.Errorf("error checking existence of database_id %s: %w", databaseID, err)
    }
    return exists, nil
}

// --- ManagedPGUser CRUD & related functions ---

// CreateManagedPGUser creates a new PostgreSQL user record associated with a managed database.
func CreateManagedPGUser(pgUser *models.ManagedPGUser) error {
	if AppDB == nil {
		return errors.New("database not initialized")
	}
	if pgUser == nil {
		return errors.New("pgUser model must not be nil")
	}
	if pgUser.PGUserID == uuid.Nil {
		pgUser.PGUserID = uuid.New()
	}
	pgUser.CreatedAt = time.Now()
	pgUser.UpdatedAt = time.Now()
	query := `INSERT INTO managed_pg_users (pg_user_id, managed_database_id, pg_username, permission_level, status, created_at, updated_at)
	           VALUES ($1, $2, $3, $4, $5, $6, $7)`
	_, err := AppDB.Exec(query, pgUser.PGUserID, pgUser.ManagedDatabaseID, pgUser.PGUsername, pgUser.PermissionLevel, pgUser.Status, pgUser.CreatedAt, pgUser.UpdatedAt)
	if err != nil {
		return fmt.Errorf("error creating managed_pg_user record for %s in db %s: %w", pgUser.PGUsername, pgUser.ManagedDatabaseID, err)
	}
	return nil
}

// GetManagedPGUsersByDatabaseIDAndOwner retrieves PG users for a database, ensuring the requester owns the database.
func GetManagedPGUsersByDatabaseIDAndOwner(databaseID uuid.UUID, ownerUserID uuid.UUID) ([]models.ManagedPGUser, error) {
	if AppDB == nil {
		return nil, errors.New("database not initialized")
	}
	// First, verify the requesting user owns the database.
	_, err := GetManagedDatabaseByID(databaseID, ownerUserID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("database %s not found or not owned by user %s", databaseID, ownerUserID)
		}
		return nil, fmt.Errorf("error verifying database ownership for %s by user %s: %w", databaseID, ownerUserID, err)
	}

	// If ownership is confirmed, get the PG users.
	return GetManagedPGUsersByDatabaseID(databaseID)
}

// GetManagedPGUserByID retrieves a specific PG user by its ID, ensuring the requester owns the parent database.
func GetManagedPGUserByID(pgUserID uuid.UUID, ownerUserID uuid.UUID) (*models.ManagedPGUser, error) {
	if AppDB == nil {
		return nil, errors.New("database not initialized")
	}
	query := `
        SELECT u.pg_user_id, u.managed_database_id, u.pg_username, u.permission_level, u.status, u.created_at, u.updated_at
        FROM managed_pg_users u
        JOIN managed_databases d ON u.managed_database_id = d.database_id
        WHERE u.pg_user_id = $1 AND d.owner_user_id = $2`

	pgUser := &models.ManagedPGUser{}
	err := AppDB.QueryRow(query, pgUserID, ownerUserID).Scan(
		&pgUser.PGUserID, &pgUser.ManagedDatabaseID, &pgUser.PGUsername,
		&pgUser.PermissionLevel, &pgUser.Status, &pgUser.CreatedAt, &pgUser.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, sql.ErrNoRows // PGUser not found or parent DB not owned by user
		}
		return nil, fmt.Errorf("error querying managed PG user ID %s for owner %s: %w", pgUserID, ownerUserID, err)
	}
	return pgUser, nil
}

// CheckIfPGUsernameExistsInDB checks if a PostgreSQL username already exists within a specific managed database.
func CheckIfPGUsernameExistsInDB(databaseID uuid.UUID, pgUsername string) (bool, error) {
	if AppDB == nil {
		return false, errors.New("database not initialized")
	}
	query := `SELECT EXISTS(SELECT 1 FROM managed_pg_users WHERE managed_database_id = $1 AND pg_username = $2)`
	var exists bool
	err := AppDB.QueryRow(query, databaseID, pgUsername).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("error checking existence of pg_username %s in database %s: %w", pgUsername, databaseID, err)
	}
	return exists, nil
}

// GetManagedPGUsersByDatabaseID retrieves all PostgreSQL users associated with a specific managed database.
// This function does NOT check ownership of the database.
func GetManagedPGUsersByDatabaseID(databaseID uuid.UUID) ([]models.ManagedPGUser, error) {
	if AppDB == nil {
		return nil, errors.New("database not initialized")
	}
	query := `SELECT pg_user_id, managed_database_id, pg_username, permission_level, status, created_at, updated_at
	           FROM managed_pg_users WHERE managed_database_id = $1 ORDER BY created_at DESC`
	rows, err := AppDB.Query(query, databaseID)
	if err != nil {
		return nil, fmt.Errorf("error querying managed PG users for database %s: %w", databaseID, err)
	}
	defer rows.Close()
	var users []models.ManagedPGUser
	for rows.Next() {
		var user models.ManagedPGUser
		if err := rows.Scan(
			&user.PGUserID, &user.ManagedDatabaseID, &user.PGUsername,
			&user.PermissionLevel, &user.Status, &user.CreatedAt, &user.UpdatedAt,
		); err != nil {
			log.Printf("Error scanning managed PG user row for database %s: %v", databaseID, err)
			continue
		}
		users = append(users, user)
	}
	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating managed PG user rows for database %s: %w", databaseID, err)
	}
	return users, nil
}

// DeleteManagedPGUser deletes a PostgreSQL user record from the application database.
// Note: This function does NOT check for ownership. The handler is responsible for verifying
// that the user making the request owns the parent database of the PG user being deleted.
func DeleteManagedPGUser(pgUserID uuid.UUID) error {
	if AppDB == nil {
		return errors.New("database not initialized")
	}

	query := `DELETE FROM managed_pg_users WHERE pg_user_id = $1`
	result, err := AppDB.Exec(query, pgUserID)
	if err != nil {
		return fmt.Errorf("error deleting managed_pg_user with ID %s: %w", pgUserID, err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("error getting rows affected after deleting managed_pg_user with ID %s: %w", pgUserID, err)
	}

	if rowsAffected == 0 {
		return sql.ErrNoRows // Indicates the user was not found
	}

	log.Printf("Successfully deleted managed_pg_user with ID %s", pgUserID)
	return nil
}

func UpdateManagedPGUserStatusForDB(databaseID uuid.UUID, newStatus string) error {
	if AppDB == nil {
		return errors.New("database not initialized")
	}
	query := `UPDATE managed_pg_users SET status = $1, updated_at = $2 WHERE managed_database_id = $3`
	result, err := AppDB.Exec(query, newStatus, time.Now(), databaseID)
	if err != nil {
		return fmt.Errorf("error updating status for PG users of database ID %s: %w", databaseID, err)
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("error getting rows affected after updating PG user statuses for database ID %s: %w", databaseID, err)
	}
	log.Printf("%d PG user statuses updated for database ID %s to %s", rowsAffected, databaseID, newStatus)
	return nil
}
