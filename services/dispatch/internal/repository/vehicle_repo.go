package repository

import (
	"github.com/google/uuid"
	"gorm.io/gorm"

	"emergency-dispatch/services/dispatch/internal/models"
)

type VehicleRepository struct {
	db *gorm.DB
}

func NewVehicleRepository(db *gorm.DB) *VehicleRepository {
	return &VehicleRepository{db: db}
}

func (r *VehicleRepository) Create(vehicle *models.Vehicle) error {
	return r.db.Create(vehicle).Error
}

func (r *VehicleRepository) FindByID(id uuid.UUID) (*models.Vehicle, error) {
	var vehicle models.Vehicle
	err := r.db.Where("id = ?", id).First(&vehicle).Error
	if err != nil {
		return nil, err
	}
	return &vehicle, nil
}

func (r *VehicleRepository) FindAll(stationID string) ([]models.Vehicle, error) {
	query := r.db.Order("created_at DESC")
	if stationID != "" {
		query = query.Where("station_id = ?", stationID)
	}
	var vehicles []models.Vehicle
	err := query.Find(&vehicles).Error
	return vehicles, err
}

func (r *VehicleRepository) FindAvailable(stationID string) ([]models.Vehicle, error) {
	query := r.db.Where("status = ?", models.VehicleAvailable)
	if stationID != "" {
		query = query.Where("station_id = ?", stationID)
	}
	var vehicles []models.Vehicle
	err := query.Find(&vehicles).Error
	return vehicles, err
}

func (r *VehicleRepository) Update(vehicle *models.Vehicle) error {
	return r.db.Save(vehicle).Error
}

// Location history operations

func (r *VehicleRepository) SaveLocationHistory(loc *models.LocationHistory) error {
	return r.db.Create(loc).Error
}

func (r *VehicleRepository) GetLatestLocation(vehicleID uuid.UUID) (*models.LocationHistory, error) {
	var loc models.LocationHistory
	err := r.db.Where("vehicle_id = ?", vehicleID).
		Order("recorded_at DESC").
		First(&loc).Error
	if err != nil {
		return nil, err
	}
	return &loc, nil
}

func (r *VehicleRepository) GetLocationHistory(vehicleID uuid.UUID, limit int) ([]models.LocationHistory, error) {
	var history []models.LocationHistory
	err := r.db.Where("vehicle_id = ?", vehicleID).
		Order("recorded_at DESC").
		Limit(limit).
		Find(&history).Error
	return history, err
}
