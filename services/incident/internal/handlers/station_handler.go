package handlers

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"emergency-dispatch/services/incident/internal/models"
	"emergency-dispatch/services/incident/internal/repository"
)

type StationHandler struct {
	repo *repository.StationRepository
}

func NewStationHandler(repo *repository.StationRepository) *StationHandler {
	return &StationHandler{repo: repo}
}

type CreateStationRequest struct {
	Name              string  `json:"name" binding:"required"`
	Type              string  `json:"type" binding:"required"`
	Latitude          float64 `json:"latitude" binding:"required"`
	Longitude         float64 `json:"longitude" binding:"required"`
	TotalCapacity     int     `json:"total_capacity"`
	AvailableCapacity int     `json:"available_capacity"`
	ContactPhone      string  `json:"contact_phone"`
}

type UpdateStationRequest struct {
	Name              *string `json:"name"`
	IsAvailable       *bool   `json:"is_available"`
	TotalCapacity     *int    `json:"total_capacity"`
	AvailableCapacity *int    `json:"available_capacity"`
	ContactPhone      *string `json:"contact_phone"`
}

func (h *StationHandler) CreateStation(c *gin.Context) {
	var req CreateStationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if !models.IsValidStationType(req.Type) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid station type. Valid: police, fire, hospital"})
		return
	}

	station := &models.ResponderStation{
		Name:              req.Name,
		Type:              req.Type,
		Latitude:          req.Latitude,
		Longitude:         req.Longitude,
		IsAvailable:       true,
		TotalCapacity:     req.TotalCapacity,
		AvailableCapacity: req.AvailableCapacity,
		ContactPhone:      req.ContactPhone,
	}

	if err := h.repo.Create(station); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create station"})
		return
	}

	c.JSON(http.StatusCreated, station)
}

func (h *StationHandler) GetStation(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid station ID"})
		return
	}

	station, err := h.repo.FindByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Station not found"})
		return
	}

	c.JSON(http.StatusOK, station)
}

func (h *StationHandler) ListStations(c *gin.Context) {
	stationType := c.Query("type")
	stations, err := h.repo.FindAll(stationType)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch stations"})
		return
	}
	c.JSON(http.StatusOK, stations)
}

func (h *StationHandler) UpdateStation(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid station ID"})
		return
	}

	station, err := h.repo.FindByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Station not found"})
		return
	}

	var req UpdateStationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Name != nil {
		station.Name = *req.Name
	}
	if req.IsAvailable != nil {
		station.IsAvailable = *req.IsAvailable
	}
	if req.TotalCapacity != nil {
		station.TotalCapacity = *req.TotalCapacity
	}
	if req.AvailableCapacity != nil {
		station.AvailableCapacity = *req.AvailableCapacity
	}
	if req.ContactPhone != nil {
		station.ContactPhone = *req.ContactPhone
	}

	if err := h.repo.Update(station); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update station"})
		return
	}

	c.JSON(http.StatusOK, station)
}

func (h *StationHandler) FindNearest(c *gin.Context) {
	latStr := c.Query("lat")
	lngStr := c.Query("lng")
	stationType := c.Query("type")

	if latStr == "" || lngStr == "" || stationType == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "lat, lng, and type query params required"})
		return
	}

	lat, err := parseFloat(latStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid latitude"})
		return
	}
	lng, err := parseFloat(lngStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid longitude"})
		return
	}

	station, err := h.repo.FindNearestAvailable(lat, lng, stationType)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "No available station found"})
		return
	}

	c.JSON(http.StatusOK, station)
}

func parseFloat(s string) (float64, error) {
	var f float64
	_, err := fmt.Sscanf(s, "%f", &f)
	return f, err
}
