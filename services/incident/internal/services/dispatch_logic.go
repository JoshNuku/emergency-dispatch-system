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

	// Fetch nearest available vehicles from the dispatch service
	vehicles, err := s.findNearestVehicles(incident.Latitude, incident.Longitude, vehicleType, 5)
	if err != nil {
		return fmt.Errorf("failed to fetch candidate vehicles: %w", err)
	}

	var selectedVehicle *AvailableVehicleResponse
	var selectedStation *models.ResponderStation

	// Iterate through candidates to find one from a station with capacity
	for _, v := range vehicles {
		stationID, err := uuid.Parse(v.StationID)
		if err != nil {
			continue
		}

		station, err := s.stationRepo.FindByID(stationID)
		if err != nil {
			log.Printf("WARN: Station %s not found in incident database", v.StationID)
			continue
		}

		// Capacity check: if it's a hospital or if capacity is tracked, it must be > 0
		// If capacity is 0/0 and it's not a hospital, we can treat it as unlimited or check specific rules.
		// For this implementation, we enforce capacity if AvailableCapacity is set or if it's a hospital.
		if station.Type == models.StationTypeHospital && station.AvailableCapacity <= 0 {
			log.Printf("INFO: Skipping vehicle %s because station %s is at capacity", v.ID, station.Name)
			continue
		}

		// Found a valid candidate
		selectedVehicle = &v
		selectedStation = station
		break
	}

	if selectedVehicle == nil {
		return fmt.Errorf("no available %s found with station capacity", vehicleType)
	}

	log.Printf("Nearest %s with capacity for incident %s: %s (Station: %s)", vehicleType, incident.ID, selectedVehicle.ID, selectedStation.Name)

	// Mark vehicle and station as dispatched in the incident record
	vehicleUUID, _ := uuid.Parse(selectedVehicle.ID)
	stationUUID, _ := uuid.Parse(selectedVehicle.StationID)
	
	incident.AssignedUnitID = &vehicleUUID
	incident.AssignedStationID = &stationUUID
	incident.AssignedUnitType = vehicleType
	incident.Status = models.StatusDispatched

	now := time.Now()
	incident.DispatchedAt = &now

	// Update station capacity (decrement)
	if selectedStation.Type == models.StationTypeHospital {
		selectedStation.AvailableCapacity--
		if err := s.stationRepo.Update(selectedStation); err != nil {
			log.Printf("WARN: Failed to decrement capacity for station %s: %v", selectedStation.ID, err)
		}
	}

	if err := s.incidentRepo.Update(incident); err != nil {
		return fmt.Errorf("failed to update incident: %w", err)
	}

	// ── Synchronize vehicle status in the dispatch service ──────────────
	if err := s.updateVehicleStatus(selectedVehicle.ID, "en_route"); err != nil {
		log.Printf("WARN: Failed to update vehicle %s status to en_route: %v", selectedVehicle.ID, err)
	}

	// Publish events to RabbitMQ
	if s.publisher != nil {
		s.publisher.PublishIncidentCreated(incident)
		s.publisher.PublishIncidentDispatched(incident, selectedVehicle.StationID, selectedVehicle.ID)
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

// findNearestVehicles calls the dispatch service to find multiple nearest available vehicles
func (s *DispatchService) findNearestVehicles(lat, lng float64, vehicleType string, limit int) ([]AvailableVehicleResponse, error) {
	url := fmt.Sprintf("%s/vehicles/nearest?lat=%f&lng=%f&type=%s&limit=%d", s.dispatchServiceURL, lat, lng, vehicleType, limit)
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

	return vehicles, nil
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
