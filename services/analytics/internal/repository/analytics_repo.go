package repository

import (
	"gorm.io/gorm"

	"emergency-dispatch/services/analytics/internal/models"
)

type AnalyticsRepository struct {
	db *gorm.DB
}

func NewAnalyticsRepository(db *gorm.DB) *AnalyticsRepository {
	return &AnalyticsRepository{db: db}
}

func (r *AnalyticsRepository) UpsertIncidentMetric(metric *models.IncidentMetric) error {
	// Try to find existing metric for this incident
	var existing models.IncidentMetric
	err := r.db.Where("incident_id = ?", metric.IncidentID).First(&existing).Error
	if err == gorm.ErrRecordNotFound {
		return r.db.Create(metric).Error
	}
	if err != nil {
		return err
	}

	// Update existing metrics
	updates := map[string]interface{}{}
	if metric.ResponderType != "" {
		updates["responder_type"] = metric.ResponderType
	}
	if metric.ResponderStationID != nil {
		updates["responder_station_id"] = metric.ResponderStationID
	}
	if metric.ResponseTimeSeconds != nil {
		updates["response_time_seconds"] = metric.ResponseTimeSeconds
	}
	if metric.ResolutionTimeSeconds != nil {
		updates["resolution_time_seconds"] = metric.ResolutionTimeSeconds
	}

	if len(updates) > 0 {
		return r.db.Model(&existing).Updates(updates).Error
	}
	return nil
}

func (r *AnalyticsRepository) SaveHospitalCapacity(log *models.HospitalCapacityLog) error {
	return r.db.Create(log).Error
}

// Analytics queries

func (r *AnalyticsRepository) GetResponseTimes() ([]models.ResponseTimeResult, error) {
	var results []models.ResponseTimeResult
	err := r.db.Model(&models.IncidentMetric{}).
		Select("incident_type, AVG(response_time_seconds) as avg_seconds, MIN(response_time_seconds) as min_seconds, MAX(response_time_seconds) as max_seconds, COUNT(*) as count").
		Where("response_time_seconds IS NOT NULL").
		Group("incident_type").
		Scan(&results).Error
	return results, err
}

func (r *AnalyticsRepository) GetIncidentsByRegion() ([]models.RegionIncidentCount, error) {
	var results []models.RegionIncidentCount
	err := r.db.Model(&models.IncidentMetric{}).
		Select("region, incident_type, COUNT(*) as count").
		Group("region, incident_type").
		Order("count DESC").
		Scan(&results).Error
	return results, err
}

func (r *AnalyticsRepository) GetResourceUtilization() ([]models.ResourceUtilization, error) {
	var results []models.ResourceUtilization
	err := r.db.Model(&models.IncidentMetric{}).
		Select("responder_type, responder_station_id, COUNT(*) as dispatch_count").
		Where("responder_station_id IS NOT NULL").
		Group("responder_type, responder_station_id").
		Order("dispatch_count DESC").
		Scan(&results).Error
	return results, err
}

func (r *AnalyticsRepository) GetHospitalCapacity() ([]models.HospitalCapacityLog, error) {
	var logs []models.HospitalCapacityLog
	// Get latest capacity record per hospital
	err := r.db.Raw(`
		SELECT DISTINCT ON (hospital_id) *
		FROM hospital_capacity_logs
		ORDER BY hospital_id, recorded_at DESC
	`).Scan(&logs).Error
	return logs, err
}

func (r *AnalyticsRepository) GetDashboardStats() (map[string]interface{}, error) {
	stats := map[string]interface{}{}

	var totalIncidents int64
	r.db.Model(&models.IncidentMetric{}).Count(&totalIncidents)
	stats["total_incidents"] = totalIncidents

	var avgResponseTime float64
	r.db.Model(&models.IncidentMetric{}).
		Where("response_time_seconds IS NOT NULL").
		Select("COALESCE(AVG(response_time_seconds), 0)").
		Scan(&avgResponseTime)
	stats["avg_response_time_seconds"] = avgResponseTime

	// Incidents by type
	type typeCount struct {
		IncidentType string `json:"incident_type"`
		Count        int    `json:"count"`
	}
	var typeCounts []typeCount
	r.db.Model(&models.IncidentMetric{}).
		Select("incident_type, COUNT(*) as count").
		Group("incident_type").
		Scan(&typeCounts)
	stats["incidents_by_type"] = typeCounts

	return stats, nil
}
