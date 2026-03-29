package handlers

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"

	"emergency-dispatch/services/analytics/internal/repository"
)

type AnalyticsHandler struct {
	repo               *repository.AnalyticsRepository
	dispatchServiceURL string
}

func NewAnalyticsHandler(repo *repository.AnalyticsRepository, dispatchServiceURL string) *AnalyticsHandler {
	return &AnalyticsHandler{repo: repo, dispatchServiceURL: dispatchServiceURL}
}

func (h *AnalyticsHandler) GetResponseTimes(c *gin.Context) {
	results, err := h.repo.GetResponseTimes()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch response times"})
		return
	}
	c.JSON(http.StatusOK, results)
}

func (h *AnalyticsHandler) GetIncidentsByRegion(c *gin.Context) {
	results, err := h.repo.GetIncidentsByRegion()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch incidents by region"})
		return
	}
	c.JSON(http.StatusOK, results)
}

// vehicleJSON mirrors the dispatch service vehicle model for JSON decoding.
type vehicleJSON struct {
	ID          string `json:"id"`
	StationType string `json:"station_type"`
	VehicleType string `json:"vehicle_type"`
	Status      string `json:"status"`
}

// utilizationResponse matches the frontend ResourceUtilization type exactly.
type utilizationResponse struct {
	ServiceType        string  `json:"service_type"`
	TotalUnits         int     `json:"total_units"`
	ActiveUnits        int     `json:"active_units"`
	UtilizationPercent float64 `json:"utilization_percent"`
}

// GetResourceUtilization computes live utilization by fetching vehicle data
// from the dispatch service and grouping by station_type.
func (h *AnalyticsHandler) GetResourceUtilization(c *gin.Context) {
	vehicles, err := h.fetchVehiclesFromDispatch()
	if err != nil {
		log.Printf("Failed to fetch vehicles from dispatch service: %v", err)
		c.JSON(http.StatusOK, []utilizationResponse{}) // graceful empty
		return
	}

	// Group vehicles by station_type (hospital, police, fire)
	type counts struct {
		total  int
		active int
	}
	groups := map[string]*counts{}

	for _, v := range vehicles {
		stype := v.StationType
		if stype == "" {
			stype = "unknown"
		}
		if groups[stype] == nil {
			groups[stype] = &counts{}
		}
		groups[stype].total++
		// A vehicle is "active" (busy) if it is NOT available or off_duty
		if v.Status != "available" && v.Status != "off_duty" {
			groups[stype].active++
		}
	}

	results := make([]utilizationResponse, 0, len(groups))
	for stype, c := range groups {
		pct := float64(0)
		if c.total > 0 {
			pct = float64(c.active) / float64(c.total) * 100.0
		}
		results = append(results, utilizationResponse{
			ServiceType:        stype,
			TotalUnits:         c.total,
			ActiveUnits:        c.active,
			UtilizationPercent: pct,
		})
	}

	c.JSON(http.StatusOK, results)
}

// fetchVehiclesFromDispatch calls the dispatch service's internal endpoint.
func (h *AnalyticsHandler) fetchVehiclesFromDispatch() ([]vehicleJSON, error) {
	url := h.dispatchServiceURL + "/vehicles/all/internal"
	resp, err := http.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var vehicles []vehicleJSON
	if err := json.NewDecoder(resp.Body).Decode(&vehicles); err != nil {
		return nil, err
	}
	return vehicles, nil
}

func (h *AnalyticsHandler) GetHospitalCapacity(c *gin.Context) {
	results, err := h.repo.GetHospitalCapacity()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch hospital capacity"})
		return
	}
	c.JSON(http.StatusOK, results)
}

func (h *AnalyticsHandler) GetDashboard(c *gin.Context) {
	stats, err := h.repo.GetDashboardStats()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch dashboard stats"})
		return
	}
	c.JSON(http.StatusOK, stats)
}
