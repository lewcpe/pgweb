package auth

import (
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

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
