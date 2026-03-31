package routes

import (
	"time"

	"github.com/gin-gonic/gin"

	"emergency-dispatch/services/auth/internal/handlers"
	"emergency-dispatch/services/auth/internal/middleware"
	"emergency-dispatch/services/auth/internal/models"
)

func Setup(router *gin.Engine, handler *handlers.AuthHandler, jwtSecret string) {
	auth := router.Group("/auth")
	{
		// Public routes
		auth.POST("/register", middleware.RateLimitByIP(10, time.Minute), handler.Register)
		auth.POST("/login", middleware.RateLimitByIP(5, time.Minute), handler.Login)
		auth.POST("/refresh-token", middleware.RateLimitByIP(20, time.Minute), handler.RefreshToken)

		// Protected routes
		auth.GET("/profile", middleware.JWTAuth(jwtSecret), handler.Profile)
		auth.PUT("/profile", middleware.JWTAuth(jwtSecret), handler.UpdateProfile)
		auth.GET("/users", middleware.JWTAuth(jwtSecret), middleware.RequireRole(models.RoleSystemAdmin, models.RoleHospitalAdmin, models.RolePoliceAdmin, models.RoleFireAdmin), handler.ListUsers)
		auth.PUT("/users/:id", middleware.JWTAuth(jwtSecret), middleware.RequireRole(models.RoleSystemAdmin), handler.UpdateUser)
		auth.DELETE("/users/:id", middleware.JWTAuth(jwtSecret), middleware.RequireRole(models.RoleSystemAdmin), handler.DeleteUser)
	}
}
