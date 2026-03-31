package middleware

import (
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type ipWindowCounter struct {
	windowStart time.Time
	count       int
	lastSeen    time.Time
}

type ipRateLimiter struct {
	mu             sync.Mutex
	clients        map[string]*ipWindowCounter
	limit          int
	window         time.Duration
	cleanupEvery   int
	requestCounter int
}

func newIPRateLimiter(limit int, window time.Duration) *ipRateLimiter {
	return &ipRateLimiter{
		clients:      make(map[string]*ipWindowCounter),
		limit:        limit,
		window:       window,
		cleanupEvery: 100,
	}
}

func (l *ipRateLimiter) allow(ip string, now time.Time) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()

	l.requestCounter++
	if l.requestCounter%l.cleanupEvery == 0 {
		l.cleanup(now)
	}

	entry, ok := l.clients[ip]
	if !ok {
		l.clients[ip] = &ipWindowCounter{
			windowStart: now,
			count:       1,
			lastSeen:    now,
		}
		return true, 0
	}

	if now.Sub(entry.windowStart) >= l.window {
		entry.windowStart = now
		entry.count = 1
		entry.lastSeen = now
		return true, 0
	}

	entry.lastSeen = now
	if entry.count >= l.limit {
		retryAfter := l.window - now.Sub(entry.windowStart)
		if retryAfter < 0 {
			retryAfter = 0
		}
		return false, retryAfter
	}

	entry.count++
	return true, 0
}

func (l *ipRateLimiter) cleanup(now time.Time) {
	maxIdle := 2 * l.window
	for ip, entry := range l.clients {
		if now.Sub(entry.lastSeen) > maxIdle {
			delete(l.clients, ip)
		}
	}
}

// RateLimitByIP applies a fixed-window in-memory rate limit per client IP.
// Example: RateLimitByIP(5, time.Minute) allows 5 requests per IP per minute.
func RateLimitByIP(limit int, window time.Duration) gin.HandlerFunc {
	if limit <= 0 {
		limit = 1
	}
	if window <= 0 {
		window = time.Minute
	}

	limiter := newIPRateLimiter(limit, window)

	return func(c *gin.Context) {
		ip := c.ClientIP()
		allowed, retryAfter := limiter.allow(ip, time.Now())
		if !allowed {
			seconds := int(retryAfter.Seconds())
			if seconds < 1 {
				seconds = 1
			}
			c.Header("Retry-After", strconv.Itoa(seconds))
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "Too many requests. Please try again later."})
			c.Abort()
			return
		}

		c.Next()
	}
}
