package main

import (
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"

	"emergency-dispatch/services/realtime-gateway/internal/config"
	"emergency-dispatch/services/realtime-gateway/internal/consumer"
	"emergency-dispatch/services/realtime-gateway/internal/handlers"
	"emergency-dispatch/services/realtime-gateway/internal/hub"
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
		c.JSON(200, gin.H{"status": "ok", "service": "realtime-gateway"})
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

	r.GET("/ws", handlers.HandleWebSocket(h))

	addr := fmt.Sprintf(":%s", cfg.Port)
	log.Printf("Real-time gateway starting on %s", addr)
	if err := r.Run(addr); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
