package handlers

import (
	"net/http"
	"github.com/gin-gonic/gin"
)

// CreatePGUser creates a new PostgreSQL user for a managed database
func CreatePGUser(c *gin.Context) {
	// dbID := c.Param("database_id")
	// var reqBody struct { Username string `json:"username"` }
	// if err := c.ShouldBindJSON(&reqBody); err != nil {
	//  c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	// 	return
	// }
	c.JSON(http.StatusCreated, gin.H{"message": "PG User creation request received"})
}

// ListPGUsers lists PostgreSQL users for a managed database
func ListPGUsers(c *gin.Context) {
	// dbID := c.Param("database_id")
	c.JSON(http.StatusOK, gin.H{"message": "List of PG users for database_id"})
}

// RegeneratePGUserPassword regenerates password for a PostgreSQL user
func RegeneratePGUserPassword(c *gin.Context) {
	// dbID := c.Param("database_id")
	// pgUserID := c.Param("pg_user_id")
	c.JSON(http.StatusOK, gin.H{"message": "PG User password regeneration request received"})
}
