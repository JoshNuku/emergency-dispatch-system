package routes

import (
	"github.com/gin-gonic/gin"

	"emergency-dispatch/services/analytics/internal/handlers"
	"emergency-dispatch/services/analytics/internal/middleware"
)

func SetupRoutes(r *gin.Engine, h *handlers.AnalyticsHandler) {
	analytics := r.Group("/analytics")
	analytics.Use(middleware.JWTAuth())
	{
		analytics.GET("/response-times", h.GetResponseTimes)
		analytics.GET("/incidents-by-region", h.GetIncidentsByRegion)
		analytics.GET("/resource-utilization", h.GetResourceUtilization)
		analytics.GET("/hospital-capacity", h.GetHospitalCapacity)
		analytics.GET("/dashboard", h.GetDashboard)
	}
}
