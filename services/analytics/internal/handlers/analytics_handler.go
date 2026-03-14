package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"emergency-dispatch/services/analytics/internal/repository"
)

type AnalyticsHandler struct {
	repo *repository.AnalyticsRepository
}

func NewAnalyticsHandler(repo *repository.AnalyticsRepository) *AnalyticsHandler {
	return &AnalyticsHandler{repo: repo}
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

func (h *AnalyticsHandler) GetResourceUtilization(c *gin.Context) {
	results, err := h.repo.GetResourceUtilization()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch resource utilization"})
		return
	}
	c.JSON(http.StatusOK, results)
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
