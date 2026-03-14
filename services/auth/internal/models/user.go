package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type User struct {
	ID           uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	Name         string     `gorm:"size:255;not null" json:"name"`
	Email        string     `gorm:"size:255;uniqueIndex;not null" json:"email"`
	PasswordHash string     `gorm:"size:255;not null" json:"-"`
	Role         string     `gorm:"size:50;not null" json:"role"`
	StationID    *uuid.UUID `gorm:"type:uuid" json:"station_id,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

func (u *User) BeforeCreate(tx *gorm.DB) error {
	if u.ID == uuid.Nil {
		u.ID = uuid.New()
	}
	return nil
}

// Valid roles
const (
	RoleSystemAdmin     = "system_admin"
	RoleHospitalAdmin   = "hospital_admin"
	RolePoliceAdmin     = "police_admin"
	RoleFireAdmin       = "fire_admin"
	RoleAmbulanceDriver = "ambulance_driver"
)

func ValidRoles() []string {
	return []string{
		RoleSystemAdmin,
		RoleHospitalAdmin,
		RolePoliceAdmin,
		RoleFireAdmin,
		RoleAmbulanceDriver,
	}
}

func IsValidRole(role string) bool {
	for _, r := range ValidRoles() {
		if r == role {
			return true
		}
	}
	return false
}
