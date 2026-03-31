package main

import (
	"fmt"
	"log"
	"os"
	"strings"

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

const openAPISpecPath = "../../docs/openapi.yaml"

const swaggerUIHTML = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>Emergency Dispatch API Docs</title>
	<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
	<div id="swagger-ui"></div>
	<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
	<script>
		window.ui = SwaggerUIBundle({
			url: "/swagger/openapi.yaml",
			dom_id: '#swagger-ui',
			deepLinking: true,
			defaultModelsExpandDepth: 1
		});
	</script>
</body>
</html>`

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
	handler := handlers.NewAnalyticsHandler(repo, cfg.DispatchServiceURL)

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

	// Startup seeding/backfill is intentionally disabled.

	r := gin.Default()
	originEnv := strings.TrimSpace(os.Getenv("CORS_ALLOW_ORIGINS"))
	origins := []string{"http://localhost:3000"}
	if originEnv != "" {
		parts := strings.Split(originEnv, ",")
		parsed := make([]string, 0, len(parts))
		for _, p := range parts {
			t := strings.TrimSpace(p)
			if t != "" {
				parsed = append(parsed, t)
			}
		}
		if len(parsed) > 0 {
			origins = parsed
		}
	}

	corsCfg := cors.Config{
		AllowOrigins:     origins,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		AllowCredentials: true,
	}
	for _, o := range origins {
		if o == "*" {
			corsCfg.AllowAllOrigins = true
			corsCfg.AllowCredentials = false
			break
		}
	}
	r.Use(cors.New(corsCfg))

	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok", "service": "analytics"})
	})

	r.GET("/swagger/openapi.yaml", func(c *gin.Context) {
		if _, err := os.Stat(openAPISpecPath); err != nil {
			c.JSON(404, gin.H{"error": "openapi spec not found", "path": openAPISpecPath})
			return
		}
		c.File(openAPISpecPath)
	})

	r.GET("/swagger", func(c *gin.Context) {
		c.Data(200, "text/html; charset=utf-8", []byte(swaggerUIHTML))
	})

	routes.SetupRoutes(r, handler)

	addr := fmt.Sprintf(":%s", cfg.Port)
	log.Printf("Analytics service starting on %s", addr)
	if err := r.Run(addr); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
