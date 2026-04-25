package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"pgweb-backend/auth"
	"pgweb-backend/handlers" // This will now implicitly include pg_user_handlers if they are in the same package.
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

	// Initialize Application Database connection
	appDbDsn := os.Getenv("APP_DB_DSN")
	if appDbDsn == "" {
		log.Fatalf("APP_DB_DSN environment variable is not set.")
	}
	if err := store.InitAppDB(appDbDsn); err != nil {
		log.Fatalf("Failed to initialize application database: %v", err)
	}
	// Ensure managed_databases table exists
	if err := store.CreateManagedDatabasesTable(appDbDsn); err != nil {
		log.Fatalf("Failed to ensure managed_databases table exists: %v", err)
	}
	// Ensure managed_pg_users table exists
	if err := store.CreateManagedPgUsersTable(appDbDsn); err != nil {
		log.Fatalf("Failed to ensure managed_pg_users table exists: %v", err)
	}
	// Consider defer store.AppDB.Close() for graceful shutdown

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

	log.Println("Starting server on :8080")
	if err := r.Run(":8080"); err != nil {
		log.Fatalf("Failed to run server: %v", err)
	}
}
