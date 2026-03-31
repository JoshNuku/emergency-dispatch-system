package middleware

import (
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"
)

// IPRateLimiter stores per-IP rate limiters
type IPRateLimiter struct {
	mu       sync.RWMutex
	limiters map[string]*rate.Limiter
}

// NewIPRateLimiter creates a new IP rate limiter
func NewIPRateLimiter() *IPRateLimiter {
	return &IPRateLimiter{
		limiters: make(map[string]*rate.Limiter),
	}
}

// GetLimiter returns the rate limiter for the given IP, creating one if needed
func (rl *IPRateLimiter) GetLimiter(ip string) *rate.Limiter {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	if limiter, exists := rl.limiters[ip]; exists {
		return limiter
	}

	// 10 requests per second per IP, with burst of 20
	limiter := rate.NewLimiter(10, 20)
	rl.limiters[ip] = limiter
	return limiter
}

// RateLimit middleware enforces per-IP rate limiting
func (rl *IPRateLimiter) RateLimit() gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()

		// For X-Forwarded-For behind proxy
		if forwarded := c.GetHeader("X-Forwarded-For"); forwarded != "" {
			ips := net.ParseIP(forwarded)
			if ips != nil {
				ip = forwarded
			}
		}

		limiter := rl.GetLimiter(ip)
		if !limiter.Allow() {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error": "Rate limit exceeded. Max 10 requests/second per IP.",
			})
			c.Abort()
			return
		}

		c.Next()
	}
}

// CleanupRoutine periodically removes stale limiters (optional)
func (rl *IPRateLimiter) CleanupRoutine(interval time.Duration) {
	ticker := time.NewTicker(interval)
	go func() {
		for range ticker.C {
			rl.mu.Lock()
			// Reset limiters that haven't been used recently (simplified)
			if len(rl.limiters) > 1000 {
				rl.limiters = make(map[string]*rate.Limiter)
			}
			rl.mu.Unlock()
		}
	}()
}
