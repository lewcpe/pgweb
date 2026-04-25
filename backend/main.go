package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"pgweb-backend/auth"
	"pgweb-backend/dbutils"
	"pgweb-backend/handlers"
	"pgweb-backend/store"

	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

const (
	sessionName = "mysession" // Should match auth.sessionName
)

func main() {
	// Load .env file if it exists
	if _, err := os.Stat(".env"); err == nil {
		if err := godotenv.Load(); err != nil {
			log.Fatalf("Error loading .env file: %s", err)
		}
	}

	// Initialize OIDC provider
	if err := auth.InitOIDCProvider(); err != nil {
		log.Printf("Failed to initialize OIDC provider: %v. Auth functionality may be limited.", err)
	}

	// Initialize trusted header authentication
	auth.InitTrustedHeaderAuth()

	// Initialize Application Database connection (runs all migrations)
	appDbDsn := os.Getenv("APP_DB_DSN")
	if appDbDsn == "" {
		log.Fatalf("APP_DB_DSN environment variable is not set.")
	}
	if err := store.InitAppDB(appDbDsn); err != nil {
		log.Fatalf("Failed to initialize application database: %v", err)
	}
	defer store.AppDB.Close()

	// Clean up old dump files on startup (older than 24 hours)
	backupDir := os.Getenv("BACKUP_DIR")
	if backupDir == "" {
		backupDir = "/tmp/pgweb-backups"
	}
	dbutils.CleanupOldDumpFiles(backupDir, 24*time.Hour)

	// Start periodic backup file janitor (replaces per-request goroutines)
	janitorInterval := 30 * time.Minute
	janitorTicker := time.NewTicker(janitorInterval)
	defer janitorTicker.Stop()
	go func() {
		for range janitorTicker.C {
			dbutils.CleanupOldDumpFiles(backupDir, 1*time.Hour)
		}
	}()
	log.Printf("Backup file janitor started (interval: %s, max age: 1h)", janitorInterval)

	r := gin.Default()

	// Health check endpoint (public)
	r.GET("/health", healthHandler)

	// Configure session store
	sessionSecretKey := os.Getenv("SESSION_SECRET_KEY")
	if sessionSecretKey == "" {
		log.Fatalf("SESSION_SECRET_KEY environment variable is not set. This is required for session security.")
	}
	cookieStore := cookie.NewStore([]byte(sessionSecretKey))
	cookieStore.Options(sessions.Options{
		Path:     "/",
		HttpOnly: true,
		Secure:   gin.Mode() == gin.ReleaseMode, // Secure cookies in production
		MaxAge:   86400 * 7,                     // 7 days
		SameSite: http.SameSiteLaxMode,
	})
	r.Use(sessions.Sessions(sessionName, cookieStore))

	// Serve static files from frontend dist
	frontendDist := os.Getenv("FRONTEND_DIST")
	if frontendDist == "" {
		frontendDist = "./frontend/dist"
	}

	// Check if frontend dist exists
	if _, err := os.Stat(frontendDist); err == nil {
		log.Printf("Serving frontend from: %s", frontendDist)

		// Serve static files
		r.Static("/assets", filepath.Join(frontendDist, "assets"))

		// Serve index.html for root
		r.GET("/", func(c *gin.Context) {
			c.File(filepath.Join(frontendDist, "index.html"))
		})

		// Catch-all for SPA routing - serve index.html for non-API routes
		r.NoRoute(func(c *gin.Context) {
			// Don't interfere with API routes
			if strings.HasPrefix(c.Request.URL.Path, "/api") ||
				strings.HasPrefix(c.Request.URL.Path, "/auth") ||
				strings.HasPrefix(c.Request.URL.Path, "/health") {
				c.Status(http.StatusNotFound)
				return
			}
			c.File(filepath.Join(frontendDist, "index.html"))
		})
	} else {
		// No frontend dist found, serve simple hello
		log.Printf("Warning: Frontend dist not found at %s, serving API only", frontendDist)
		r.GET("/", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{
				"message": "pgweb API",
			})
		})
	}

	// Authentication routes (generally do not need auth middleware themselves)
	authGroup := r.Group("/auth")
	{
		oidcGroup := authGroup.Group("/oidc")
		{
			oidcGroup.GET("/login", handlers.LoginHandler)
			oidcGroup.GET("/callback", handlers.CallbackHandler)
		}
		authGroup.POST("/logout", handlers.LogoutHandler)
	}

	// API routes - protected by authentication middleware
	apiProtected := r.Group("/api")
	// Apply trusted header auth first, then OIDC session validation
	apiProtected.Use(auth.TrustedHeaderAuthMiddleware(), auth.OIDCTokenValidationMiddleware())
	{
		// User profile
		apiProtected.GET("/me", handlers.MeHandler)

		// Managed Databases
		databasesGroup := apiProtected.Group("/databases")
		{
			databasesGroup.POST("", handlers.CreateDatabaseHandler)
			databasesGroup.GET("", handlers.ListDatabasesHandler)
			databasesGroup.GET("/:database_id", handlers.GetDatabaseHandler)
			databasesGroup.DELETE("/:database_id", handlers.DeleteDatabaseHandler)
			databasesGroup.POST("/:database_id/backup", handlers.InitiateBackupHandler)
			databasesGroup.GET("/:database_id/backup/:job_id", handlers.BackupStatusHandler)
			databasesGroup.GET("/:database_id/backup/:job_id/download", handlers.DownloadBackupHandler)
			databasesGroup.POST("/:database_id/restore", handlers.InitiateRestoreHandler)
			databasesGroup.GET("/:database_id/restore/:job_id", handlers.RestoreStatusHandler)

			// PG User management within a database
			pgUserRoutes := databasesGroup.Group("/:database_id/pgusers")
			{
				pgUserRoutes.POST("", handlers.CreatePGUserHandler)
				pgUserRoutes.GET("", handlers.ListPGUsersHandler)
				pgUserRoutes.POST("/:pg_user_id/regenerate-password", handlers.RegeneratePGPasswordHandler)
				pgUserRoutes.DELETE("/:pg_user_id", handlers.DeletePGUserHandler)
			}
		}
	}

	// Graceful shutdown with signal handling
	srv := &http.Server{
		Addr:    ":8080",
		Handler: r,
	}

	// Start server in a goroutine
	go func() {
		log.Println("Starting server on :8080")
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to run server: %v", err)
		}
	}()

	// Wait for interrupt signal for graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down server...")

	// Give outstanding requests 10 seconds to complete
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exited gracefully")
}
