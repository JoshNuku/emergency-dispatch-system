package routes

import (
	"github.com/gin-gonic/gin"

	"emergency-dispatch/services/auth/internal/handlers"
	"emergency-dispatch/services/auth/internal/middleware"
	"emergency-dispatch/services/auth/internal/models"
)

func Setup(router *gin.Engine, handler *handlers.AuthHandler, jwtSecret string) {
	auth := router.Group("/auth")
	{
		// Public routes
		auth.POST("/register", handler.Register)
		auth.POST("/login", handler.Login)
		auth.POST("/refresh-token", handler.RefreshToken)

		// Protected routes
		auth.GET("/profile", middleware.JWTAuth(jwtSecret), handler.Profile)
		auth.GET("/users", middleware.JWTAuth(jwtSecret), middleware.RequireRole(models.RoleSystemAdmin), handler.ListUsers)
	}
}
