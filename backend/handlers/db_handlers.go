package handlers

import (
	"pgweb-backend/auth"
	"pgweb-backend/dbutils"
	"pgweb-backend/models"
	"pgweb-backend/store"
	"database/sql"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
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
		// Compensating action: drop the provisioned PG database since the record failed
		log.Printf("Compensating: dropping provisioned database %s due to record creation failure", pgDatabaseName)
		if dropErr := dbutils.SoftDeletePostgresDatabase(pgAdminDSN, pgDatabaseName, nil); dropErr != nil {
			log.Printf("Warning: failed to clean up provisioned database %s: %v", pgDatabaseName, dropErr)
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save database record"})
		return
	}

	log.Printf("Database %s created and record saved for user %s", managedDB.PGDatabaseName, currentUser.InternalUserID)
	store.WriteAuditLog(&currentUser.InternalUserID, "database.create", "database", managedDB.DatabaseID.String(), map[string]string{"pg_database_name": pgDatabaseName})
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
        databases = []models.DatabaseWithOwner{}
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

	// First, check if the database exists at all, without respect to ownership.
    // This is to distinguish between a 404 (doesn't exist) and a 403 (not your resource).
    exists, err := store.CheckIfManagedDatabaseExists(databaseID)
    if err != nil {
        log.Printf("Error checking existence of database %s: %v", databaseID, err)
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check database existence"})
        return
    }
    if !exists {
        c.JSON(http.StatusNotFound, gin.H{"error": "Database not found"})
        return
    }

    // Now, attempt to get it with the owner check. If this fails, it must be a permissions issue.
	db, err := store.GetManagedDatabaseByID(databaseID, currentUser.InternalUserID)
	if err != nil {
		if err == sql.ErrNoRows {
            // Since we know the DB exists, this error means the user does not own it.
			c.JSON(http.StatusForbidden, gin.H{"error": "You do not have permission to access this database"})
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

	// 1. Check for existence to distinguish 404 from 403
    exists, err := store.CheckIfManagedDatabaseExists(databaseID)
    if err != nil {
        log.Printf("Error checking existence of database %s for deletion: %v", databaseID, err)
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check database existence"})
        return
    }
    if !exists {
        c.JSON(http.StatusNotFound, gin.H{"error": "Database not found"})
        return
    }

	// 2. Fetch ManagedDatabase details (ensures ownership and gets PGDatabaseName)
	managedDB, err := store.GetManagedDatabaseByID(databaseID, currentUser.InternalUserID)
	if err != nil {
		if err == sql.ErrNoRows {
            // Since we know it exists, this is a permissions error
			c.JSON(http.StatusForbidden, gin.H{"error": "You do not have permission to delete this database"})
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
	store.WriteAuditLog(&currentUser.InternalUserID, "database.delete", "database", databaseID.String(), map[string]string{"pg_database_name": managedDB.PGDatabaseName})
	c.JSON(http.StatusOK, gin.H{"message": "Database soft-deleted successfully", "database": managedDB})
}

// InitiateBackupHandler starts an asynchronous backup job for a database.
func InitiateBackupHandler(c *gin.Context) {
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

	// Verify ownership
	managedDB, err := store.GetManagedDatabaseByID(databaseID, currentUser.InternalUserID)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Database not found"})
			return
		}
		log.Printf("Error fetching database %s for backup by user %s: %v", databaseID, currentUser.InternalUserID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve database"})
		return
	}

	if managedDB.Status != "active" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Database must be active to backup"})
		return
	}

	// Check if there's already any active job (backup or restore) for this database
	if activeJob, found, err := store.HasActiveJobForDatabase(databaseID); err != nil {
		log.Printf("Error checking active jobs for database %s: %v", databaseID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check for active jobs"})
		return
	} else if found {
		c.JSON(http.StatusConflict, gin.H{"error": fmt.Sprintf("A %s job is already in progress", activeJob.Type), "job": activeJob})
		return
	}

	pgAdminDSN := os.Getenv("PG_ADMIN_DSN")
	if pgAdminDSN == "" {
		log.Println("Error: PG_ADMIN_DSN not set for InitiateBackupHandler")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database backup is not configured"})
		return
	}

	backupDir := os.Getenv("BACKUP_DIR")
	if backupDir == "" {
		backupDir = "/tmp/pgweb-backups"
	}

	// Create backup job record
	job := &models.BackupJob{
		BackupJobID: uuid.New(),
		DatabaseID:  databaseID,
		Type:        "backup",
		Status:      "pending",
		FilePath:    "",
		FileSize:    0,
	}
	if err := store.CreateBackupJob(job); err != nil {
		log.Printf("Error creating backup job for database %s: %v", databaseID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create backup job"})
		return
	}

	// Run pg_dump in background
	go func(jobID uuid.UUID, dbName string) {
		// Ensure backup directory exists
		if err := os.MkdirAll(backupDir, 0755); err != nil {
			log.Printf("Error creating backup directory %s: %v", backupDir, err)
			store.UpdateBackupJobStatus(jobID, "failed", "", 0, "Failed to create backup directory")
			return
		}

		filePath := fmt.Sprintf("%s/%s.dump", backupDir, jobID.String())

		// Update status to in_progress
		if err := store.UpdateBackupJobStatus(jobID, "in_progress", "", 0, ""); err != nil {
			log.Printf("Error updating backup job %s status: %v", jobID, err)
		}

		log.Printf("Starting backup for database %s (job %s)", dbName, jobID)
		fileSize, err := dbutils.DumpDatabaseToFile(pgAdminDSN, dbName, filePath)
		if err != nil {
			log.Printf("Error dumping database %s: %v", dbName, err)
			store.UpdateBackupJobStatus(jobID, "failed", "", 0, err.Error())
			return
		}

		if err := store.UpdateBackupJobStatus(jobID, "completed", filePath, fileSize, ""); err != nil {
			log.Printf("Error updating backup job %s to completed: %v", jobID, err)
		}
		log.Printf("Backup completed for database %s (job %s, size %d bytes)", dbName, jobID, fileSize)
	}(job.BackupJobID, managedDB.PGDatabaseName)

	c.JSON(http.StatusAccepted, job)
}

// BackupStatusHandler returns the status of a backup job.
func BackupStatusHandler(c *gin.Context) {
	currentUser := auth.GetUserFromSession(c)
	if currentUser == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	jobIDStr := c.Param("job_id")
	jobID, err := uuid.Parse(jobIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid backup job ID format"})
		return
	}

	job, err := store.GetBackupJobByID(jobID, currentUser.InternalUserID)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Backup job not found"})
			return
		}
		log.Printf("Error fetching backup job %s: %v", jobID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve backup job"})
		return
	}

	c.JSON(http.StatusOK, job)
}

// sanitizeFilename removes any character not in [A-Za-z0-9._-] from the filename.
func sanitizeFilename(name string) string {
	reg := regexp.MustCompile(`[^A-Za-z0-9._-]`)
	return reg.ReplaceAllString(name, "_")
}

// DownloadBackupHandler serves the dump file for a completed backup job.
func DownloadBackupHandler(c *gin.Context) {
	currentUser := auth.GetUserFromSession(c)
	if currentUser == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	jobIDStr := c.Param("job_id")
	jobID, err := uuid.Parse(jobIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid backup job ID format"})
		return
	}

	job, err := store.GetBackupJobByID(jobID, currentUser.InternalUserID)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Backup job not found"})
			return
		}
		log.Printf("Error fetching backup job %s for download: %v", jobID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve backup job"})
		return
	}

	if job.Status != "completed" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Backup is not yet completed", "status": job.Status})
		return
	}

	// Validate that the file path is rooted under the configured backup directory
	backupDir := os.Getenv("BACKUP_DIR")
	if backupDir == "" {
		backupDir = "/tmp/pgweb-backups"
	}
	absBackupDir, err := filepath.Abs(backupDir)
	if err != nil {
		log.Printf("Error resolving backup directory %s: %v", backupDir, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to resolve backup directory"})
		return
	}
	absFilePath, err := filepath.Abs(filepath.Clean(job.FilePath))
	if err != nil {
		log.Printf("Error resolving file path %s: %v", job.FilePath, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to resolve file path"})
		return
	}
	if !strings.HasPrefix(absFilePath, absBackupDir+string(os.PathSeparator)) && absFilePath != absBackupDir {
		log.Printf("Security: file path %s is outside backup directory %s", job.FilePath, absBackupDir)
		c.JSON(http.StatusForbidden, gin.H{"error": "File access denied"})
		return
	}

	// Get the database name for the filename
	managedDB, err := store.GetManagedDatabaseByID(job.DatabaseID, currentUser.InternalUserID)
	if err != nil {
		log.Printf("Error fetching database %s for backup download: %v", job.DatabaseID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve database info"})
		return
	}

	// Sanitize and quote the filename for Content-Disposition
	filename := sanitizeFilename(managedDB.PGDatabaseName) + ".dump"
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	c.Header("Content-Length", fmt.Sprintf("%d", job.FileSize))
	c.File(absFilePath)
}

// InitiateRestoreHandler accepts a dump file upload and starts an async restore job.
func InitiateRestoreHandler(c *gin.Context) {
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

	// Verify ownership
	managedDB, err := store.GetManagedDatabaseByID(databaseID, currentUser.InternalUserID)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Database not found"})
			return
		}
		log.Printf("Error fetching database %s for restore by user %s: %v", databaseID, currentUser.InternalUserID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve database"})
		return
	}

	if managedDB.Status != "active" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Database must be active to restore"})
		return
	}

	// Check if there's already any active job (backup or restore) for this database
	if activeJob, found, err := store.HasActiveJobForDatabase(databaseID); err != nil {
		log.Printf("Error checking active jobs for database %s: %v", databaseID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check for active jobs"})
		return
	} else if found {
		c.JSON(http.StatusConflict, gin.H{"error": fmt.Sprintf("A %s job is already in progress", activeJob.Type), "job": activeJob})
		return
	}

	pgAdminDSN := os.Getenv("PG_ADMIN_DSN")
	if pgAdminDSN == "" {
		log.Println("Error: PG_ADMIN_DSN not set for InitiateRestoreHandler")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database restore is not configured"})
		return
	}

	backupDir := os.Getenv("BACKUP_DIR")
	if backupDir == "" {
		backupDir = "/tmp/pgweb-backups"
	}

	if err := os.MkdirAll(backupDir, 0755); err != nil {
		log.Printf("Error creating backup directory %s: %v", backupDir, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to prepare restore"})
		return
	}

	// Create job record first to get a unique ID for the temp file
	job := &models.BackupJob{
		BackupJobID: uuid.New(),
		DatabaseID:  databaseID,
		Type:        "restore",
		Status:      "pending",
		FilePath:    "",
		FileSize:    0,
	}
	if err := store.CreateBackupJob(job); err != nil {
		log.Printf("Error creating restore job for database %s: %v", databaseID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create restore job"})
		return
	}

	// Stream upload directly to disk instead of buffering in memory
	uploadPath := fmt.Sprintf("%s/%s-upload.dump", backupDir, job.BackupJobID.String())
	outFile, err := os.Create(uploadPath)
	if err != nil {
		log.Printf("Error creating dump file for job %s: %v", job.BackupJobID, err)
		store.UpdateBackupJobStatus(job.BackupJobID, "failed", "", 0, "Failed to create dump file")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save uploaded file"})
		return
	}

	written, err := io.Copy(outFile, c.Request.Body)
	outFile.Close()
	if err != nil {
		log.Printf("Error streaming upload to disk for job %s: %v", job.BackupJobID, err)
		os.Remove(uploadPath)
		store.UpdateBackupJobStatus(job.BackupJobID, "failed", "", 0, "Failed to save uploaded file")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save uploaded file"})
		return
	}

	if written == 0 {
		os.Remove(uploadPath)
		store.UpdateBackupJobStatus(job.BackupJobID, "failed", "", 0, "Empty upload")
		c.JSON(http.StatusBadRequest, gin.H{"error": "Empty upload data"})
		return
	}

	// Update job with file path and size
	store.UpdateBackupJobStatus(job.BackupJobID, "pending", uploadPath, written, "")

	// Run pg_restore in background
	go func(jobID uuid.UUID, dbName string, uploadPath string) {
		// Clean up upload file when done
		defer func() {
			if err := os.Remove(uploadPath); err != nil && !os.IsNotExist(err) {
				log.Printf("Warning: failed to clean up restore upload %s: %v", uploadPath, err)
			}
		}()

		// Update status to in_progress
		if err := store.UpdateBackupJobStatus(jobID, "in_progress", uploadPath, 0, ""); err != nil {
			log.Printf("Error updating restore job %s status: %v", jobID, err)
		}

		log.Printf("Starting restore for database %s (job %s)", dbName, jobID)
		err := dbutils.RestoreDatabaseFromFile(pgAdminDSN, dbName, uploadPath)
		if err != nil {
			log.Printf("Error restoring database %s: %v", dbName, err)
			store.UpdateBackupJobStatus(jobID, "failed", uploadPath, 0, err.Error())
			return
		}

		info, _ := os.Stat(uploadPath)
		var fileSize int64
		if info != nil {
			fileSize = info.Size()
		}
		if err := store.UpdateBackupJobStatus(jobID, "completed", uploadPath, fileSize, ""); err != nil {
			log.Printf("Error updating restore job %s to completed: %v", jobID, err)
		}
		log.Printf("Restore completed for database %s (job %s)", dbName, jobID)
	}(job.BackupJobID, managedDB.PGDatabaseName, uploadPath)

	c.JSON(http.StatusAccepted, job)
}

// RestoreStatusHandler returns the status of a restore job.
func RestoreStatusHandler(c *gin.Context) {
	currentUser := auth.GetUserFromSession(c)
	if currentUser == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	jobIDStr := c.Param("job_id")
	jobID, err := uuid.Parse(jobIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid restore job ID format"})
		return
	}

	job, err := store.GetBackupJobByID(jobID, currentUser.InternalUserID)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Restore job not found"})
			return
		}
		log.Printf("Error fetching restore job %s: %v", jobID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve restore job"})
		return
	}

	c.JSON(http.StatusOK, job)
}
