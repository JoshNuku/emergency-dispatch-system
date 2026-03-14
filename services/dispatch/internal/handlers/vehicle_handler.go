package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

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

// RegisterVehicle creates a new vehicle record
func (h *VehicleHandler) RegisterVehicle(c *gin.Context) {
	var req RegisterVehicleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	stationID, err := uuid.Parse(req.StationID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid station_id"})
		return
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

	if req.DriverID != "" {
		driverID, err := uuid.Parse(req.DriverID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid driver_id"})
			return
		}
		vehicle.DriverID = &driverID
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

	vehicle.Status = req.Status
	if err := h.repo.Update(vehicle); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update status"})
		return
	}

	if h.publisher != nil {
		h.publisher.PublishVehicleStatusChanged(vehicle.ID.String(), req.Status)
	}

	c.JSON(http.StatusOK, vehicle)
}

// ListAvailableVehicles returns vehicles that are available (optionally filtered by station)
func (h *VehicleHandler) ListAvailableVehicles(c *gin.Context) {
	stationID := c.Query("station_id")
	vehicles, err := h.repo.FindAvailable(stationID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch vehicles"})
		return
	}
	c.JSON(http.StatusOK, vehicles)
}
