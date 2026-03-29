package config

import (
	"fmt"
	"os"
)

type Config struct {
	Port               string
	DBHost             string
	DBPort             string
	DBUser             string
	DBPass             string
	DBName             string
	DBSSLMode          string
	JWTSecret          string
	RabbitURL          string
	DispatchServiceURL string
}

func Load() *Config {
	return &Config{
		Port:               getEnv("INCIDENT_SERVICE_PORT", getEnv("PORT", "8082")),
		DBHost:             getEnv("INCIDENT_DB_HOST", "localhost"),
		DBPort:             getEnv("INCIDENT_DB_PORT", "5432"),
		DBUser:             getEnv("INCIDENT_DB_USER", "postgres"),
		DBPass:             getEnv("INCIDENT_DB_PASSWORD", "postgres"),
		DBName:             getEnv("INCIDENT_DB_NAME", "incident_db"),
		DBSSLMode:          getEnv("INCIDENT_DB_SSLMODE", "disable"),
		JWTSecret:          getEnv("JWT_SECRET", "dev-secret-change-in-production"),
		RabbitURL:          getEnv("RABBITMQ_URL", ""),
		DispatchServiceURL: getEnv("DISPATCH_SERVICE_URL", "http://localhost:8083"),
	}
}

func (c *Config) DSN() string {
	return fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		c.DBHost, c.DBPort, c.DBUser, c.DBPass, c.DBName, c.DBSSLMode,
	)
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}
