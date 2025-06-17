package handlers

import (
	"log"
	"net/http"
	"os"

	"pgweb-backend/auth" // Assuming 'backend' is the module name

	"github.com/gin-gonic/gin"
)

// LoginHandler initiates the OIDC login flow.
func LoginHandler(c *gin.Context) {
	auth.InitiateOIDCLogin(c)
}

// CallbackHandler handles the OIDC callback.
func CallbackHandler(c *gin.Context) {
	auth.HandleOIDCCallback(c)
}

// LogoutHandler clears the user's session and redirects.
func LogoutHandler(c *gin.Context) {
	err := auth.ClearSession(c)
	if err != nil {
		log.Printf("Error clearing session during logout: %v", err)
		// Even if session clearing fails, attempt to redirect.
		// Depending on policy, might want to return an error instead.
	}

	// Optionally, construct OIDC logout URL:
	// oidcLogoutURL := os.Getenv("OIDC_LOGOUT_URL")
	// if oidcLogoutURL != "" {
	//     // Add id_token_hint if required by provider
	//     // Add post_logout_redirect_uri if supported
	//     c.Redirect(http.StatusFound, oidcLogoutURL)
	//     return
	// }

	// Redirect to a local page, e.g., login or home.
	// This URL could be configurable.
	logoutRedirectURL := os.Getenv("POST_LOGOUT_REDIRECT_URL")
	if logoutRedirectURL == "" {
		logoutRedirectURL = "/" // Default to home page
	}
	c.Redirect(http.StatusFound, logoutRedirectURL)
}

// MeHandler retrieves user information from the session.
func MeHandler(c *gin.Context) {
	userInfo := auth.GetUserFromSession(c)
	if userInfo == nil {
		// This case should ideally be caught by the auth middleware first
		// if the route is protected.
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized. No user session found."})
		return
	}
	c.JSON(http.StatusOK, userInfo)
}
