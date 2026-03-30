package main

import (
	"log"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"emergency-dispatch/services/incident/internal/config"
	"emergency-dispatch/services/incident/internal/handlers"
	"emergency-dispatch/services/incident/internal/models"
	"emergency-dispatch/services/incident/internal/mq"
	"emergency-dispatch/services/incident/internal/repository"
	"emergency-dispatch/services/incident/internal/routes"
	"emergency-dispatch/services/incident/internal/services"
)

func main() {
	godotenv.Load("../../.env")

	cfg := config.Load()

	// Connect to database
	db, err := gorm.Open(postgres.Open(cfg.DSN()), &gorm.Config{})
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	log.Println("Connected to incident_db")

	// Enable PostGIS (safe to call even if already enabled)
	db.Exec("CREATE EXTENSION IF NOT EXISTS postgis")

	// Auto-migrate
	if err := db.AutoMigrate(&models.Incident{}, &models.ResponderStation{}); err != nil {
		log.Fatalf("Failed to migrate database: %v", err)
	}
	log.Println("Database migrated")

	// RabbitMQ publisher
	publisher, err := mq.NewPublisher(cfg.RabbitURL)
	if err != nil {
		log.Printf("WARN: Failed to connect to RabbitMQ: %v (events disabled)", err)
	}
	if publisher != nil {
		defer publisher.Close()
	}

	// Initialize layers
	incidentRepo := repository.NewIncidentRepository(db)
	stationRepo := repository.NewStationRepository(db)
	dispatchSvc := services.NewDispatchService(stationRepo, incidentRepo, publisher, cfg.DispatchServiceURL)
	consumer, err := mq.NewConsumer(cfg.RabbitURL, incidentRepo, publisher)
	if err != nil {
		log.Printf("WARN: Failed to start incident consumer: %v (vehicle-driven transitions disabled)", err)
	} else if consumer != nil {
		defer consumer.Close()
		if err := consumer.Start(); err != nil {
			log.Printf("WARN: Incident consumer failed to consume: %v", err)
		}
	}
	incidentHandler := handlers.NewIncidentHandler(incidentRepo, dispatchSvc, publisher)
	stationHandler := handlers.NewStationHandler(stationRepo)

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
		c.JSON(200, gin.H{"status": "ok", "service": "incident"})
	})

	routes.Setup(router, incidentHandler, stationHandler, cfg.JWTSecret)

	log.Printf("Incident service starting on port %s", cfg.Port)
	if err := router.Run(":" + cfg.Port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
