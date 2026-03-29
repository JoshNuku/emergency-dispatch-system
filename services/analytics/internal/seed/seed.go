package seed

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"emergency-dispatch/services/analytics/internal/models"
	"emergency-dispatch/services/analytics/internal/repository"
)

func Run(db *gorm.DB) error {
	// ── Cleanup logic ──────────────────────────────────────────────────────────
	if os.Getenv("CLEAN_START") == "true" {
		log.Println("CLEAN_START=true: Truncating incident_metrics and hospital_capacity_logs...")

		if err := db.Exec("TRUNCATE TABLE incident_metrics").Error; err != nil {
			log.Printf("Error truncating incident_metrics: %v", err)
		}

		if err := db.Exec("TRUNCATE TABLE hospital_capacity_logs").Error; err != nil {
			log.Printf("Error truncating hospital_capacity_logs: %v", err)
		}
	}

	return nil
}

// BackfillIncidents fetches all incidents from the incident service and creates metrics for them.
// This ensures the analytics database has data for all existing incidents, even if events were missed.
func BackfillIncidents(incidentServiceURL string, repo *repository.AnalyticsRepository) error {
	if incidentServiceURL == "" {
		log.Println("WARN: Incident service URL not configured, backfill skipped")
		return nil
	}

	log.Println("Starting incident backfill from incident service...")

	// Fetch all incidents (internal endpoint without JWT requirement)
	resp, err := getRequest(incidentServiceURL + "/internal/incidents")
	if err != nil {
		log.Printf("WARN: Failed to fetch incidents for backfill: %v", err)
		return nil // Non-fatal: consumer will gradually populate data
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		log.Printf("WARN: Incident service returned %d: %s", resp.StatusCode, string(body))
		return nil
	}

	var incidents []map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&incidents); err != nil {
		log.Printf("WARN: Failed to decode incidents: %v", err)
		return nil
	}

	log.Printf("Backfill: Found %d incidents", len(incidents))

	for _, inc := range incidents {
		incID, _ := inc["id"].(string)
		if incID == "" {
			continue
		}

		uid, err := uuid.Parse(incID)
		if err != nil {
			continue
		}

		// Create metric from incident data
		metric := &models.IncidentMetric{
			IncidentID:   uid,
			IncidentType: toString(inc["incident_type"]),
			Latitude:     toFloat64(inc["latitude"]),
			Longitude:    toFloat64(inc["longitude"]),
		}

		// If dispatched, calculate response time
		if status, ok := inc["status"].(string); ok && (status == "dispatched" || status == "in_progress" || status == "resolved") {
			if createdAt, ok := inc["created_at"].(string); ok {
				if dispatchedAt, ok := inc["dispatched_at"].(string); ok && dispatchedAt != "" {
					responseTime := calculateTimeDiff(createdAt, dispatchedAt)
					if responseTime > 0 {
						metric.ResponseTimeSeconds = &responseTime
					}
				}
			}
		}

		// If resolved, calculate resolution time
		if status, ok := inc["status"].(string); ok && status == "resolved" {
			if createdAt, ok := inc["created_at"].(string); ok {
				if resolvedAt, ok := inc["resolved_at"].(string); ok && resolvedAt != "" {
					resolutionTime := calculateTimeDiff(createdAt, resolvedAt)
					if resolutionTime > 0 {
						metric.ResolutionTimeSeconds = &resolutionTime
					}
				}
			}
		}

		if err := repo.UpsertIncidentMetric(metric); err != nil {
			log.Printf("WARN: Failed to backfill incident %s: %v", incID, err)
		}
	}

	log.Println("Incident backfill completed")
	return nil
}

// ── Helper functions ───────────────────────────────────────────────────────

func getRequest(url string) (*http.Response, error) {
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	return http.DefaultClient.Do(req)
}

func toString(v interface{}) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

func toFloat64(v interface{}) float64 {
	if f, ok := v.(float64); ok {
		return f
	}
	return 0
}

func calculateTimeDiff(startStr, endStr string) int {
	if startStr == "" || endStr == "" {
		return 0
	}

	start, err1 := time.Parse(time.RFC3339Nano, startStr)
	end, err2 := time.Parse(time.RFC3339Nano, endStr)

	if err1 != nil {
		start, err1 = time.Parse(time.RFC3339, startStr)
	}
	if err2 != nil {
		end, err2 = time.Parse(time.RFC3339, endStr)
	}

	if err1 != nil || err2 != nil {
		return 0
	}

	diff := int(end.Sub(start).Seconds())
	if diff < 0 {
		return 0
	}
	if diff == 0 {
		return 1 // Minimum 1 second
	}
	return diff
}
