package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type ResponderStation struct {
	ID                uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	Name              string    `gorm:"size:255;not null" json:"name"`
	Type              string    `gorm:"size:50;not null;index" json:"type"` // police, fire, hospital
	Latitude          float64   `gorm:"not null" json:"latitude"`
	Longitude         float64   `gorm:"not null" json:"longitude"`
	IsAvailable       bool      `gorm:"default:true" json:"is_available"`
	TotalCapacity     int       `json:"total_capacity,omitempty"`     // for hospitals
	AvailableCapacity int       `json:"available_capacity,omitempty"` // for hospitals
	ContactPhone      string    `gorm:"size:20" json:"contact_phone,omitempty"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

func (s *ResponderStation) BeforeCreate(tx *gorm.DB) error {
	if s.ID == uuid.Nil {
		s.ID = uuid.New()
	}
	return nil
}

// Station types
const (
	StationTypePolice   = "police"
	StationTypeFire     = "fire"
	StationTypeHospital = "hospital"
)

func ValidStationTypes() []string {
	return []string{StationTypePolice, StationTypeFire, StationTypeHospital}
}

func IsValidStationType(t string) bool {
	for _, v := range ValidStationTypes() {
		if v == t {
			return true
		}
	}
	return false
}

// MapIncidentTypeToStationType returns the responder station type for an incident type
func MapIncidentTypeToStationType(incidentType string) string {
	switch incidentType {
	case TypeCrime:
		return StationTypePolice
	case TypeFire:
		return StationTypeFire
	case TypeMedical:
		return StationTypeHospital
	default:
		return StationTypePolice
	}
}
