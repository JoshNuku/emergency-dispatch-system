package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"emergency-dispatch/services/dispatch/internal/models"
	"emergency-dispatch/services/dispatch/internal/mq"
	"emergency-dispatch/services/dispatch/internal/repository"
)

type VehicleHandler struct {
	repo      *repository.VehicleRepository
	publisher *mq.Publisher
}

func NewVehicleHandler(repo *repository.VehicleRepository, publisher *mq.Publisher) *VehicleHandler {
	return &VehicleHandler{repo: repo, publisher: publisher}
}

type RegisterVehicleRequest struct {
	StationID    string  `json:"station_id" binding:"required"`
	StationType  string  `json:"station_type" binding:"required"`
	VehicleType  string  `json:"vehicle_type" binding:"required"`
	LicensePlate string  `json:"license_plate"`
	DriverName   string  `json:"driver_name"`
	DriverID     string  `json:"driver_id"`
	Latitude     float64 `json:"latitude"`
	Longitude    float64 `json:"longitude"`
}

type UpdateLocationRequest struct {
	Latitude  float64 `json:"latitude" binding:"required"`
	Longitude float64 `json:"longitude" binding:"required"`
}

type UpdateStatusRequest struct {
	Status string `json:"status" binding:"required"`
}

type UpdateVehicleRequest struct {
	StationID    *string `json:"station_id"`
	StationType  *string `json:"station_type"`
	VehicleType  *string `json:"vehicle_type"`
	LicensePlate *string `json:"license_plate"`
	DriverName   *string `json:"driver_name"`
	DriverID     *string `json:"driver_id"`
}

// map vehicle types to the expected station type
func vehicleTypeToStationType(vehicleType string) string {
	switch vehicleType {
	case models.VehicleTypeAmbulance:
		return "hospital"
	case models.VehicleTypeFireTruck:
		return "fire"
	case models.VehicleTypePoliceCar:
		return "police"
	default:
		return ""
	}
}

func normalizeVehicleStatus(status string) (string, bool) {
	s := strings.ToLower(strings.TrimSpace(status))
	s = strings.ReplaceAll(s, "-", "_")
	s = strings.ReplaceAll(s, " ", "_")

	switch s {
	case "available":
		return models.VehicleAvailable, true
	case "enroute", "en_route":
		return models.VehicleEnRoute, true
	case "atscene", "at_scene", "on_scene":
		return models.VehicleAtScene, true
	case "returning":
		return models.VehicleReturning, true
	case "offduty", "off_duty":
		return models.VehicleOffDuty, true
	default:
		return "", false
	}
}

func isSystemAdmin(role string) bool {
	return role == models.RoleSystemAdmin
}

func roleToStationType(role string) string {
	switch role {
	case models.RoleHospitalAdmin:
		return "hospital"
	case models.RolePoliceAdmin:
		return "police"
	case models.RoleFireAdmin:
		return "fire"
	default:
		return ""
	}
}

func isVehicleManagerRole(role string) bool {
	return role == models.RoleSystemAdmin ||
		role == models.RoleHospitalAdmin ||
		role == models.RolePoliceAdmin ||
		role == models.RoleFireAdmin
}

func ensureVehicleStationAccess(c *gin.Context, vehicle *models.Vehicle) bool {
	roleValue, hasRole := c.Get("role")
	if !hasRole {
		// Internal service-to-service route (no auth middleware)
		return true
	}

	role, _ := roleValue.(string)
	if role == "" || isSystemAdmin(role) {
		return true
	}

	stationValue, _ := c.Get("stationID")
	stationIDStr, _ := stationValue.(string)
	if stationIDStr == "" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Station-scoped access requires station assignment"})
		return false
	}

	claimStationID, err := uuid.Parse(stationIDStr)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "Invalid station assignment"})
		return false
	}

	if vehicle.StationID != claimStationID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Access denied for vehicle outside your station"})
		return false
	}

	return true
}

