package routes

import (
	"github.com/gin-gonic/gin"

	"emergency-dispatch/services/incident/internal/handlers"
	"emergency-dispatch/services/incident/internal/middleware"
)

func Setup(router *gin.Engine, incidentHandler *handlers.IncidentHandler, stationHandler *handlers.StationHandler, jwtSecret string) {
	auth := middleware.JWTAuth(jwtSecret)

	// Internal route for trusted service-to-service access.
	router.GET("/internal/incidents", incidentHandler.ListIncidentsInternal)

	// Incident routes
	incidents := router.Group("/incidents", auth)
	{
		incidents.POST("", incidentHandler.CreateIncident)
		incidents.GET("", incidentHandler.ListIncidents)
		incidents.GET("/open", incidentHandler.ListOpenIncidents)
		incidents.GET("/:id", incidentHandler.GetIncident)
		incidents.PUT("/:id/status", incidentHandler.UpdateStatus)
		incidents.PUT("/:id/assign", incidentHandler.AssignUnit)
	}

	// Station routes
	stations := router.Group("/stations", auth)
	{
		stations.POST("", stationHandler.CreateStation)
		stations.GET("", stationHandler.ListStations)
		stations.GET("/nearest", stationHandler.FindNearest)
		stations.GET("/:id", stationHandler.GetStation)
		stations.PUT("/:id", stationHandler.UpdateStation)
		stations.DELETE("/:id", stationHandler.DeleteStation)
	}
}
