package auth

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"pgweb-backend/models"
	"pgweb-backend/store"
	"time"

	"encoding/gob"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"golang.org/x/oauth2"
)

const (
	oidcStateKey         = "oidc_state"
	oidcNonceKey         = "oidc_nonce"
	userSessionKey       = "user"
	sessionName          = "mysession"  // Should match the name used in sessions.Sessions middleware
	frontendDashboardURL = "/dashboard" // Configurable: could be from env var
)

var (
	oidcProvider *oidc.Provider
	oauth2Config *oauth2.Config
	// stateStore   = make(map[string]string) // Removed: will use session for state
)

// UserSessionInfo holds essential user information to be stored in the session.
type UserSessionInfo struct {
	InternalUserID uuid.UUID `json:"internal_user_id"`
	OIDCSub        string    `json:"oidc_sub"`
	Email          string    `json:"email"`
}

func init() {
	// Register UserSessionInfo for gob encoding/decoding in sessions
	gob.Register(UserSessionInfo{})
}

// InitOIDCProvider initializes the OIDC provider and OAuth2 configuration.
func InitOIDCProvider() error {
	issuerURL := os.Getenv("OIDC_ISSUER_URL")
	clientID := os.Getenv("OIDC_CLIENT_ID")
	clientSecret := os.Getenv("OIDC_CLIENT_SECRET")
	redirectURL := os.Getenv("OIDC_REDIRECT_URL")

	if issuerURL == "" || clientID == "" || clientSecret == "" || redirectURL == "" {
		return errors.New("OIDC environment variables (OIDC_ISSUER_URL, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, OIDC_REDIRECT_URL) must be set")
	}

	var err error
	maxRetries := 10
	retryInterval := 5 * time.Second

	for i := 0; i < maxRetries; i++ {
		oidcProvider, err = oidc.NewProvider(context.Background(), issuerURL)
		if err == nil {
			log.Printf("OIDC provider initialized successfully after %d attempts.\n", i+1)
			break
		}
		log.Printf("Failed to initialize OIDC provider (attempt %d/%d): %v. Retrying in %v...\n", i+1, maxRetries, err, retryInterval)
		time.Sleep(retryInterval)
	}

	if err != nil {
		return fmt.Errorf("failed to initialize OIDC provider after multiple retries: %w", err)
	}

	oauth2Config = &oauth2.Config{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		RedirectURL:  redirectURL,
		Endpoint:     oidcProvider.Endpoint(),
		Scopes:       []string{oidc.ScopeOpenID, "profile", "email"},
	}
	return nil
}

func generateRandomString(length int) (string, error) {
	b := make([]byte, length)
	_, err := rand.Read(b)
	if err != nil {
		return "", err
	}
	return base64.URLEncoding.EncodeToString(b), nil
}

