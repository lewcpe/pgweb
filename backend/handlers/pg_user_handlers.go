package handlers

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"
	"pgweb-backend/auth"
	"pgweb-backend/dbutils"
	"pgweb-backend/models"
	"pgweb-backend/store"
	"regexp"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// CreatePGUserRequest defines the expected request body for creating a PG user.
type CreatePGUserRequest struct {
	Username        string `json:"username" binding:"required"`
	PermissionLevel string `json:"permission_level" binding:"required,oneof=read write"` // "read" or "write"
}

// PGUserResponse defines the data sent back after creating a PG user (includes password).
type PGUserResponse struct {
	models.ManagedPGUser
	Password string `json:"password,omitempty"` // Omit if not a new user creation response
}

// RegeneratePasswordResponse defines the response for password regeneration.
type RegeneratePasswordResponse struct {
	NewPassword string `json:"new_password"`
}

// Basic validation for PG usernames.
// Allows lowercase letters, numbers, underscores. Must start with letter. Length 3-63.
var pgUsernameValidator = regexp.MustCompile(`^[a-z][a-z0-9_]{2,62}$`)

// isPGUsernameValid checks if the user-chosen PG username is valid.
func isPGUsernameValid(name string) bool {
	if strings.HasPrefix(name, "pg_") { // Reserved prefix
		return false
	}
	return pgUsernameValidator.MatchString(name)
}

// CreatePGUserHandler handles requests to create a new PostgreSQL user for a managed database.
func CreatePGUserHandler(c *gin.Context) {
	currentUser := auth.GetUserFromSession(c)
	if currentUser == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	databaseIDStr := c.Param("database_id")
	databaseID, err := uuid.Parse(databaseIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid database ID format"})
		return
	}

	// Verify ownership of the ManagedDatabase
	managedDB, err := store.GetManagedDatabaseByID(databaseID, currentUser.InternalUserID)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Managed database not found or not owned by user"})
			return
		}
		log.Printf("Error fetching database %s for PG user creation by user %s: %v", databaseID, currentUser.InternalUserID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve database details"})
		return
	}
	if managedDB.Status != "active" { // Ensure DB is in a state that allows user creation
		c.JSON(http.StatusConflict, gin.H{"error": fmt.Sprintf("Database is not in active state (current state: %s)", managedDB.Status)})
		return
	}

	var req CreatePGUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request payload: " + err.Error()})
		return
	}

	pgUsername := strings.ToLower(strings.TrimSpace(req.Username))
	if !isPGUsernameValid(pgUsername) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid PostgreSQL username. Must be 3-63 chars, lowercase alphanumeric, underscores, start with letter, no 'pg_' prefix."})
		return
	}

	// Check for username uniqueness within this database
	exists, err := store.CheckIfPGUsernameExistsInDB(databaseID, pgUsername)
	if err != nil {
		log.Printf("Error checking if PG username %s exists in DB %s: %v", pgUsername, databaseID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to validate username uniqueness"})
		return
	}
	if exists {
		c.JSON(http.StatusConflict, gin.H{"error": fmt.Sprintf("PostgreSQL username '%s' already exists in this database.", pgUsername)})
		return
	}

	pgAdminDSN := os.Getenv("PG_ADMIN_DSN")
	if pgAdminDSN == "" {
		log.Println("Error: PG_ADMIN_DSN not set for CreatePGUserHandler")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "PostgreSQL user provisioning is not configured"})
		return
	}

	// Provision the actual PostgreSQL user
	generatedPassword, err := dbutils.CreatePostgresUser(pgAdminDSN, managedDB.PGDatabaseName, pgUsername, req.PermissionLevel)
	if err != nil {
		log.Printf("Error provisioning PG user %s for DB %s: %v", pgUsername, managedDB.PGDatabaseName, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to provision PostgreSQL user: " + err.Error()})
		return
	}

	// Create the ManagedPGUser record in the application database
	managedPGUser := &models.ManagedPGUser{
		PGUserID:          uuid.New(),
		ManagedDatabaseID: databaseID,
		PGUsername:        pgUsername,
		PermissionLevel:   req.PermissionLevel,
		Status:            "active",
	}

	if err := store.CreateManagedPGUser(managedPGUser); err != nil {
		log.Printf("Error creating ManagedPGUser record for %s in DB %s: %v", pgUsername, databaseID, err)
		// TODO: Consider cleanup if PG user was provisioned but record creation failed
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save PostgreSQL user record"})
		return
	}

	log.Printf("PG User %s created for DB %s (ID: %s) by user %s", pgUsername, managedDB.PGDatabaseName, databaseID, currentUser.InternalUserID)

	response := PGUserResponse{
		ManagedPGUser: *managedPGUser,
		Password:      generatedPassword, // Include the generated password in the response
	}
	c.JSON(http.StatusCreated, response)
}

