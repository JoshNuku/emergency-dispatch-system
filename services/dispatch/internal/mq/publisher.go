package mq

import (
	"encoding/json"
	"log"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

const ExchangeName = "emergency.events"

type Publisher struct {
	conn    *amqp.Connection
	channel *amqp.Channel
}

func NewPublisher(amqpURL string) (*Publisher, error) {
	if amqpURL == "" {
		log.Println("WARN: RabbitMQ URL not configured, events will not be published")
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

	return &Publisher{conn: conn, channel: ch}, nil
}

func (p *Publisher) Close() {
	if p.channel != nil {
		p.channel.Close()
	}
	if p.conn != nil {
		p.conn.Close()
	}
}

func (p *Publisher) publish(routingKey string, data interface{}) {
	if p == nil || p.channel == nil {
		return
	}

	event := map[string]interface{}{
		"event":     routingKey,
		"data":      data,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	}

	body, err := json.Marshal(event)
	if err != nil {
		log.Printf("Failed to marshal event %s: %v", routingKey, err)
		return
	}

	err = p.channel.Publish(ExchangeName, routingKey, false, false, amqp.Publishing{
		ContentType: "application/json",
		Body:        body,
	})
	if err != nil {
		log.Printf("Failed to publish event %s: %v", routingKey, err)
	} else {
		log.Printf("Published event: %s", routingKey)
	}
}

func (p *Publisher) PublishVehicleLocationUpdated(vehicleID, incidentID string, lat, lng float64, status string) {
	p.publish("vehicle.location_updated", map[string]interface{}{
		"vehicle_id":  vehicleID,
		"incident_id": incidentID,
		"latitude":    lat,
		"longitude":   lng,
		"status":      status,
	})
}

func (p *Publisher) PublishVehicleStatusChanged(vehicleID, status string) {
	p.publish("vehicle.status_changed", map[string]interface{}{
		"vehicle_id": vehicleID,
		"status":     status,
	})
}
