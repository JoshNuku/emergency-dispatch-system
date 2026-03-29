package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Vehicle struct {
	ID           uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	StationID    uuid.UUID  `gorm:"type:uuid;not null;index" json:"station_id"`
	StationType  string     `gorm:"size:50;not null" json:"station_type"`
	VehicleType  string     `gorm:"size:50;not null;index" json:"vehicle_type"` // ambulance, fire_truck, police_car
	LicensePlate string     `gorm:"size:50;uniqueIndex" json:"license_plate"`
	DriverName   string     `gorm:"size:255" json:"driver_name"`
	DriverID     *uuid.UUID `gorm:"type:uuid;uniqueIndex" json:"driver_id,omitempty"`
	Status       string     `gorm:"size:50;not null;default:'available';index" json:"status"`
	Latitude     float64    `json:"latitude"`
	Longitude    float64    `json:"longitude"`
	IncidentID   *uuid.UUID `gorm:"type:uuid" json:"incident_id,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

func (v *Vehicle) BeforeCreate(tx *gorm.DB) error {
	if v.ID == uuid.Nil {
		v.ID = uuid.New()
	}
	return nil
}

// Vehicle statuses
const (
	VehicleAvailable = "available"
	VehicleEnRoute   = "en_route"
	VehicleAtScene   = "at_scene"
	VehicleReturning = "returning"
	VehicleOffDuty   = "off_duty"
)

// Role definitions
const (
	RoleSystemAdmin     = "system_admin"
	RoleHospitalAdmin   = "hospital_admin"
	RolePoliceAdmin     = "police_admin"
	RoleFireAdmin       = "fire_admin"
	RoleAmbulanceDriver = "ambulance_driver"
)

// Vehicle types
const (
	VehicleTypeAmbulance = "ambulance"
	VehicleTypeFireTruck = "fire_truck"
	VehicleTypePoliceCar = "police_car"
)
