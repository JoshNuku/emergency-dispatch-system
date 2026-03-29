package repository

import (
	"github.com/google/uuid"
	"gorm.io/gorm"

	"emergency-dispatch/services/incident/internal/models"
)

type IncidentRepository struct {
	db *gorm.DB
}

func NewIncidentRepository(db *gorm.DB) *IncidentRepository {
	return &IncidentRepository{db: db}
}

func (r *IncidentRepository) Create(incident *models.Incident) error {
	return r.db.Create(incident).Error
}

func (r *IncidentRepository) FindByID(id uuid.UUID) (*models.Incident, error) {
	var incident models.Incident
	err := r.db.Where("id = ?", id).First(&incident).Error
	if err != nil {
		return nil, err
	}
	return &incident, nil
}

func (r *IncidentRepository) FindAll(status, incidentType, stationType string) ([]models.Incident, error) {
	query := r.db.Order("created_at DESC")
	if status != "" {
		query = query.Where("status = ?", status)
	}
	if incidentType != "" {
		query = query.Where("incident_type = ?", incidentType)
	}
	if stationType != "" {
		query = query.Where("assigned_unit_type = ? OR assigned_unit_type IS NULL", stationType)
	}
	var incidents []models.Incident
	err := query.Find(&incidents).Error
	return incidents, err
}

func (r *IncidentRepository) FindOpen(stationType string) ([]models.Incident, error) {
	query := r.db.Where("status != ?", models.StatusResolved).Order("created_at DESC")
	if stationType != "" {
		query = query.Where("assigned_unit_type = ? OR assigned_unit_type IS NULL OR assigned_unit_type = ''", stationType)
	}

	var incidents []models.Incident
	err := query.Find(&incidents).Error
	return incidents, err
}

func (r *IncidentRepository) Update(incident *models.Incident) error {
	return r.db.Save(incident).Error
}

func (r *IncidentRepository) FindActiveByAssignedUnitID(unitID uuid.UUID) (*models.Incident, error) {
	var incident models.Incident
	err := r.db.
		Where("assigned_unit_id = ?", unitID).
		Where("status != ?", models.StatusResolved).
		Order("created_at DESC").
		First(&incident).Error
	if err != nil {
		return nil, err
	}
	return &incident, nil
}
