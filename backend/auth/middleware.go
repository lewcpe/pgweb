package auth

import (
	"database/sql"
	"errors"
	"log"
	"net/http"
	"os"
	"time"

	"pgweb-backend/models"
	"pgweb-backend/store"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const (
	trustedHeaderEnvVar = "PGWEB_TRUSTED_HEADER"
)

var (
	trustedHeaderName string
)

func InitTrustedHeaderAuth() {
	trustedHeaderName = os.Getenv(trustedHeaderEnvVar)
	if trustedHeaderName != "" {
		log.Printf("Trusted header authentication enabled. Looking for header: %s\n", trustedHeaderName)
	} else {
		log.Println("Trusted header authentication disabled. Set PGWEB_TRUSTED_HEADER to enable.")
	}
}

// TrustedHeaderAuthMiddleware attempts to authenticate a user based on a trusted header.
// This is intended for use cases where an external proxy (e.g., oauth2-proxy) handles authentication
// and passes the authenticated user's email in a trusted header.
func TrustedHeaderAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// If trusted header auth is not configured, skip this middleware
		if trustedHeaderName == "" {
			c.Next()
			return
		}

		// If user is already authenticated via OIDC or previous middleware, skip
		if GetUserFromSession(c) != nil {
			c.Next()
			return
		}

		email := c.Request.Header.Get(trustedHeaderName)
		if email == "" {
			log.Printf("TrustedHeaderAuthMiddleware: No email found in trusted header '%s'. Proceeding to next auth method.\n", trustedHeaderName)
			c.Next()
			return
		}

		log.Printf("TrustedHeaderAuthMiddleware: Attempting to authenticate user with email from trusted header: %s\n", email)

		appUser, err := store.GetApplicationUserByEmail(email)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				// User doesn't exist, create them
				newUser := &models.ApplicationUser{
					InternalUserID: uuid.New(), // Generate internal ID
					OIDCSub:        "",         // No OIDC sub for trusted header auth
					Email:          email,
					CreatedAt:      time.Now(),
					UpdatedAt:      time.Now(),
				}
				if err := store.CreateApplicationUser(newUser); err != nil {
					log.Printf("TrustedHeaderAuthMiddleware: Error creating new application user for email %s: %v\n", email, err)
					c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user profile from trusted header"})
					return
				}
				appUser = newUser
				log.Printf("TrustedHeaderAuthMiddleware: New user created from trusted header: %s, Email: %s\n", appUser.InternalUserID, appUser.Email)
			} else {
				log.Printf("TrustedHeaderAuthMiddleware: Error looking up user by email %s: %v\n", email, err)
				c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "Database error looking up user by trusted header email"})
				return
			}
		} else {
			log.Printf("TrustedHeaderAuthMiddleware: Existing user found from trusted header: %s, Email: %s\n", appUser.InternalUserID, appUser.Email)
			// Optionally, update UpdatedAt or other fields if needed
			// appUser.UpdatedAt = time.Now()
			// if err := store.UpdateApplicationUser(appUser); err != nil { ... }
		}

		// Store essential user info in session
		userInfo := UserSessionInfo{
			InternalUserID: appUser.InternalUserID,
			OIDCSub:        appUser.OIDCSub, // Will be empty for trusted header auth
			Email:          appUser.Email,
		}
		if err := StoreUserInSession(c, userInfo); err != nil {
			log.Printf("TrustedHeaderAuthMiddleware: Error storing user info in session for email %s: %v\n", email, err)
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "Failed to store user session from trusted header"})
			return
		}
		log.Printf("TrustedHeaderAuthMiddleware: User %s authenticated via trusted header. Proceeding.\n", userInfo.InternalUserID)
		c.Next()
	}
}

// OIDCTokenValidationMiddleware checks if user information exists in the session.
// If user is authenticated (info in session), allows request to proceed.
// Otherwise, aborts with 401 Unauthorized.
func OIDCTokenValidationMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		userInfo := GetUserFromSession(c) // Uses the helper from auth/oidc.go

		if userInfo == nil {
			log.Println("OIDCTokenValidationMiddleware: User not found in session. Aborting request.")
			// Optionally, redirect to login page instead of just aborting with JSON
			// loginURL := "/auth/oidc/login" // Or some other configured login page
			// c.Redirect(http.StatusFound, loginURL)
			// c.Abort()
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized. Please log in."})
			return
		}

		// User is authenticated, proceed with the request.
		// Optionally, set user info in Gin context for downstream handlers if needed,
		// though GetUserFromSession can be called directly by them too.
		// c.Set("currentUser", userInfo)

		log.Printf("OIDCTokenValidationMiddleware: User %s authenticated. Proceeding.", userInfo.InternalUserID)
		c.Next()
	}
}
