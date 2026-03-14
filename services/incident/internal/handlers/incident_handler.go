package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"emergency-dispatch/services/incident/internal/models"
	"emergency-dispatch/services/incident/internal/mq"
	"emergency-dispatch/services/incident/internal/repository"
	"emergency-dispatch/services/incident/internal/services"
)

type IncidentHandler struct {
	repo      *repository.IncidentRepository
	dispatch  *services.DispatchService
	publisher *mq.Publisher
}

func NewIncidentHandler(repo *repository.IncidentRepository, dispatch *services.DispatchService, publisher *mq.Publisher) *IncidentHandler {
	return &IncidentHandler{repo: repo, dispatch: dispatch, publisher: publisher}
}

type CreateIncidentRequest struct {
	CitizenName  string  `json:"citizen_name" binding:"required"`
	CitizenPhone string  `json:"citizen_phone"`
	IncidentType string  `json:"incident_type" binding:"required"`
	Latitude     float64 `json:"latitude" binding:"required"`
	Longitude    float64 `json:"longitude" binding:"required"`
	Notes        string  `json:"notes"`
}

type UpdateStatusRequest struct {
	Status string `json:"status" binding:"required"`
}

type AssignRequest struct {
	UnitID   string `json:"unit_id" binding:"required"`
	UnitType string `json:"unit_type" binding:"required"`
}

// CreateIncident creates a new incident and triggers auto-dispatch
func (h *IncidentHandler) CreateIncident(c *gin.Context) {
	var req CreateIncidentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if !models.IsValidIncidentType(req.IncidentType) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid incident type. Valid: crime, fire, medical"})
		return
	}

	adminID, _ := c.Get("userID")
	createdBy, err := uuid.Parse(adminID.(string))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid admin ID"})
		return
	}

	incident := &models.Incident{
		CitizenName:  req.CitizenName,
		CitizenPhone: req.CitizenPhone,
		IncidentType: req.IncidentType,
		Latitude:     req.Latitude,
		Longitude:    req.Longitude,
		Notes:        req.Notes,
		CreatedBy:    createdBy,
	}

	if err := h.repo.Create(incident); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create incident"})
		return
	}

	// Auto-dispatch: find nearest responder
	dispatchErr := h.dispatch.AutoDispatch(incident)

	response := gin.H{
		"incident": incident,
	}
	if dispatchErr != nil {
		response["dispatch_warning"] = dispatchErr.Error()
	}

	c.JSON(http.StatusCreated, response)
}

// GetIncident returns a single incident by ID
func (h *IncidentHandler) GetIncident(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid incident ID"})
		return
	}

	incident, err := h.repo.FindByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Incident not found"})
		return
	}

	c.JSON(http.StatusOK, incident)
}

// getStationTypeFromRole maps an operations admin role to the corresponding incident unit type
func getStationTypeFromRole(role string) string {
	switch role {
	case "police_admin":
		return "police"
	case "fire_admin":
		return "fire"
	case "hospital_admin":
		return "ambulance"
	case "ambulance_driver":
		return "ambulance"
	default:
		return ""
	}
}

// ListIncidents returns all incidents with optional filters
func (h *IncidentHandler) ListIncidents(c *gin.Context) {
	status := c.Query("status")
	incidentType := c.Query("type")

	// Apply station scoping for non-system admins
	role, _ := c.Get("role")
	roleStr, _ := role.(string)
	
	stationTypeFilter := ""
	if roleStr != models.RoleSystemAdmin {
		stationTypeFilter = getStationTypeFromRole(roleStr)
	}

	incidents, err := h.repo.FindAll(status, incidentType, stationTypeFilter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch incidents"})
		return
	}

	c.JSON(http.StatusOK, incidents)
}

// ListOpenIncidents returns all non-resolved incidents
func (h *IncidentHandler) ListOpenIncidents(c *gin.Context) {
	// Apply station scoping for non-system admins
	role, _ := c.Get("role")
	roleStr, _ := role.(string)
	
	stationTypeFilter := ""
	if roleStr != models.RoleSystemAdmin {
		stationTypeFilter = getStationTypeFromRole(roleStr)
	}

	incidents, err := h.repo.FindOpen(stationTypeFilter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch incidents"})
		return
	}

	c.JSON(http.StatusOK, incidents)
}

// UpdateStatus updates the status of an incident
func (h *IncidentHandler) UpdateStatus(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid incident ID"})
		return
	}

	var req UpdateStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if !models.IsValidStatus(req.Status) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid status. Valid: created, dispatched, in_progress, resolved"})
		return
	}

	incident, err := h.repo.FindByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Incident not found"})
		return
	}

	incident.Status = req.Status
	if req.Status == models.StatusResolved {
		now := time.Now()
		incident.ResolvedAt = &now
	}

	if err := h.repo.Update(incident); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update incident"})
		return
	}

	// Publish status change event
	if h.publisher != nil {
		h.publisher.PublishIncidentStatusChanged(incident, req.Status)
	}

	c.JSON(http.StatusOK, incident)
}

// AssignUnit manually assigns a responder to an incident
func (h *IncidentHandler) AssignUnit(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid incident ID"})
		return
	}

	var req AssignRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	unitID, err := uuid.Parse(req.UnitID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid unit ID"})
		return
	}

	incident, err := h.repo.FindByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Incident not found"})
		return
	}

	incident.AssignedUnitID = &unitID
	incident.AssignedUnitType = req.UnitType
	incident.Status = models.StatusDispatched
	now := time.Now()
	incident.DispatchedAt = &now

	if err := h.repo.Update(incident); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to assign unit"})
		return
	}

	c.JSON(http.StatusOK, incident)
}
