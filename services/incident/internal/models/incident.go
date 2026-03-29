package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Incident struct {
	ID               uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	CitizenName      string     `gorm:"size:255;not null" json:"citizen_name"`
	CitizenPhone     string     `gorm:"size:20" json:"citizen_phone"`
	IncidentType     string     `gorm:"size:50;not null;index" json:"incident_type"`
	Latitude         float64    `gorm:"not null" json:"latitude"`
	Longitude        float64    `gorm:"not null" json:"longitude"`
	Notes            string     `gorm:"type:text" json:"notes"`
	CreatedBy        uuid.UUID  `gorm:"type:uuid;not null" json:"created_by"`
	AssignedUnitID   *uuid.UUID `gorm:"type:uuid" json:"assigned_unit_id,omitempty"`
	AssignedUnitType string     `gorm:"size:50" json:"assigned_unit_type,omitempty"`
	Status           string     `gorm:"size:50;not null;default:'created';index" json:"status"`
	DispatchedAt     *time.Time `json:"dispatched_at,omitempty"`
	ResolvedAt       *time.Time `json:"resolved_at,omitempty"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
}

func (i *Incident) BeforeCreate(tx *gorm.DB) error {
	if i.ID == uuid.Nil {
		i.ID = uuid.New()
	}
	if i.Status == "" {
		i.Status = StatusCreated
	}
	return nil
}

// Incident types
const (
	TypeCrime   = "crime"
	TypeFire    = "fire"
	TypeMedical = "medical"
)

// Incident statuses
const (
	StatusCreated    = "created"
	StatusDispatched = "dispatched"
	StatusInProgress = "in_progress"
	StatusResolved   = "resolved"
)

// Role definitions
const (
	RoleSystemAdmin     = "system_admin"
	RoleHospitalAdmin   = "hospital_admin"
	RolePoliceAdmin     = "police_admin"
	RoleFireAdmin       = "fire_admin"
	RoleAmbulanceDriver = "ambulance_driver"
	RolePoliceDriver    = "police_driver"
	RoleFireDriver      = "fire_driver"
)

func ValidIncidentTypes() []string {
	return []string{TypeCrime, TypeFire, TypeMedical}
}

func IsValidIncidentType(t string) bool {
	for _, v := range ValidIncidentTypes() {
		if v == t {
			return true
		}
	}
	return false
}

func ValidStatuses() []string {
	return []string{StatusCreated, StatusDispatched, StatusInProgress, StatusResolved}
}

func IsValidStatus(s string) bool {
	for _, v := range ValidStatuses() {
		if v == s {
			return true
		}
	}
	return false
}

// CanTransitionStatus enforces legal lifecycle movement for incidents.
// Idempotent updates (same status) are allowed.
func CanTransitionStatus(from, to string) bool {
	if from == to {
		return true
	}
	switch from {
	case StatusCreated:
		return to == StatusDispatched || to == StatusResolved
	case StatusDispatched:
		return to == StatusInProgress || to == StatusResolved
	case StatusInProgress:
		return to == StatusResolved
	case StatusResolved:
		return false
	default:
		return false
	}
}
