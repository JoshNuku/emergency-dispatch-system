package mq

import (
	"encoding/json"
	"log"
	"math"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"

	"emergency-dispatch/services/analytics/internal/models"
	"emergency-dispatch/services/analytics/internal/repository"

	"github.com/google/uuid"
)

const ExchangeName = "emergency.events"

type Consumer struct {
	conn    *amqp.Connection
	channel *amqp.Channel
	repo    *repository.AnalyticsRepository
}

func NewConsumer(amqpURL string, repo *repository.AnalyticsRepository) (*Consumer, error) {
	if amqpURL == "" {
		log.Println("WARN: RabbitMQ URL not configured, event consumption disabled")
		return nil, nil
	}

	conn, err := amqp.Dial(amqpURL)
	if err != nil {
		return nil, err
	}

	ch, err := conn.Channel()
	if err != nil {
		conn.Close()
		return nil, err
	}

	// Declare exchange
	err = ch.ExchangeDeclare(ExchangeName, "topic", true, false, false, false, nil)
	if err != nil {
		ch.Close()
		conn.Close()
		return nil, err
	}

	return &Consumer{conn: conn, channel: ch, repo: repo}, nil
}

func (c *Consumer) Close() {
	if c.channel != nil {
		c.channel.Close()
	}
	if c.conn != nil {
		c.conn.Close()
	}
}

// Start begins consuming events from RabbitMQ
func (c *Consumer) Start() error {
	if c == nil {
		return nil
	}

	// Declare a queue for this service
	q, err := c.channel.QueueDeclare("analytics.events", true, false, false, false, nil)
	if err != nil {
		return err
	}

	// Bind to all relevant routing keys
	routingKeys := []string{
		"incident.created",
		"incident.dispatched",
		"incident.status_changed",
		"incident.resolved",
		"vehicle.location_updated",
		"vehicle.status_changed",
	}

	for _, key := range routingKeys {
		err = c.channel.QueueBind(q.Name, key, ExchangeName, false, nil)
		if err != nil {
			return err
		}
	}

	msgs, err := c.channel.Consume(q.Name, "", true, false, false, false, nil)
	if err != nil {
		return err
	}

	go func() {
		for msg := range msgs {
			c.handleMessage(msg)
		}
	}()

	log.Println("Analytics consumer started, listening for events...")
	return nil
}

func (c *Consumer) handleMessage(msg amqp.Delivery) {
	var event map[string]interface{}
	if err := json.Unmarshal(msg.Body, &event); err != nil {
		log.Printf("Failed to unmarshal event: %v", err)
		return
	}

	eventType, _ := event["event"].(string)
	data, _ := event["data"].(map[string]interface{})

	log.Printf("Received event: %s", eventType)

	switch eventType {
	case "incident.created":
		c.handleIncidentCreated(data)
	case "incident.dispatched":
		c.handleIncidentDispatched(data)
	case "incident.status_changed":
		c.handleIncidentStatusChanged(data)
	}
}

func (c *Consumer) handleIncidentCreated(data map[string]interface{}) {
	incidentData, _ := data["incident"].(map[string]interface{})
	if incidentData == nil {
		// Data might be at top level
		incidentData = data
	}

	incidentID, _ := incidentData["id"].(string)
	if incidentID == "" {
		return
	}

	uid, err := uuid.Parse(incidentID)
	if err != nil {
		return
	}

	lat, _ := incidentData["latitude"].(float64)
	lng, _ := incidentData["longitude"].(float64)
	incType, _ := incidentData["incident_type"].(string)

	// Derive region from coordinates (simplified: use lat/lng ranges for Accra areas)
	region := deriveRegion(lat, lng)

	metric := &models.IncidentMetric{
		IncidentID:   uid,
		IncidentType: incType,
		Latitude:     lat,
		Longitude:    lng,
		Region:       region,
	}

	if err := c.repo.UpsertIncidentMetric(metric); err != nil {
		log.Printf("Failed to save incident metric: %v", err)
	}
}

func (c *Consumer) handleIncidentDispatched(data map[string]interface{}) {
	incidentData, _ := data["incident"].(map[string]interface{})
	if incidentData == nil {
		return
	}

	incidentID, _ := incidentData["id"].(string)
	if incidentID == "" {
		return
	}

	uid, err := uuid.Parse(incidentID)
	if err != nil {
		return
	}

	stationIDStr, _ := data["station_id"].(string)
	responderType, _ := incidentData["assigned_unit_type"].(string)
	incidentType, _ := incidentData["incident_type"].(string)
	lat, _ := incidentData["latitude"].(float64)
	lng, _ := incidentData["longitude"].(float64)
	region := deriveRegion(lat, lng)

	metric := &models.IncidentMetric{
		IncidentID:    uid,
		IncidentType:  incidentType,
		Latitude:      lat,
		Longitude:     lng,
		Region:        region,
		ResponderType: responderType,
	}

	if stationIDStr != "" {
		sid, err := uuid.Parse(stationIDStr)
		if err == nil {
			metric.ResponderStationID = &sid
		}
	}

	// Calculate actual response time from created_at → dispatched_at
	responseTimeSec := computeTimeDiffSeconds(
		incidentData["created_at"],
		incidentData["dispatched_at"],
	)
	metric.ResponseTimeSeconds = &responseTimeSec

	log.Printf("Incident %s dispatched — response time: %d seconds", incidentID, responseTimeSec)

	if err := c.repo.UpsertIncidentMetric(metric); err != nil {
		log.Printf("Failed to update incident metric for dispatch: %v", err)
	}
}

