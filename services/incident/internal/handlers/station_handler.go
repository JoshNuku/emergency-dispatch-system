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

func stationRoleToType(role string) string {
	switch role {
	case models.RoleHospitalAdmin, models.RoleAmbulanceDriver:
		return models.StationTypeHospital
	case models.RolePoliceAdmin, models.RolePoliceDriver:
		return models.StationTypePolice
	case models.RoleFireAdmin, models.RoleFireDriver:
		return models.StationTypeFire
	default:
		return ""
	}
}

func isStationSystemAdmin(role string) bool {
	return role == models.RoleSystemAdmin
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
	roleValue, _ := c.Get("role")
	role, _ := roleValue.(string)
	if !isStationSystemAdmin(role) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only system admins can create stations"})
		return
	}

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
	roleValue, _ := c.Get("role")
	role, _ := roleValue.(string)
	stationIDValue, _ := c.Get("stationID")
	claimStationID, _ := stationIDValue.(string)

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid station ID"})
		return
	}

	if !isStationSystemAdmin(role) {
		if claimStationID == "" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Station-scoped access requires station assignment"})
			return
		}
		claimID, err := uuid.Parse(claimStationID)
		if err != nil {
			c.JSON(http.StatusForbidden, gin.H{"error": "Invalid station assignment"})
			return
		}
		if claimID != id {
			c.JSON(http.StatusForbidden, gin.H{"error": "Access denied for station outside your assignment"})
			return
		}
	}

	station, err := h.repo.FindByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Station not found"})
		return
	}

	c.JSON(http.StatusOK, station)
}

func (h *StationHandler) ListStations(c *gin.Context) {
	roleValue, _ := c.Get("role")
	role, _ := roleValue.(string)
	stationIDValue, _ := c.Get("stationID")
	claimStationID, _ := stationIDValue.(string)

	stationType := c.Query("type")
	if !isStationSystemAdmin(role) {
		if claimStationID == "" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Station-scoped access requires station assignment"})
			return
		}

		id, err := uuid.Parse(claimStationID)
		if err != nil {
			c.JSON(http.StatusForbidden, gin.H{"error": "Invalid station assignment"})
			return
		}

		station, err := h.repo.FindByID(id)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Station not found"})
			return
		}

		if stationType != "" && station.Type != stationType {
			c.JSON(http.StatusOK, []models.ResponderStation{})
			return
		}

		expectedType := stationRoleToType(role)
		if expectedType != "" && station.Type != expectedType {
			c.JSON(http.StatusForbidden, gin.H{"error": "Role is not permitted to access this station type"})
			return
		}

		c.JSON(http.StatusOK, []models.ResponderStation{*station})
		return
	}

	stations, err := h.repo.FindAll(stationType)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch stations"})
		return
	}
	c.JSON(http.StatusOK, stations)
}

func (h *StationHandler) UpdateStation(c *gin.Context) {
	roleValue, _ := c.Get("role")
	role, _ := roleValue.(string)
	stationIDValue, _ := c.Get("stationID")
	claimStationID, _ := stationIDValue.(string)

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid station ID"})
		return
	}

	if !isStationSystemAdmin(role) {
		if claimStationID == "" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Station-scoped access requires station assignment"})
			return
		}
		claimID, err := uuid.Parse(claimStationID)
		if err != nil {
			c.JSON(http.StatusForbidden, gin.H{"error": "Invalid station assignment"})
			return
		}
		if claimID != id {
			c.JSON(http.StatusForbidden, gin.H{"error": "You can only update your assigned station"})
			return
		}
	}

	station, err := h.repo.FindByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Station not found"})
		return
	}

	if !isStationSystemAdmin(role) {
		expectedType := stationRoleToType(role)
		if expectedType != "" && station.Type != expectedType {
			c.JSON(http.StatusForbidden, gin.H{"error": "Role is not permitted to update this station type"})
			return
		}
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

// DeleteStation removes a station record
func (h *StationHandler) DeleteStation(c *gin.Context) {
	roleValue, _ := c.Get("role")
	role, _ := roleValue.(string)
	if !isStationSystemAdmin(role) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only system admins can delete stations"})
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid station ID"})
		return
	}

	if err := h.repo.DeleteByID(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete station"})
		return
	}

	c.Status(http.StatusNoContent)
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
