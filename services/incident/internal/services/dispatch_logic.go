package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

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

// AutoDispatch finds the nearest available responder and assigns it to the incident
func (s *DispatchService) AutoDispatch(incident *models.Incident) error {
	// Map incident type to vehicle type
	var vehicleType string
	switch incident.IncidentType {
	case models.TypeCrime:
		vehicleType = "police_car"
	case models.TypeFire:
		vehicleType = "fire_truck"
	case models.TypeMedical:
		vehicleType = "ambulance"
	default:
		vehicleType = "ambulance"
	}

	// Find nearest available vehicle across all stations
	vehicle, err := s.findNearestVehicle(incident.Latitude, incident.Longitude, vehicleType)
	if err != nil {
		log.Printf("No available %s found for incident %s: %v", vehicleType, incident.ID, err)
		return fmt.Errorf("no available %s found", vehicleType)
	}

	log.Printf("Nearest %s for incident %s: %s (Station: %s)", vehicleType, incident.ID, vehicle.ID, vehicle.StationID)

	// Mark vehicle as dispatched in the incident record
	vehicleID, _ := uuid.Parse(vehicle.ID)
	incident.AssignedUnitID = &vehicleID
	incident.AssignedUnitType = vehicleType
	incident.Status = models.StatusDispatched

	now := time.Now()
	incident.DispatchedAt = &now

	if err := s.incidentRepo.Update(incident); err != nil {
		return fmt.Errorf("failed to update incident: %w", err)
	}

	// ── Synchronize vehicle status in the dispatch service ──────────────
	// Mark the vehicle as en_route so it's no longer shown as available
	if err := s.updateVehicleStatus(vehicle.ID, "en_route"); err != nil {
		log.Printf("WARN: Failed to update vehicle %s status to en_route: %v", vehicle.ID, err)
		// Non-fatal: incident is already dispatched, vehicle status is secondary
	}

	// Publish events to RabbitMQ
	if s.publisher != nil {
		s.publisher.PublishIncidentCreated(incident)
		s.publisher.PublishIncidentDispatched(incident, vehicle.StationID, vehicle.ID)
	}

	return nil
}

// ReleaseVehicle sets a dispatched vehicle back to available status.
// Called when an incident is resolved.
func (s *DispatchService) ReleaseVehicle(vehicleID string) error {
	if vehicleID == "" {
		return nil
	}
	return s.updateVehicleStatus(vehicleID, "available")
}

// updateVehicleStatus calls the dispatch service to update a vehicle's status
func (s *DispatchService) updateVehicleStatus(vehicleID, status string) error {
	url := fmt.Sprintf("%s/vehicles/%s/status/internal", s.dispatchServiceURL, vehicleID)
	payload, _ := json.Marshal(map[string]string{"status": status})

	req, err := http.NewRequest("PUT", url, bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("dispatch service unavailable: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("dispatch service returned %d: %s", resp.StatusCode, string(body))
	}

	log.Printf("Vehicle %s status updated to %s via dispatch service", vehicleID, status)
	return nil
}

func (s *DispatchService) findNearestVehicle(lat, lng float64, vehicleType string) (*AvailableVehicleResponse, error) {
	url := fmt.Sprintf("%s/vehicles/nearest?lat=%f&lng=%f&type=%s", s.dispatchServiceURL, lat, lng, vehicleType)
	resp, err := http.Get(url)
	if err != nil {
		return nil, fmt.Errorf("dispatch service unavailable: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("dispatch service returned %d: %s", resp.StatusCode, string(body))
	}

	var vehicle AvailableVehicleResponse
	if err := json.NewDecoder(resp.Body).Decode(&vehicle); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &vehicle, nil
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