// RegisterVehicle creates a new vehicle record
func (h *VehicleHandler) RegisterVehicle(c *gin.Context) {
	roleValue, hasRole := c.Get("role")
	roleStr, _ := roleValue.(string)
	if hasRole && !isVehicleManagerRole(roleStr) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only admins can register vehicles"})
		return
	}

	var req RegisterVehicleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// parse and validate station ID
	stationID, err := uuid.Parse(req.StationID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid station_id"})
		return
	}

	if hasRole && !isSystemAdmin(roleStr) {
		stationValue, _ := c.Get("stationID")
		stationIDStr, _ := stationValue.(string)
		if stationIDStr == "" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Station-scoped access requires station assignment"})
			return
		}

		claimStationID, err := uuid.Parse(stationIDStr)
		if err != nil {
			c.JSON(http.StatusForbidden, gin.H{"error": "Invalid station assignment"})
			return
		}

		if stationID != claimStationID {
			c.JSON(http.StatusForbidden, gin.H{"error": "You can only register vehicles for your station"})
			return
		}

		allowedStationType := roleToStationType(roleStr)
		if allowedStationType != "" && req.StationType != allowedStationType {
			c.JSON(http.StatusForbidden, gin.H{"error": "You can only register vehicles for your department station type"})
			return
		}
	}

	// Validate vehicle type -> station type mapping
	expectedStation := vehicleTypeToStationType(req.VehicleType)
	if expectedStation == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Unknown vehicle_type"})
		return
	}
	if req.StationType != expectedStation {
		c.JSON(http.StatusBadRequest, gin.H{"error": "vehicle_type does not match station_type"})
		return
	}

	// Check license plate uniqueness (if provided)
	if req.LicensePlate != "" {
		if _, err := h.repo.FindByLicensePlate(req.LicensePlate); err == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "License plate already registered"})
			return
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to validate license plate"})
			return
		}
	}

	// If driver provided, ensure driver is not already assigned
	var driverUUID *uuid.UUID
	if req.DriverID != "" {
		did, err := uuid.Parse(req.DriverID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid driver_id"})
			return
		}
		if v, err := h.repo.FindByDriverID(did); err == nil {
			// Found an existing vehicle with this driver assigned
			if v != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Driver already assigned to a vehicle"})
				return
			}
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to validate driver assignment"})
			return
		}
		driverUUID = &did
	}

	vehicle := &models.Vehicle{
		StationID:    stationID,
		StationType:  req.StationType,
		VehicleType:  req.VehicleType,
		LicensePlate: req.LicensePlate,
		DriverName:   req.DriverName,
		Latitude:     req.Latitude,
		Longitude:    req.Longitude,
	}

	if driverUUID != nil {
		vehicle.DriverID = driverUUID
	}

	if err := h.repo.Create(vehicle); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to register vehicle"})
		return
	}

	c.JSON(http.StatusCreated, vehicle)
}

// ListVehicles returns all vehicles
func (h *VehicleHandler) ListVehicles(c *gin.Context) {
	role, _ := c.Get("role")
	roleStr, _ := role.(string)

	stationIDFilter := ""
	if roleStr != models.RoleSystemAdmin {
		stationID, _ := c.Get("stationID")
		stationIDFilter, _ = stationID.(string)
	}

	vehicles, err := h.repo.FindAll(stationIDFilter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch vehicles"})
		return
	}
	c.JSON(http.StatusOK, vehicles)
}

// GetVehicle returns a single vehicle by ID
func (h *VehicleHandler) GetVehicle(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid vehicle ID"})
		return
	}

	vehicle, err := h.repo.FindByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Vehicle not found"})
		return
	}
	if !ensureVehicleStationAccess(c, vehicle) {
		return
	}

	c.JSON(http.StatusOK, vehicle)
}

// GetVehicleLocation returns the current location of a vehicle
func (h *VehicleHandler) GetVehicleLocation(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid vehicle ID"})
		return
	}

	vehicle, err := h.repo.FindByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Vehicle not found"})
		return
	}
	if !ensureVehicleStationAccess(c, vehicle) {
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"vehicle_id": vehicle.ID,
		"latitude":   vehicle.Latitude,
		"longitude":  vehicle.Longitude,
		"status":     vehicle.Status,
		"updated_at": vehicle.UpdatedAt,
	})
}

