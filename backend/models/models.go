package models

import (
	"time"

	"github.com/google/uuid"
)

// ApplicationUser represents a user in the application.
type ApplicationUser struct {
	InternalUserID uuid.UUID `json:"internal_user_id" db:"internal_user_id"`
	OIDCSub        string    `json:"oidc_sub" db:"oidc_sub"` // Subject claim from OIDC token
	Email          string    `json:"email" db:"email"`
	CreatedAt      time.Time `json:"created_at" db:"created_at"`
	UpdatedAt      time.Time `json:"updated_at" db:"updated_at"`
}

// ManagedDatabase represents a database instance managed by the application.
type ManagedDatabase struct {
	DatabaseID     uuid.UUID `json:"database_id" db:"database_id"`
	OwnerUserID    uuid.UUID `json:"owner_user_id" db:"owner_user_id"` // Foreign key to ApplicationUser
	PGDatabaseName string    `json:"pg_database_name" db:"pg_database_name"`
	Status         string    `json:"status" db:"status"` // e.g., "creating", "active", "deleting", "error"
	CreatedAt      time.Time `json:"created_at" db:"created_at"`
	UpdatedAt      time.Time `json:"updated_at" db:"updated_at"`
}

// ManagedPGUser represents a PostgreSQL user within a ManagedDatabase.
type ManagedPGUser struct {
	PGUserID          uuid.UUID `json:"pg_user_id" db:"pg_user_id"`
	ManagedDatabaseID uuid.UUID `json:"managed_database_id" db:"managed_database_id"` // Foreign key to ManagedDatabase
	PGUsername        string    `json:"pg_username" db:"pg_username"`
	PermissionLevel   string    `json:"permission_level" db:"permission_level"` // e.g., "readonly", "readwrite"
	Status            string    `json:"status" db:"status"`                     // e.g., "creating", "active", "deleting", "error"
	CreatedAt         time.Time `json:"created_at" db:"created_at"`
	UpdatedAt         time.Time `json:"updated_at" db:"updated_at"`
}
