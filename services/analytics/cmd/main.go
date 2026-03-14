package main

import (
	"fmt"
	"log"
	"os"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"emergency-dispatch/services/analytics/internal/config"
	"emergency-dispatch/services/analytics/internal/handlers"
	"emergency-dispatch/services/analytics/internal/models"
	"emergency-dispatch/services/analytics/internal/mq"
	"emergency-dispatch/services/analytics/internal/repository"
	"emergency-dispatch/services/analytics/internal/routes"
)

func main() {
	if err := godotenv.Load("../../.env"); err != nil {
		log.Println("No .env file found, using environment variables")
	}

	cfg := config.Load()

	db, err := gorm.Open(postgres.Open(cfg.DSN()), &gorm.Config{})
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	db.AutoMigrate(&models.IncidentMetric{}, &models.HospitalCapacityLog{})

	repo := repository.NewAnalyticsRepository(db)
	handler := handlers.NewAnalyticsHandler(repo)

	// Start RabbitMQ consumer in background
	rabbitURL := os.Getenv("RABBITMQ_URL")
	if rabbitURL != "" {
		consumer, err := mq.NewConsumer(rabbitURL, repo)
		if err != nil {
			log.Printf("Warning: Failed to connect to RabbitMQ: %v", err)
		} else {
			go func() {
				if err := consumer.Start(); err != nil {
					log.Printf("RabbitMQ consumer error: %v", err)
				}
			}()
			log.Println("RabbitMQ consumer started")
		}
	}

	r := gin.Default()
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:3000"},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		AllowCredentials: true,
	}))

	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok", "service": "analytics"})
	})

	routes.SetupRoutes(r, handler)

	addr := fmt.Sprintf(":%s", cfg.Port)
	log.Printf("Analytics service starting on %s", addr)
	if err := r.Run(addr); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
