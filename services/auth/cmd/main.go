package main

import (
	"log"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"emergency-dispatch/services/auth/internal/config"
	"emergency-dispatch/services/auth/internal/handlers"
	"emergency-dispatch/services/auth/internal/models"
	"emergency-dispatch/services/auth/internal/repository"
	"emergency-dispatch/services/auth/internal/routes"
	"emergency-dispatch/services/auth/internal/seed"
)

func main() {
	// Load .env from project root
	godotenv.Load("../../.env")

	cfg := config.Load()

	// Connect to database
	db, err := gorm.Open(postgres.Open(cfg.DSN()), &gorm.Config{})
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	log.Println("Connected to auth_db")

	// Auto-migrate models
	if err := db.AutoMigrate(&models.User{}, &models.RefreshToken{}); err != nil {
		log.Fatalf("Failed to migrate database: %v", err)
	}
	log.Println("Database migrated")

	if err := seed.Run(db); err != nil {
		log.Fatalf("Failed to seed auth demo data: %v", err)
	}

	// Initialize layers
	repo := repository.NewUserRepository(db)
	handler := handlers.NewAuthHandler(repo, cfg.JWTSecret)

	// Setup Gin router
	router := gin.Default()

	// CORS middleware
	router.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	// Health check
	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok", "service": "auth"})
	})

	routes.Setup(router, handler, cfg.JWTSecret)

	log.Printf("Auth service starting on port %s", cfg.Port)
	if err := router.Run(":" + cfg.Port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