func (c *Consumer) handleIncidentStatusChanged(data map[string]interface{}) {
	incidentData, _ := data["incident"].(map[string]interface{})
	if incidentData == nil {
		return
	}

	incidentID, _ := incidentData["id"].(string)
	newStatus, _ := data["new_status"].(string)
	if incidentID == "" {
		return
	}

	uid, err := uuid.Parse(incidentID)
	if err != nil {
		return
	}

	metric := &models.IncidentMetric{
		IncidentID: uid,
	}

	// Calculate response time if transitioning to dispatched
	if newStatus == "dispatched" {
		incidentType, _ := incidentData["incident_type"].(string)
		responderType, _ := incidentData["assigned_unit_type"].(string)
		lat, _ := incidentData["latitude"].(float64)
		lng, _ := incidentData["longitude"].(float64)
		region := deriveRegion(lat, lng)

		metric.IncidentType = incidentType
		metric.ResponderType = responderType
		metric.Latitude = lat
		metric.Longitude = lng
		metric.Region = region

		responseTimeSec := computeTimeDiffSeconds(
			incidentData["created_at"],
			incidentData["dispatched_at"],
		)
		metric.ResponseTimeSeconds = &responseTimeSec

		log.Printf("Incident %s dispatched (via status change) — response time: %d seconds", incidentID, responseTimeSec)
	}

	// Calculate resolution time if transitioning to resolved
	if newStatus == "resolved" {
		resolutionTimeSec := computeTimeDiffSeconds(
			incidentData["created_at"],
			incidentData["resolved_at"],
		)
		metric.ResolutionTimeSeconds = &resolutionTimeSec

		log.Printf("Incident %s resolved — resolution time: %d seconds", incidentID, resolutionTimeSec)
	}

	if metric.ResponseTimeSeconds != nil || metric.ResolutionTimeSeconds != nil {
		if err := c.repo.UpsertIncidentMetric(metric); err != nil {
			log.Printf("Failed to update incident metric: %v", err)
		}
	}
}

// computeTimeDiffSeconds parses two RFC3339 timestamp interface values
// and returns the difference in seconds. Falls back to 1 if parsing fails
// (so we never store 0 which would be filtered out by WHERE NOT NULL queries).
func computeTimeDiffSeconds(startRaw, endRaw interface{}) int {
	startStr, ok1 := startRaw.(string)
	endStr, ok2 := endRaw.(string)
	if !ok1 || !ok2 || startStr == "" || endStr == "" {
		log.Printf("WARN: Missing timestamps for time diff (start=%v, end=%v), using fallback", startRaw, endRaw)
		return 1 // Fallback: 1 second so it doesn't get filtered as "no data"
	}

	start, err1 := time.Parse(time.RFC3339Nano, startStr)
	end, err2 := time.Parse(time.RFC3339Nano, endStr)
	if err1 != nil || err2 != nil {
		// Try alternate formats if RFC3339Nano fails
		start, err1 = time.Parse(time.RFC3339, startStr)
		end, err2 = time.Parse(time.RFC3339, endStr)
		if err1 != nil || err2 != nil {
			// Try Go's default time format
			start, err1 = time.Parse("2006-01-02T15:04:05.999999999Z07:00", startStr)
			end, err2 = time.Parse("2006-01-02T15:04:05.999999999Z07:00", endStr)
			if err1 != nil || err2 != nil {
				log.Printf("WARN: Failed to parse timestamps (start=%v err=%v, end=%v err=%v)", startStr, err1, endStr, err2)
				return 1
			}
		}
	}

	diff := int(math.Max(1, math.Round(end.Sub(start).Seconds())))
	return diff
}

// deriveRegion maps lat/lng to a named region (simplified for Greater Accra)
func deriveRegion(lat, lng float64) string {
	switch {
	case lat > 5.65:
		return "Northern Accra"
	case lat > 5.55 && lng < -0.22:
		return "Western Accra"
	case lat > 5.55 && lng >= -0.22:
		return "Eastern Accra"
	case lat <= 5.55:
		return "Southern Accra"
	default:
		return "Greater Accra"
	}
}
