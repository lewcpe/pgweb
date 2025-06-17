package models

import (
	"time"
	"github.com/google/uuid"
)

// ApplicationUser corresponds to the application_users table
type ApplicationUser struct {
	InternalUserID uuid.UUID `json:"internal_user_id" gorm:"type:uuid;primary_key;"`
	OIDCSub        string    `json:"oidc_sub" gorm:"type:varchar(255);uniqueIndex"`
	Email          string    `json:"email,omitempty" gorm:"type:varchar(255)"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}