// UpdateVehicleLocation updates the GPS position and records history
func (h *VehicleHandler) UpdateVehicleLocation(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid vehicle ID"})
		return
	}

	var req UpdateLocationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	vehicle, err := h.repo.FindByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Vehicle not found"})
		return
	}
	if !ensureVehicleStationAccess(c, vehicle) {
		return
	}

	// Update vehicle's current location
	vehicle.Latitude = req.Latitude
	vehicle.Longitude = req.Longitude

	if err := h.repo.Update(vehicle); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update location"})
		return
	}

	// Save to location history
	history := &models.LocationHistory{
		VehicleID:  vehicle.ID,
		Latitude:   req.Latitude,
		Longitude:  req.Longitude,
		RecordedAt: time.Now(),
	}
	h.repo.SaveLocationHistory(history)

	// Publish location update event
	if h.publisher != nil {
		incidentID := ""
		if vehicle.IncidentID != nil {
			incidentID = vehicle.IncidentID.String()
		}
		h.publisher.PublishVehicleLocationUpdated(
			vehicle.ID.String(), incidentID,
			req.Latitude, req.Longitude, vehicle.Status,
		)
	}

	c.JSON(http.StatusOK, gin.H{
		"vehicle_id": vehicle.ID,
		"latitude":   vehicle.Latitude,
		"longitude":  vehicle.Longitude,
		"status":     vehicle.Status,
	})
}

// UpdateVehicleStatus updates the status of a vehicle
func (h *VehicleHandler) UpdateVehicleStatus(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid vehicle ID"})
		return
	}

	var req UpdateStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	vehicle, err := h.repo.FindByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Vehicle not found"})
		return
	}
	if !ensureVehicleStationAccess(c, vehicle) {
		return
	}

	normalizedStatus, ok := normalizeVehicleStatus(req.Status)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid vehicle status"})
		return
	}

	vehicle.Status = normalizedStatus
	if err := h.repo.Update(vehicle); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update status"})
		return
	}

	if h.publisher != nil {
		h.publisher.PublishVehicleStatusChanged(vehicle.ID.String(), normalizedStatus)
	}

	c.JSON(http.StatusOK, vehicle)
}

// UpdateVehicle updates vehicle metadata (license plate, driver assignment, types)
func (h *VehicleHandler) UpdateVehicle(c *gin.Context) {
	roleValue, hasRole := c.Get("role")
	roleStr, _ := roleValue.(string)
	if hasRole && !isVehicleManagerRole(roleStr) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only admins can update vehicles"})
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid vehicle ID"})
		return
	}

	var req UpdateVehicleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	vehicle, err := h.repo.FindByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Vehicle not found"})
		return
	}
	if !ensureVehicleStationAccess(c, vehicle) {
		return
	}

	if hasRole && !isSystemAdmin(roleStr) {
		stationValue, _ := c.Get("stationID")
		stationIDStr, _ := stationValue.(string)
		if stationIDStr == "" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Station-scoped access requires station assignment"})
			return
		}

		claimStationID, err := uuid.Parse(stationIDStr)
		if err != nil {
			c.JSON(http.StatusForbidden, gin.H{"error": "Invalid station assignment"})
			return
		}

		if req.StationID != nil {
			if *req.StationID == "" {
				c.JSON(http.StatusForbidden, gin.H{"error": "Station cannot be cleared for station-scoped admins"})
				return
			}
			sid, err := uuid.Parse(*req.StationID)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid station_id"})
				return
			}
			if sid != claimStationID {
				c.JSON(http.StatusForbidden, gin.H{"error": "You can only assign vehicles to your station"})
				return
			}
		}

		if req.StationType != nil {
			allowedType := roleToStationType(roleStr)
			if allowedType != "" && *req.StationType != allowedType {
				c.JSON(http.StatusForbidden, gin.H{"error": "You can only manage vehicles for your department station type"})
				return
			}
		}
	}

	if req.StationID != nil {
		if *req.StationID == "" {
			vehicle.StationID = uuid.Nil
		} else {
			sid, err := uuid.Parse(*req.StationID)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid station_id"})
				return
			}
			vehicle.StationID = sid
		}
	}
	// Determine new values and validate uniqueness/mapping
	newVehicleType := vehicle.VehicleType
	if req.VehicleType != nil {
		newVehicleType = *req.VehicleType
	}
	newStationType := vehicle.StationType
	if req.StationType != nil {
		newStationType = *req.StationType
	}

	// Validate mapping between vehicle type and station type
	expected := vehicleTypeToStationType(newVehicleType)
	if expected == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Unknown vehicle_type"})
		return
	}
	if newStationType != expected {
		c.JSON(http.StatusBadRequest, gin.H{"error": "vehicle_type does not match station_type"})
		return
	}

	if req.LicensePlate != nil {
		// If changing license plate, ensure uniqueness
		if *req.LicensePlate != "" {
			if v, err := h.repo.FindByLicensePlate(*req.LicensePlate); err == nil {
				if v != nil && v.ID != vehicle.ID {
					c.JSON(http.StatusBadRequest, gin.H{"error": "License plate already registered"})
					return
				}
			} else if !errors.Is(err, gorm.ErrRecordNotFound) {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to validate license plate"})
				return
			}
		}
		vehicle.LicensePlate = *req.LicensePlate
	}

	if req.DriverID != nil {
		if *req.DriverID == "" {
			vehicle.DriverID = nil
		} else {
			did, err := uuid.Parse(*req.DriverID)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid driver_id"})
				return
			}
			// Ensure driver is not assigned to another vehicle
			if v, err := h.repo.FindByDriverID(did); err == nil {
				if v != nil && v.ID != vehicle.ID {
					c.JSON(http.StatusBadRequest, gin.H{"error": "Driver already assigned to a vehicle"})
					return
				}
			} else if !errors.Is(err, gorm.ErrRecordNotFound) {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to validate driver assignment"})
				return
			}
			vehicle.DriverID = &did
		}
	}

	if req.StationType != nil {
		vehicle.StationType = *req.StationType
	}
	if req.VehicleType != nil {
		vehicle.VehicleType = *req.VehicleType
	}
	if req.DriverName != nil {
		vehicle.DriverName = *req.DriverName
	}

	if err := h.repo.Update(vehicle); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update vehicle"})
		return
	}

	c.JSON(http.StatusOK, vehicle)
}