// ListPGUsersHandler handles requests to list PostgreSQL users for a managed database.
func ListPGUsersHandler(c *gin.Context) {
	currentUser := auth.GetUserFromSession(c)
	if currentUser == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	databaseIDStr := c.Param("database_id")
	databaseID, err := uuid.Parse(databaseIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid database ID format"})
		return
	}

	// Verify ownership of the ManagedDatabase and get users
	// GetManagedPGUsersByDatabaseIDAndOwner first checks DB ownership then gets users.
	pgUsers, err := store.GetManagedPGUsersByDatabaseIDAndOwner(databaseID, currentUser.InternalUserID)
	if err != nil {
		// Check if the error is because the database itself wasn't found or not owned
		if strings.Contains(err.Error(), "database") && strings.Contains(err.Error(), "not found or not owned by user") {
			c.JSON(http.StatusNotFound, gin.H{"error": "Managed database not found or not owned by user"})
			return
		}
		log.Printf("Error listing PG users for DB %s, owner %s: %v", databaseID, currentUser.InternalUserID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve PostgreSQL users"})
		return
	}

	if pgUsers == nil { // Ensure we return an empty list, not null
		pgUsers = []models.ManagedPGUser{}
	}

	// Passwords are not stored in ManagedPGUser model, so they are naturally omitted.
	c.JSON(http.StatusOK, pgUsers)
}

// RegeneratePGPasswordHandler handles requests to regenerate a password for a PG user.
func RegeneratePGPasswordHandler(c *gin.Context) {
	currentUser := auth.GetUserFromSession(c)
	if currentUser == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	databaseIDStr := c.Param("database_id")
	databaseID, err := uuid.Parse(databaseIDStr) // Parent DB ID
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid database ID format"})
		return
	}

	pgUserIDStr := c.Param("pg_user_id")
	pgUserID, err := uuid.Parse(pgUserIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid PostgreSQL user ID format"})
		return
	}

	// Verify ownership of the ManagedDatabase first (indirectly via GetManagedPGUserByID)
	// GetManagedPGUserByID checks ownership of the parent database.
	pgUser, err := store.GetManagedPGUserByID(pgUserID, currentUser.InternalUserID)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "PostgreSQL user not found or parent database not owned by user"})
			return
		}
		log.Printf("Error fetching PG user %s for password regeneration by user %s: %v", pgUserID, currentUser.InternalUserID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve PostgreSQL user details"})
		return
	}

	// Ensure the fetched PG user actually belongs to the database_id from the path
	if pgUser.ManagedDatabaseID != databaseID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "PostgreSQL user does not belong to the specified database"})
		return
	}
	if pgUser.Status != "active" {
		c.JSON(http.StatusConflict, gin.H{"error": fmt.Sprintf("PostgreSQL user is not in active state (current state: %s)", pgUser.Status)})
		return
	}

	// Fetch the actual PGDatabaseName from the ManagedDatabase record
	managedDB, err := store.GetManagedDatabaseByID(pgUser.ManagedDatabaseID, currentUser.InternalUserID)
	if err != nil {
		// This should be rare if GetManagedPGUserByID succeeded with ownership check
		log.Printf("Error fetching parent database %s for PG user %s: %v", pgUser.ManagedDatabaseID, pgUser.PGUserID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve parent database details"})
		return
	}

	pgAdminDSN := os.Getenv("PG_ADMIN_DSN")
	if pgAdminDSN == "" {
		log.Println("Error: PG_ADMIN_DSN not set for RegeneratePGPasswordHandler")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "PostgreSQL user password regeneration is not configured"})
		return
	}

	newPassword, err := dbutils.RegeneratePostgresUserPassword(pgAdminDSN, managedDB.PGDatabaseName, pgUser.PGUsername)
	if err != nil {
		log.Printf("Error regenerating password for PG user %s on DB %s: %v", pgUser.PGUsername, managedDB.PGDatabaseName, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to regenerate PostgreSQL user password: " + err.Error()})
		return
	}

	// Note: We don't store the password in our app DB.
	// We might want to update pgUser.UpdatedAt here if tracking password changes.
	// e.g., store.UpdatePGUser(pgUser) if such a generic update function exists.

	log.Printf("Password regenerated for PG User %s (ID: %s) in DB %s by user %s", pgUser.PGUsername, pgUser.PGUserID, managedDB.PGDatabaseName, currentUser.InternalUserID)

	response := RegeneratePasswordResponse{
		NewPassword: newPassword,
	}
	c.JSON(http.StatusOK, response)
}

