package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type LocationHistory struct {
	ID         uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	VehicleID  uuid.UUID `gorm:"type:uuid;not null;index:idx_vehicle_time" json:"vehicle_id"`
	Latitude   float64   `gorm:"not null" json:"latitude"`
	Longitude  float64   `gorm:"not null" json:"longitude"`
	RecordedAt time.Time `gorm:"not null;index:idx_vehicle_time" json:"recorded_at"`
}

func (l *LocationHistory) BeforeCreate(tx *gorm.DB) error {
	if l.ID == uuid.Nil {
		l.ID = uuid.New()
	}
	if l.RecordedAt.IsZero() {
		l.RecordedAt = time.Now()
	}
	return nil
}
