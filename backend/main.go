package main

import (
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

func main() {
	r := gin.Default()

	r.GET("/ping", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"message": "pong",
		})
	})

	// Placeholder for OIDC routes
	authRoutes := r.Group("/auth")
	{
		authRoutes.GET("/oidc/login", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"message": "OIDC login placeholder"})
		})
		authRoutes.GET("/oidc/callback", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"message": "OIDC callback placeholder"})
		})
		authRoutes.POST("/logout", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"message": "Logout placeholder"})
		})
		authRoutes.GET("/api/me", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"message": "My profile placeholder"})
		})
	}

	// Placeholder for Database Management routes
	dbApiRoutes := r.Group("/api/databases")
	{
		dbApiRoutes.POST("/", func(c *gin.Context) {
			c.JSON(http.StatusCreated, gin.H{"message": "Create database placeholder"})
		})
		dbApiRoutes.GET("/", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"message": "List databases placeholder"})
		})
		dbApiRoutes.GET("/:database_id", func(c *gin.Context) {
			dbID := c.Param("database_id")
			c.JSON(http.StatusOK, gin.H{"message": "Get database placeholder", "database_id": dbID})
		})
		dbApiRoutes.DELETE("/:database_id", func(c *gin.Context) {
			dbID := c.Param("database_id")
			c.JSON(http.StatusOK, gin.H{"message": "Delete database placeholder", "database_id": dbID})
		})
	}

	// Placeholder for PostgreSQL User Management routes
	pgUserApiRoutes := r.Group("/api/databases/:database_id/users")
	{
		pgUserApiRoutes.POST("/", func(c *gin.Context) {
			dbID := c.Param("database_id")
			c.JSON(http.StatusCreated, gin.H{"message": "Create PG user placeholder", "database_id": dbID})
		})
		pgUserApiRoutes.GET("/", func(c *gin.Context) {
			dbID := c.Param("database_id")
			c.JSON(http.StatusOK, gin.H{"message": "List PG users placeholder", "database_id": dbID})
		})
		pgUserApiRoutes.POST("/:pg_user_id/regenerate-password", func(c *gin.Context) {
			dbID := c.Param("database_id")
			pgUserID := c.Param("pg_user_id")
			c.JSON(http.StatusOK, gin.H{"message": "Regenerate PG user password placeholder", "database_id": dbID, "pg_user_id": pgUserID})
		})
	}

	log.Println("Starting server on :8080")
	if err := r.Run(":8080"); err != nil {
		log.Fatalf("Failed to run server: %v", err)
	}
}
