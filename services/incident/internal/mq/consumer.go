package mq

import (
	"encoding/json"
	"errors"
	"log"
	"strings"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
	"gorm.io/gorm"

	"github.com/google/uuid"

	"emergency-dispatch/services/incident/internal/models"
	"emergency-dispatch/services/incident/internal/repository"
)

type Consumer struct {
	conn      *amqp.Connection
	channel   *amqp.Channel
	repo      *repository.IncidentRepository
	publisher *Publisher
}

func NewConsumer(amqpURL string, repo *repository.IncidentRepository, publisher *Publisher) (*Consumer, error) {
	if amqpURL == "" {
		log.Println("WARN: RabbitMQ URL not configured, vehicle-driven transitions disabled")
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

	err = ch.ExchangeDeclare(ExchangeName, "topic", true, false, false, false, nil)
	if err != nil {
		ch.Close()
		conn.Close()
		return nil, err
	}

	return &Consumer{conn: conn, channel: ch, repo: repo, publisher: publisher}, nil
}

func (c *Consumer) Close() {
	if c.channel != nil {
		c.channel.Close()
	}
	if c.conn != nil {
		c.conn.Close()
	}
}

func (c *Consumer) Start() error {
	if c == nil {
		return nil
	}

	q, err := c.channel.QueueDeclare("incident.vehicle.transitions", true, false, false, false, nil)
	if err != nil {
		return err
	}

	err = c.channel.QueueBind(q.Name, "vehicle.status_changed", ExchangeName, false, nil)
	if err != nil {
		return err
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

	log.Println("Incident consumer started for vehicle.status_changed transitions")
	return nil
}

func (c *Consumer) handleMessage(msg amqp.Delivery) {
	var event map[string]interface{}
	if err := json.Unmarshal(msg.Body, &event); err != nil {
		log.Printf("Failed to unmarshal event: %v", err)
		return
	}

	eventType, _ := event["event"].(string)
	if eventType != "vehicle.status_changed" {
		return
	}
	data, _ := event["data"].(map[string]interface{})
	if data == nil {
		return
	}

	vehicleIDStr, _ := data["vehicle_id"].(string)
	vehicleStatus, _ := data["status"].(string)
	log.Printf("MQ: Received vehicle status change for %s: %s", vehicleIDStr, vehicleStatus)

	if vehicleIDStr == "" || vehicleStatus == "" {
		log.Printf("MQ: Missing vehicle_id or status in event data")
		return
	}

	vehicleID, err := uuid.Parse(vehicleIDStr)
	if err != nil {
		return
	}

	incident, err := c.repo.FindActiveByAssignedUnitID(vehicleID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			log.Printf("MQ: No active incident found for vehicle %s", vehicleIDStr)
			return
		}
		log.Printf("MQ: Error finding active incident for vehicle %s: %v", vehicleIDStr, err)
		return
	}

	log.Printf("MQ: Found active incident %s for vehicle %s. Current status: %s", incident.ID, vehicleIDStr, incident.Status)

	normalizedVehicleStatus := normalizeVehicleStatus(vehicleStatus)
	targetStatus, shouldTransition := targetIncidentStatusFromVehicle(normalizedVehicleStatus, incident.Status)
	if !shouldTransition {
		log.Printf("MQ: No incident transition required for vehicle status %s", normalizedVehicleStatus)
		return
	}

	if !models.CanTransitionStatus(incident.Status, targetStatus) {
		log.Printf("MQ: Invalid incident lifecycle transition: %s -> %s", incident.Status, targetStatus)
		return
	}

	incident.Status = targetStatus
	now := time.Now()
	if targetStatus == models.StatusDispatched && incident.DispatchedAt == nil {
		incident.DispatchedAt = &now
	}
	if targetStatus == models.StatusResolved {
		incident.ResolvedAt = &now
	}

	if err := c.repo.Update(incident); err != nil {
		log.Printf("Failed to update incident %s from vehicle status: %v", incident.ID.String(), err)
		return
	}

	if c.publisher != nil {
		c.publisher.PublishIncidentStatusChanged(incident, targetStatus)
	}

	log.Printf("Incident %s transitioned to %s from vehicle status %s", incident.ID.String(), targetStatus, normalizedVehicleStatus)
}

func normalizeVehicleStatus(status string) string {
	s := strings.ToLower(strings.TrimSpace(status))
	s = strings.ReplaceAll(s, "-", "_")
	s = strings.ReplaceAll(s, " ", "_")
	if s == "enroute" {
		return "en_route"
	}
	if s == "atscene" || s == "on_scene" {
		return "at_scene"
	}
	if s == "offduty" {
		return "off_duty"
	}
	return s
}

func targetIncidentStatusFromVehicle(vehicleStatus string, currentIncidentStatus string) (string, bool) {
	// Only at_scene and returning should trigger In Progress automatically
	switch vehicleStatus {
	case "at_scene", "returning":
		if currentIncidentStatus == models.StatusResolved {
			return "", false
		}
		return models.StatusInProgress, true
	default:
		// Other states (en_route, available, off_duty) do not change the incident status
		return "", false
	}
}
