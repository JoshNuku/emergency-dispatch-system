package services

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"

	"github.com/google/uuid"

	"emergency-dispatch/services/incident/internal/models"
	"emergency-dispatch/services/incident/internal/mq"
	"emergency-dispatch/services/incident/internal/repository"
)

type DispatchService struct {
	stationRepo        *repository.StationRepository
	incidentRepo       *repository.IncidentRepository
	publisher          *mq.Publisher
	dispatchServiceURL string
}

func NewDispatchService(
	stationRepo *repository.StationRepository,
	incidentRepo *repository.IncidentRepository,
	publisher *mq.Publisher,
	dispatchServiceURL string,
) *DispatchService {
	return &DispatchService{
		stationRepo:        stationRepo,
		incidentRepo:       incidentRepo,
		publisher:          publisher,
		dispatchServiceURL: dispatchServiceURL,
	}
}

type AvailableVehicleResponse struct {
	ID        string `json:"id"`
	StationID string `json:"station_id"`
	Type      string `json:"vehicle_type"`
}

// AutoDispatch finds the nearest available station and assigns a vehicle to the incident
func (s *DispatchService) AutoDispatch(incident *models.Incident) error {
	// Map incident type to station type
	stationType := models.MapIncidentTypeToStationType(incident.IncidentType)

	// Find nearest available station via PostGIS
	station, err := s.stationRepo.FindNearestAvailable(incident.Latitude, incident.Longitude, stationType)
	if err != nil {
		log.Printf("No available %s station found for incident %s: %v", stationType, incident.ID, err)
		return fmt.Errorf("no available %s station found", stationType)
	}

	log.Printf("Nearest %s station for incident %s: %s (%s)", stationType, incident.ID, station.Name, station.ID)

	// Try to find an available vehicle at that station via the dispatch service
	vehicle, err := s.findAvailableVehicle(station.ID, stationType)
	if err != nil {
		log.Printf("No available vehicle at station %s: %v", station.ID, err)
		// Still assign the station even if no vehicle is immediately available
	}

	// Assign station and vehicle to incident
	incident.AssignedUnitID = &station.ID
	incident.AssignedUnitType = stationType
	incident.Status = models.StatusDispatched

	now := incident.UpdatedAt
	incident.DispatchedAt = &now

	if err := s.incidentRepo.Update(incident); err != nil {
		return fmt.Errorf("failed to update incident: %w", err)
	}

	// Publish events to RabbitMQ
	if s.publisher != nil {
		s.publisher.PublishIncidentCreated(incident)

		vehicleID := ""
		if vehicle != nil {
			vehicleID = vehicle.ID
		}
		s.publisher.PublishIncidentDispatched(incident, station.ID.String(), vehicleID)
	}

	return nil
}

func (s *DispatchService) findAvailableVehicle(stationID uuid.UUID, stationType string) (*AvailableVehicleResponse, error) {
	url := fmt.Sprintf("%s/vehicles/available?station_id=%s", s.dispatchServiceURL, stationID)
	resp, err := http.Get(url)
	if err != nil {
		return nil, fmt.Errorf("dispatch service unavailable: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("dispatch service returned %d: %s", resp.StatusCode, string(body))
	}

	var vehicles []AvailableVehicleResponse
	if err := json.NewDecoder(resp.Body).Decode(&vehicles); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	if len(vehicles) == 0 {
		return nil, fmt.Errorf("no available vehicles at station %s", stationID)
	}

	return &vehicles[0], nil
}
