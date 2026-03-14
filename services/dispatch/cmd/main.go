package main

import (
	"log"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"emergency-dispatch/services/dispatch/internal/config"
	"emergency-dispatch/services/dispatch/internal/handlers"
	"emergency-dispatch/services/dispatch/internal/models"
	"emergency-dispatch/services/dispatch/internal/mq"
	"emergency-dispatch/services/dispatch/internal/repository"
	"emergency-dispatch/services/dispatch/internal/routes"
	"emergency-dispatch/services/dispatch/internal/seed"
)

func main() {
	godotenv.Load("../../.env")

	cfg := config.Load()

	// Connect to database
	db, err := gorm.Open(postgres.Open(cfg.DSN()), &gorm.Config{})
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	log.Println("Connected to dispatch_db")

	// Enable PostGIS
	db.Exec("CREATE EXTENSION IF NOT EXISTS postgis")

	// Auto-migrate
	if err := db.AutoMigrate(&models.Vehicle{}, &models.LocationHistory{}); err != nil {
		log.Fatalf("Failed to migrate database: %v", err)
	}
	log.Println("Database migrated")

	if err := seed.Run(db); err != nil {
		log.Fatalf("Failed to seed dispatch demo data: %v", err)
	}

	// RabbitMQ publisher
	publisher, err := mq.NewPublisher(cfg.RabbitURL)
	if err != nil {
		log.Printf("WARN: Failed to connect to RabbitMQ: %v (events disabled)", err)
	}
	if publisher != nil {
		defer publisher.Close()
	}

	// Initialize layers
	repo := repository.NewVehicleRepository(db)
	vehicleHandler := handlers.NewVehicleHandler(repo, publisher)

	// Setup Gin router
	router := gin.Default()

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

	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok", "service": "dispatch"})
	})

	routes.Setup(router, vehicleHandler, cfg.JWTSecret)

	log.Printf("Dispatch tracking service starting on port %s", cfg.Port)
	if err := router.Run(":" + cfg.Port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