// DeletePGUserHandler handles requests to delete a PostgreSQL user.
func DeletePGUserHandler(c *gin.Context) {
	currentUser := auth.GetUserFromSession(c)
	if currentUser == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	databaseIDStr := c.Param("database_id")
	databaseID, err := uuid.Parse(databaseIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid database ID format"})
		return
	}

	pgUserIDStr := c.Param("pg_user_id")
	pgUserID, err := uuid.Parse(pgUserIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid PostgreSQL user ID format"})
		return
	}

	// Verify ownership and get the PG user's details.
	// This also ensures the user belongs to the specified database.
	pgUser, err := store.GetManagedPGUserByID(pgUserID, currentUser.InternalUserID)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "PostgreSQL user not found or parent database not owned by user"})
			return
		}
		log.Printf("Error fetching PG user %s for deletion by user %s: %v", pgUserID, currentUser.InternalUserID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve PostgreSQL user details"})
		return
	}
	if pgUser.ManagedDatabaseID != databaseID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "PostgreSQL user does not belong to the specified database"})
		return
	}

	// Get the managed database to find the actual PG database name.
	managedDB, err := store.GetManagedDatabaseByID(databaseID, currentUser.InternalUserID)
	if err != nil {
		log.Printf("Error fetching parent database %s for PG user deletion: %v", databaseID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve parent database details"})
		return
	}

	pgAdminDSN := os.Getenv("PG_ADMIN_DSN")
	if pgAdminDSN == "" {
		log.Println("Error: PG_ADMIN_DSN not set for DeletePGUserHandler")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "PostgreSQL user deletion is not configured"})
		return
	}

	// Delete the user from the PostgreSQL database.
	if err := dbutils.DeletePostgresUser(pgAdminDSN, managedDB.PGDatabaseName, pgUser.PGUsername); err != nil {
		log.Printf("Error deleting PG user %s from DB %s: %v", pgUser.PGUsername, managedDB.PGDatabaseName, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete PostgreSQL user from the database: " + err.Error()})
		return
	}

	// Delete the user record from the application database.
	if err := store.DeleteManagedPGUser(pgUserID); err != nil {
		log.Printf("Error deleting ManagedPGUser record %s: %v", pgUserID, err)
		// The user is deleted from the PG DB, but the record remains in our app DB.
		// This is an inconsistent state that may need manual cleanup.
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete PostgreSQL user record from the application. Please contact support."})
		return
	}

	log.Printf("PG User %s (ID: %s) in DB %s deleted by user %s", pgUser.PGUsername, pgUserID, managedDB.PGDatabaseName, currentUser.InternalUserID)
	c.JSON(http.StatusNoContent, nil)
}
