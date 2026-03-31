package routes

import (
	"time"

	"github.com/gin-gonic/gin"

	"emergency-dispatch/services/incident/internal/handlers"
	"emergency-dispatch/services/incident/internal/middleware"
)

func Setup(router *gin.Engine, incidentHandler *handlers.IncidentHandler, stationHandler *handlers.StationHandler, jwtSecret string) {
	auth := middleware.JWTAuth(jwtSecret)
	writeLimit := middleware.RateLimitByIP(15, time.Minute) // 15 write ops per minute per IP

	// Internal route for trusted service-to-service access.
	router.GET("/internal/incidents", incidentHandler.ListIncidentsInternal)

	// Incident routes
	incidents := router.Group("/incidents", auth)
	{
		incidents.POST("", writeLimit, incidentHandler.CreateIncident)
		incidents.GET("", incidentHandler.ListIncidents)
		incidents.GET("/open", incidentHandler.ListOpenIncidents)
		incidents.GET("/:id", incidentHandler.GetIncident)
		incidents.PUT("/:id/status", writeLimit, incidentHandler.UpdateStatus)
		incidents.PUT("/:id/assign", writeLimit, incidentHandler.AssignUnit)
	}

	// Station routes
	stations := router.Group("/stations", auth)
	{
		stations.POST("", writeLimit, stationHandler.CreateStation)
		stations.GET("", stationHandler.ListStations)
		stations.GET("/nearest", stationHandler.FindNearest)
		stations.GET("/:id", stationHandler.GetStation)
		stations.PUT("/:id", writeLimit, stationHandler.UpdateStation)
		stations.DELETE("/:id", writeLimit, stationHandler.DeleteStation)
	}
}
