package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type IncidentMetric struct {
	ID                    uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	IncidentID            uuid.UUID  `gorm:"type:uuid;not null;uniqueIndex" json:"incident_id"`
	IncidentType          string     `gorm:"size:50;not null;index" json:"incident_type"`
	Latitude              float64    `json:"latitude"`
	Longitude             float64    `json:"longitude"`
	Region                string     `gorm:"size:255;index" json:"region"`
	ResponderType         string     `gorm:"size:50" json:"responder_type"`
	ResponderStationID    *uuid.UUID `gorm:"type:uuid" json:"responder_station_id,omitempty"`
	ResponseTimeSeconds   *int       `json:"response_time_seconds,omitempty"`
	ResolutionTimeSeconds *int       `json:"resolution_time_seconds,omitempty"`
	CreatedAt             time.Time  `json:"created_at"`
}

func (m *IncidentMetric) BeforeCreate(tx *gorm.DB) error {
	if m.ID == uuid.Nil {
		m.ID = uuid.New()
	}
	return nil
}

type HospitalCapacityLog struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	HospitalID    uuid.UUID `gorm:"type:uuid;not null;index" json:"hospital_id"`
	HospitalName  string    `gorm:"size:255" json:"hospital_name"`
	TotalBeds     int       `json:"total_beds"`
	AvailableBeds int       `json:"available_beds"`
	RecordedAt    time.Time `gorm:"not null" json:"recorded_at"`
}

func (h *HospitalCapacityLog) BeforeCreate(tx *gorm.DB) error {
	if h.ID == uuid.Nil {
		h.ID = uuid.New()
	}
	return nil
}

// Aggregation result types

type ResponseTimeResult struct {
	IncidentType string  `json:"incident_type"`
	AvgSeconds   float64 `json:"avg_response_time_seconds"`
	MinSeconds   int     `json:"min_response_time_seconds"`
	MaxSeconds   int     `json:"max_response_time_seconds"`
	Count        int     `json:"count"`
}

type RegionIncidentCount struct {
	Region       string `json:"region"`
	IncidentType string `json:"incident_type"`
	Count        int    `json:"count"`
}

type ResourceUtilization struct {
	ResponderType      string `json:"responder_type"`
	ResponderStationID string `json:"responder_station_id"`
	DispatchCount      int    `json:"dispatch_count"`
}