// InitiateOIDCLogin redirects the user to the OIDC provider's authorization endpoint.
func InitiateOIDCLogin(c *gin.Context) {
	if oauth2Config == nil {
		log.Println("Error: OIDC not configured during InitiateOIDCLogin")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "OIDC not configured"})
		return
	}

	state, err := generateRandomString(32)
	if err != nil {
		log.Printf("Error generating state: %v\n", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate state"})
		return
	}

	nonce, err := generateRandomString(32)
	if err != nil {
		log.Printf("Error generating nonce: %v\n", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate nonce"})
		return
	}

	SetSessionValue(c, oidcStateKey, state)
	SetSessionValue(c, oidcNonceKey, nonce)
	session := sessions.Default(c)
	err = session.Save()
	if err != nil {
		log.Printf("Error saving session after setting state/nonce: %v\n", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save session"})
		return
	}
	log.Printf("OIDC Initiate: state=%s, nonce=%s stored in session\n", state, nonce)

	redirectURL := oauth2Config.AuthCodeURL(state, oidc.Nonce(nonce))
	c.Redirect(http.StatusFound, redirectURL)
}

// HandleOIDCCallback exchanges the authorization code for tokens, validates them,
// manages user persistence, and stores user info in session.
func HandleOIDCCallback(c *gin.Context) {
	session := sessions.Default(c) // Ensure session is loaded

	// 1. Verify state
	queryState := c.Query("state")
	sessionState, err := GetSessionValue(c, oidcStateKey)
	if err != nil {
		log.Printf("Error getting state from session: %v\n", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "State not found in session or session error"})
		return
	}
	log.Printf("OIDC Callback: queryState=%s, sessionState=%s\n", queryState, sessionState)

	if queryState != sessionState {
		log.Println("Error: OIDC state mismatch")
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid OIDC state"})
		return
	}
	// Clear state and nonce from session after use
	ClearSessionValue(c, oidcStateKey)

	// 2. Exchange code for token
	ctx := oidc.ClientContext(context.Background(), http.DefaultClient) // Use context with HTTP client
	token, err := oauth2Config.Exchange(ctx, c.Query("code"))
	if err != nil {
		log.Printf("Error exchanging code for token: %v\n", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to exchange code for token"})
		return
	}

	// 3. Verify ID Token
	rawIDToken, ok := token.Extra("id_token").(string)
	if !ok {
		log.Println("Error: ID token missing from token response")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ID token missing"})
		return
	}

	sessionNonce, err := GetSessionValue(c, oidcNonceKey)
	if err != nil {
		log.Printf("Error getting nonce from session: %v\n", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Nonce not found in session or session error"})
		return
	}
	ClearSessionValue(c, oidcNonceKey) // Clear nonce

	idToken, err := oidcProvider.Verifier(&oidc.Config{ClientID: oauth2Config.ClientID}).Verify(context.Background(), rawIDToken)
	if err != nil {
		log.Printf("Error verifying ID token: %v\n", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to verify ID token"})
		return
	}

	if idToken.Nonce != sessionNonce {
		log.Println("Error: ID token nonce mismatch")
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID token nonce"})
		return
	}

	// 4. Extract claims
	var claims struct {
		Email         string `json:"email"`
		EmailVerified bool   `json:"email_verified"`
		// Add other claims you need, e.g., name, preferred_username
	}
	if err := idToken.Claims(&claims); err != nil {
		log.Printf("Error extracting claims from ID token: %v\n", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to extract claims"})
		return
	}

	// 5. User lookup/creation
	oidcSub := idToken.Subject
	appUser, err := store.GetApplicationUserByOIDCSub(oidcSub)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			// User doesn't exist, create them
			newUser := &models.ApplicationUser{
				InternalUserID: uuid.New(), // Generate internal ID
				OIDCSub:        oidcSub,
				Email:          claims.Email,
				CreatedAt:      time.Now(),
				UpdatedAt:      time.Now(),
			}
			if err := store.CreateApplicationUser(newUser); err != nil {
				log.Printf("Error creating new application user: %v\n", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user profile"})
				return
			}
			appUser = newUser
			log.Printf("New user created: %s, OIDC Sub: %s\n", appUser.InternalUserID, appUser.OIDCSub)
		} else {
			log.Printf("Error looking up user by OIDC sub %s: %v\n", oidcSub, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error looking up user"})
			return
		}
	} else {
		// User exists, potentially update (e.g., email if changed, UpdatedAt)
		// For now, just log existing user
		log.Printf("Existing user found: %s, OIDC Sub: %s\n", appUser.InternalUserID, appUser.OIDCSub)
		// Example update:
		// appUser.Email = claims.Email // If you want to sync email
		// appUser.UpdatedAt = time.Now()
		// if err := store.UpdateApplicationUser(appUser); err != nil { ... }
	}

	// 6. Store essential user info in session
	userInfo := UserSessionInfo{
		InternalUserID: appUser.InternalUserID,
		OIDCSub:        appUser.OIDCSub,
		Email:          appUser.Email,
	}
	if err := StoreUserInSession(c, userInfo); err != nil {
		log.Printf("Error storing user info in session: %v\n", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to store user session"})
		return
	}
	log.Printf("User %s stored in session\n", userInfo.InternalUserID)

	// 7. Redirect to frontend dashboard
	// Clear OIDC specific values from session now that flow is complete
	ClearSessionValue(c, oidcStateKey)
	ClearSessionValue(c, oidcNonceKey)
	if err := session.Save(); err != nil { // Save changes from ClearSessionValue
		log.Printf("Error saving session after clearing OIDC keys: %v\n", err)
		// Non-critical, proceed with redirect
	}

	c.Redirect(http.StatusFound, frontendDashboardURL)
}

// --- Session Helper Functions ---

// SetSessionValue sets a value in the session.
func SetSessionValue(c *gin.Context, key string, value interface{}) {
	session := sessions.Default(c)
	session.Set(key, value)
	// Save is called by the session middleware automatically at the end of request
	// or can be called manually if immediate save is needed.
	// For InitiateOIDCLogin, we save manually after setting state and nonce.
}

// GetSessionValue retrieves a value from the session.
func GetSessionValue(c *gin.Context, key string) (string, error) {
	session := sessions.Default(c)
	val := session.Get(key)
	if val == nil {
		return "", fmt.Errorf("value for key '%s' not found in session", key)
	}
	strVal, ok := val.(string)
	if !ok {
		return "", fmt.Errorf("value for key '%s' is not a string", key)
	}
	return strVal, nil
}

// ClearSessionValue removes a key from the session.
func ClearSessionValue(c *gin.Context, key string) {
	session := sessions.Default(c)
	session.Delete(key)
	// Save is called by the session middleware
}

// StoreUserInSession stores user information in the session.
func StoreUserInSession(c *gin.Context, userInfo UserSessionInfo) error {
	session := sessions.Default(c)
	session.Set(userSessionKey, userInfo)
	err := session.Save()
	if err != nil {
		return fmt.Errorf("failed to save session: %w", err)
	}
	return nil
}

// GetUserFromSession retrieves user information from the session.
// Returns nil if user info is not found or error.
func GetUserFromSession(c *gin.Context) *UserSessionInfo {
	session := sessions.Default(c)
	val := session.Get(userSessionKey)
	if val == nil {
		return nil
	}
	userInfo, ok := val.(UserSessionInfo)
	if !ok {
		// This might happen if the stored type is not UserSessionInfo.
		// Could be due to manual session manipulation or data corruption.
		log.Println("Error: Session data for user is not of type UserSessionInfo")
		return nil
	}
	return &userInfo
}

// ClearSession clears all data from the current user's session.
func ClearSession(c *gin.Context) error {
	session := sessions.Default(c)
	session.Clear() // Clears all data in the session
	err := session.Save()
	if err != nil {
		return fmt.Errorf("failed to save cleared session: %w", err)
	}
	return nil
}
