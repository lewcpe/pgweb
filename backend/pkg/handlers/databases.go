package handlers

import (
	"net/http"
	"github.com/gin-gonic/gin"
)

// CreateDatabase handles request to create a new PostgreSQL database
func CreateDatabase(c *gin.Context) {
	// var reqBody struct { Name string `json:"name"` }
	// if err := c.ShouldBindJSON(&reqBody); err != nil {
	// 	c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	// 	return
	// }
	// Logic to provision database
	c.JSON(http.StatusCreated, gin.H{"message": "Database creation request received"})
}

// ListDatabases lists all managed databases for the authenticated user
func ListDatabases(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"message": "List of databases for user"})
}

// GetDatabaseDetails gets details of a specific managed database
func GetDatabaseDetails(c *gin.Context) {
	// dbID := c.Param("database_id")
	c.JSON(http.StatusOK, gin.H{"message": "Details for database_id"})
}

// SoftDeleteDatabase soft-deletes a managed database
func SoftDeleteDatabase(c *gin.Context) {
	// dbID := c.Param("database_id")
	c.JSON(http.StatusOK, gin.H{"message": "Database soft-deletion request received"})
}
