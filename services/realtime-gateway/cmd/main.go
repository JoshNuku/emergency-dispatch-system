package main

import (
	"fmt"
	"log"
	"os"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"

	"emergency-dispatch/services/realtime-gateway/internal/config"
	"emergency-dispatch/services/realtime-gateway/internal/consumer"
	"emergency-dispatch/services/realtime-gateway/internal/handlers"
	"emergency-dispatch/services/realtime-gateway/internal/hub"
)

func main() {
	if err := godotenv.Load("../../.env"); err != nil {
		log.Println("No .env file found, using environment variables")
	}

	cfg := config.Load()

	h := hub.NewHub()
	go h.Run()

	// Start RabbitMQ consumer
	rabbitURL := os.Getenv("RABBITMQ_URL")
	if rabbitURL != "" {
		cons, err := consumer.NewConsumer(rabbitURL, h)
		if err != nil {
			log.Printf("Warning: Failed to connect to RabbitMQ: %v", err)
		} else {
			go func() {
				if err := cons.StartConsuming(); err != nil {
					log.Printf("RabbitMQ consumer error: %v", err)
				}
			}()
			log.Println("RabbitMQ consumer started for real-time broadcast")
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
		c.JSON(200, gin.H{"status": "ok", "service": "realtime-gateway"})
	})

	r.GET("/ws", handlers.HandleWebSocket(h))

	addr := fmt.Sprintf(":%s", cfg.Port)
	log.Printf("Real-time gateway starting on %s", addr)
	if err := r.Run(addr); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
