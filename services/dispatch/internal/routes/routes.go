package routes

import (
	"github.com/gin-gonic/gin"

	"emergency-dispatch/services/dispatch/internal/handlers"
	"emergency-dispatch/services/dispatch/internal/middleware"
)

func Setup(router *gin.Engine, vehicleHandler *handlers.VehicleHandler, jwtSecret string) {
	auth := middleware.JWTAuth(jwtSecret)

	// Internal service-to-service routes (no auth required)
	router.GET("/vehicles/nearest", vehicleHandler.GetNearestAvailableVehicle)
	router.PUT("/vehicles/:id/status/internal", vehicleHandler.UpdateVehicleStatus)
	router.GET("/vehicles/all/internal", vehicleHandler.ListAllVehiclesInternal)

	vehicles := router.Group("/vehicles", auth)
	{
		vehicles.POST("/register", vehicleHandler.RegisterVehicle)
		vehicles.GET("", vehicleHandler.ListVehicles)
		vehicles.GET("/available", vehicleHandler.ListAvailableVehicles)
		vehicles.GET("/:id", vehicleHandler.GetVehicle)
		vehicles.GET("/:id/location", vehicleHandler.GetVehicleLocation)
		vehicles.POST("/:id/location", vehicleHandler.UpdateVehicleLocation)
		vehicles.PUT("/:id/status", vehicleHandler.UpdateVehicleStatus)
		vehicles.PUT("/:id", vehicleHandler.UpdateVehicle)
		vehicles.DELETE("/:id", vehicleHandler.DeleteVehicle)
	}
}
