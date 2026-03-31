package routes

import (
	"time"

	"github.com/gin-gonic/gin"

	"emergency-dispatch/services/analytics/internal/handlers"
	"emergency-dispatch/services/analytics/internal/middleware"
)

func SetupRoutes(r *gin.Engine, h *handlers.AnalyticsHandler) {
	readLimit := middleware.RateLimitByIP(50, time.Minute) // 50 read ops per minute per IP

	analytics := r.Group("/analytics")
	analytics.Use(middleware.JWTAuth())
	analytics.Use(readLimit)
	{
		analytics.GET("/response-times", h.GetResponseTimes)
		analytics.GET("/incidents-by-region", h.GetIncidentsByRegion)
		analytics.GET("/resource-utilization", h.GetResourceUtilization)
		analytics.GET("/hospital-capacity", h.GetHospitalCapacity)
		analytics.GET("/dashboard", h.GetDashboard)
	}
}