// DeleteVehicle removes a vehicle record
func (h *VehicleHandler) DeleteVehicle(c *gin.Context) {
	roleValue, hasRole := c.Get("role")
	roleStr, _ := roleValue.(string)
	if hasRole && !isVehicleManagerRole(roleStr) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only admins can delete vehicles"})
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid vehicle ID"})
		return
	}

	vehicle, err := h.repo.FindByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Vehicle not found"})
		return
	}
	if !ensureVehicleStationAccess(c, vehicle) {
		return
	}

	if err := h.repo.DeleteByID(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete vehicle"})
		return
	}

	c.Status(http.StatusNoContent)
}

// ListAvailableVehicles returns vehicles that are available (optionally filtered by station)
func (h *VehicleHandler) ListAvailableVehicles(c *gin.Context) {
	stationID := c.Query("station_id")
	roleValue, hasRole := c.Get("role")
	roleStr, _ := roleValue.(string)
	if hasRole && !isSystemAdmin(roleStr) {
		stationValue, _ := c.Get("stationID")
		stationIDStr, _ := stationValue.(string)
		if stationIDStr == "" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Station-scoped access requires station assignment"})
			return
		}
		stationID = stationIDStr
	}
	vehicles, err := h.repo.FindAvailable(stationID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch vehicles"})
		return
	}
	c.JSON(http.StatusOK, vehicles)
}

// GetNearestAvailableVehicle returns the single nearest available vehicle of a given type
func (h *VehicleHandler) GetNearestAvailableVehicle(c *gin.Context) {
	latStr := c.Query("lat")
	lngStr := c.Query("lng")
	vehicleType := c.Query("type")

	if latStr == "" || lngStr == "" || vehicleType == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "lat, lng, and type parameters are required"})
		return
	}

	var lat, lng float64
	if _, err := fmt.Sscanf(latStr, "%f", &lat); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid latitude"})
		return
	}
	if _, err := fmt.Sscanf(lngStr, "%f", &lng); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid longitude"})
		return
	}

	vehicle, err := h.repo.FindNearestAvailable(lat, lng, vehicleType)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "No available vehicle found"})
		return
	}

	c.JSON(http.StatusOK, vehicle)
}

// ListAllVehiclesInternal returns all vehicles without auth filtering.
// Used for internal service-to-service calls (e.g., analytics computing utilization).
func (h *VehicleHandler) ListAllVehiclesInternal(c *gin.Context) {
	vehicles, err := h.repo.FindAll("")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch vehicles"})
		return
	}
	c.JSON(http.StatusOK, vehicles)
}
