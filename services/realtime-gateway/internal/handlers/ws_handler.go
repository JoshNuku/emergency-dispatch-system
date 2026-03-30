package handlers

import (
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"

	"emergency-dispatch/services/realtime-gateway/internal/hub"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true
		}

		allowed := []string{"http://localhost:3000"}
		originEnv := strings.TrimSpace(os.Getenv("CORS_ALLOW_ORIGINS"))
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
				allowed = parsed
			}
		}

		for _, a := range allowed {
			if a == "*" || strings.EqualFold(a, origin) {
				return true
			}
		}

		// Helpful for local dev when running on alternate localhost ports.
		return strings.HasPrefix(origin, "http://localhost:") || strings.HasPrefix(origin, "http://127.0.0.1:")
	},
}

func HandleWebSocket(h *hub.Hub) gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenString := c.Query("token")
		if tokenString == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Token required"})
			return
		}

		secret := os.Getenv("JWT_SECRET")
		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return []byte(secret), nil
		})
		if err != nil || !token.Valid {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token claims"})
			return
		}

		conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			log.Printf("WebSocket upgrade error: %v", err)
			return
		}

		userID, _ := claims["sub"].(string)
		role, _ := claims["role"].(string)

		client := &hub.Client{
			Hub:    h,
			Conn:   conn,
			Send:   make(chan []byte, 256),
			UserID: userID,
			Role:   role,
		}

		h.Register <- client

		go client.WritePump()
		go client.ReadPump()
	}
}
