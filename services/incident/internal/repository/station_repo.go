package repository

import (
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"emergency-dispatch/services/incident/internal/models"
)

type StationRepository struct {
	db *gorm.DB
}

func NewStationRepository(db *gorm.DB) *StationRepository {
	return &StationRepository{db: db}
}

func (r *StationRepository) Create(station *models.ResponderStation) error {
	return r.db.Create(station).Error
}

func (r *StationRepository) FindByID(id uuid.UUID) (*models.ResponderStation, error) {
	var station models.ResponderStation
	err := r.db.Where("id = ?", id).First(&station).Error
	if err != nil {
		return nil, err
	}
	return &station, nil
}

func (r *StationRepository) FindAll(stationType string) ([]models.ResponderStation, error) {
	query := r.db.Order("name ASC")
	if stationType != "" {
		query = query.Where("type = ?", stationType)
	}
	var stations []models.ResponderStation
	err := query.Find(&stations).Error
	return stations, err
}

func (r *StationRepository) Update(station *models.ResponderStation) error {
	return r.db.Save(station).Error
}

// FindNearestAvailable uses PostGIS to find the nearest available station of a given type.
// For hospitals (medical emergencies), it also checks available_capacity > 0.
func (r *StationRepository) FindNearestAvailable(lat, lng float64, stationType string) (*models.ResponderStation, error) {
	var station models.ResponderStation

	query := r.db.Where("type = ? AND is_available = true", stationType)

	// For hospitals, also require available capacity
	if stationType == models.StationTypeHospital {
		query = query.Where("available_capacity > 0")
	}

	// Use PostGIS ST_Distance to order by distance from the incident location
	orderClause := fmt.Sprintf(
		"ST_Distance(ST_MakePoint(longitude, latitude)::geography, ST_MakePoint(%f, %f)::geography) ASC",
		lng, lat,
	)
	err := query.
		Order(orderClause).
		First(&station).Error

	if err != nil {
		return nil, err
	}
	return &station, nil
}
