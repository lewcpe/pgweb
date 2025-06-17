package models

import (
	"time"
	"github.com/google/uuid"
)

// ManagedDatabase corresponds to the managed_databases table
type ManagedDatabase struct {
	DatabaseID     uuid.UUID `json:"database_id" gorm:"type:uuid;primary_key;"`
	OwnerUserID    uuid.UUID `json:"owner_user_id" gorm:"type:uuid;index"` // Foreign key
	PGDatabaseName string    `json:"pg_database_name" gorm:"type:varchar(63);uniqueIndex"`
	Status         string    `json:"status" gorm:"type:varchar(20)"` // ENUM: active, soft_deleted, etc.
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// ManagedPGUser corresponds to the managed_pg_users table
type ManagedPGUser struct {
	PGUserID          uuid.UUID `json:"pg_user_id" gorm:"type:uuid;primary_key;"`
	ManagedDatabaseID uuid.UUID `json:"managed_database_id" gorm:"type:uuid;index"` // Foreign key
	PGUsername        string    `json:"pg_username" gorm:"type:varchar(63)"` // Unique within its managed_database_id
	PermissionLevel   string    `json:"permission_level" gorm:"type:varchar(10)"` // ENUM: read, write
	Status            string    `json:"status" gorm:"type:varchar(20)"` // ENUM: active, deactivated_db_soft_deleted, etc.
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}
