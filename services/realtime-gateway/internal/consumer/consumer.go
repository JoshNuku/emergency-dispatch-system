package consumer

import (
	"log"

	amqp "github.com/rabbitmq/amqp091-go"

	"emergency-dispatch/services/realtime-gateway/internal/hub"
)

type Consumer struct {
	conn *amqp.Connection
	hub  *hub.Hub
}

func NewConsumer(amqpURL string, h *hub.Hub) (*Consumer, error) {
	conn, err := amqp.Dial(amqpURL)
	if err != nil {
		return nil, err
	}
	return &Consumer{conn: conn, hub: h}, nil
}

func (c *Consumer) StartConsuming() error {
	ch, err := c.conn.Channel()
	if err != nil {
		return err
	}

	err = ch.ExchangeDeclare("emergency.events", "topic", true, false, false, false, nil)
	if err != nil {
		return err
	}

	q, err := ch.QueueDeclare("realtime.broadcast", true, false, false, false, nil)
	if err != nil {
		return err
	}

	// Bind to all events we want to broadcast
	bindings := []string{
		"incident.created",
		"incident.dispatched",
		"incident.status_changed",
		"vehicle.location_updated",
		"vehicle.status_changed",
	}
	for _, key := range bindings {
		if err := ch.QueueBind(q.Name, key, "emergency.events", false, nil); err != nil {
			return err
		}
	}

	msgs, err := ch.Consume(q.Name, "", true, false, false, false, nil)
	if err != nil {
		return err
	}

	log.Println("Real-time gateway consuming events...")

	for msg := range msgs {
		// Forward the raw event directly to all WebSocket clients
		wsMsg := map[string]interface{}{
			"type":    msg.RoutingKey,
			"payload": string(msg.Body),
		}
		c.hub.BroadcastJSON(wsMsg)
	}

	return nil
}

func (c *Consumer) Close() {
	if c.conn != nil {
		c.conn.Close()
	}
}
