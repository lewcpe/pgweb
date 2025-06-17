package handlers

import (
	"pgweb-backend/auth"
	"pgweb-backend/dbutils"
	"pgweb-backend/models"
	"pgweb-backend/store"
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"
	"regexp"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// CreateDatabaseRequest defines the expected request body for creating a database.
type CreateDatabaseRequest struct {
	Name string `json:"name" binding:"required"`
}

// Basic validation for database names.
// Allows lowercase letters, numbers, underscores, hyphens. Must start/end with letter/number.
// Length constraints.
var dbNameValidator = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{1,61}[a-z0-9]$`)

// isDBNameValid checks if the user-chosen database name is valid.
func isDBNameValid(name string) bool {
	if len(name) < 3 || len(name) > 63 {
		return false
	}
	if strings.HasPrefix(name, "pg_") || strings.HasPrefix(name, "postgres") { // Reserved prefixes
		return false
	}
	return dbNameValidator.MatchString(name)
}

// CreateDatabaseHandler handles requests to create a new managed database.
func CreateDatabaseHandler(c *gin.Context) {
	currentUser := auth.GetUserFromSession(c)
	if currentUser == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	var req CreateDatabaseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request payload: " + err.Error()})
		return
	}

	userChosenDBName := strings.ToLower(strings.TrimSpace(req.Name))
	if !isDBNameValid(userChosenDBName) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid database name. Name must be 3-63 chars, alphanumeric, underscores, hyphens, start/end with alphanumeric, and not use reserved prefixes."})
		return
	}

	// Construct the actual PostgreSQL database name.
	// PROJECT_PLAN.md: "User chosen name, globally unique."
	// For global uniqueness, we must check against all db names.
	// The sanitization in dbutils.CreatePostgresDatabase is a fallback, but ideally, userChosenDBName is already safe.
	pgDatabaseName := userChosenDBName // For now, assume user chosen name is directly used if valid and unique

	exists, err := store.CheckIfPGDatabaseNameExists(pgDatabaseName)
	if err != nil {
		log.Printf("Error checking if DB name %s exists: %v", pgDatabaseName, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to validate database name uniqueness"})
		return
	}
	if exists {
		c.JSON(http.StatusConflict, gin.H{"error": fmt.Sprintf("Database name '%s' is already taken. Please choose a different name.", userChosenDBName)})
		return
	}

	pgAdminDSN := os.Getenv("PG_ADMIN_DSN")
	if pgAdminDSN == "" {
		log.Println("Error: PG_ADMIN_DSN not set for CreateDatabaseHandler")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database provisioning is not configured"})
		return
	}

	// Provision the actual PostgreSQL database
	if err := dbutils.CreatePostgresDatabase(pgAdminDSN, pgDatabaseName); err != nil {
		log.Printf("Error provisioning database %s: %v", pgDatabaseName, err)
		// More specific error handling could be done here (e.g. if db already exists due to race)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to provision database: " + err.Error()})
		return
	}

	// Create the record in the application database
	managedDB := &models.ManagedDatabase{
		DatabaseID:     uuid.New(),
		OwnerUserID:    currentUser.InternalUserID,
		PGDatabaseName: pgDatabaseName,
		Status:         "active", // Or "creating" then update via a background task
	}

	if err := store.CreateManagedDatabase(managedDB); err != nil {
		log.Printf("Error creating ManagedDatabase record for %s: %v", pgDatabaseName, err)
		// TODO: Consider cleanup if DB was provisioned but record creation failed (e.g. drop provisioned DB)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save database record"})
		return
	}

	log.Printf("Database %s created and record saved for user %s", managedDB.PGDatabaseName, currentUser.InternalUserID)
	c.JSON(http.StatusCreated, managedDB)
}

// ListDatabasesHandler handles requests to list managed databases for the authenticated user.
func ListDatabasesHandler(c *gin.Context) {
	currentUser := auth.GetUserFromSession(c)
	if currentUser == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	databases, err := store.GetManagedDatabasesByOwner(currentUser.InternalUserID)
	if err != nil {
		log.Printf("Error listing databases for user %s: %v", currentUser.InternalUserID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve databases"})
		return
	}

	if databases == nil { // Ensure we return an empty list, not null
        databases = []models.ManagedDatabase{}
    }
	c.JSON(http.StatusOK, databases)
}

// GetDatabaseHandler handles requests to get a specific managed database.
func GetDatabaseHandler(c *gin.Context) {
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

	db, err := store.GetManagedDatabaseByID(databaseID, currentUser.InternalUserID)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Database not found or not owned by user"})
			return
		}
		log.Printf("Error getting database %s for user %s: %v", databaseID, currentUser.InternalUserID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve database"})
		return
	}

	c.JSON(http.StatusOK, db)
}

// DeleteDatabaseHandler handles requests to soft-delete a managed database.
func DeleteDatabaseHandler(c *gin.Context) {
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

	// 1. Fetch ManagedDatabase details (ensures ownership and gets PGDatabaseName)
	managedDB, err := store.GetManagedDatabaseByID(databaseID, currentUser.InternalUserID)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Database not found or not owned by user"})
			return
		}
		log.Printf("Error fetching database %s for deletion by user %s: %v", databaseID, currentUser.InternalUserID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve database for deletion"})
		return
	}

	if managedDB.Status == "soft_deleted" {
		c.JSON(http.StatusOK, gin.H{"message": "Database already soft-deleted", "database": managedDB})
		return
	}
	if managedDB.Status == "deleting" { // Or some other pending state
		c.JSON(http.StatusConflict, gin.H{"error": "Database deletion is already in progress"})
		return
	}


	// 2. Fetch associated ManagedPGUser records
	pgUsers, err := store.GetManagedPGUsersByDatabaseID(databaseID)
	if err != nil {
		log.Printf("Error fetching PG users for database %s during deletion: %v", databaseID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve associated users for deletion"})
		return
	}

	// 3. Call dbutils.SoftDeletePostgresDatabase
	pgAdminDSN := os.Getenv("PG_ADMIN_DSN")
	if pgAdminDSN == "" {
		log.Println("Error: PG_ADMIN_DSN not set for DeleteDatabaseHandler")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database de-provisioning is not configured"})
		return
	}

	if err := dbutils.SoftDeletePostgresDatabase(pgAdminDSN, managedDB.PGDatabaseName, pgUsers); err != nil {
		log.Printf("Error soft-deleting PostgreSQL database %s: %v", managedDB.PGDatabaseName, err)
		// Don't necessarily fail the whole operation if some REVOKEs fail, but log it.
		// The app DB status update is the critical part for the application's view.
		// However, if this is critical, then return an error.
		// For now, we proceed to update app DB status.
	}

	// 4. Update ManagedDatabase status to "soft_deleted"
	newStatus := "soft_deleted"
	if err := store.UpdateManagedDatabaseStatus(databaseID, currentUser.InternalUserID, newStatus); err != nil {
		log.Printf("Error updating ManagedDatabase status for %s to %s: %v", databaseID, newStatus, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update database status after soft deletion"})
		return
	}
	managedDB.Status = newStatus // Update local copy for response

	// 5. Update associated ManagedPGUser statuses
	pgUserNewStatus := "deactivated_db_soft_deleted"
	if err := store.UpdateManagedPGUserStatusForDB(databaseID, pgUserNewStatus); err != nil {
		log.Printf("Error updating ManagedPGUser statuses for database %s to %s: %v", databaseID, pgUserNewStatus, err)
		// This is not ideal, but the main DB record is updated. Log and proceed.
	}

	log.Printf("Database %s (ID: %s) soft-deleted by user %s", managedDB.PGDatabaseName, databaseID, currentUser.InternalUserID)
	c.JSON(http.StatusOK, gin.H{"message": "Database soft-deleted successfully", "database": managedDB})
}
