package config

import (
	"fmt"
	"os"
)

type Config struct {
	Port      string
	DBHost    string
	DBPort    string
	DBUser    string
	DBPass    string
	DBName    string
	JWTSecret string
	RabbitURL string
}

func Load() *Config {
	return &Config{
		Port:      getEnv("ANALYTICS_SERVICE_PORT", "8084"),
		DBHost:    getEnv("ANALYTICS_DB_HOST", "localhost"),
		DBPort:    getEnv("ANALYTICS_DB_PORT", "5432"),
		DBUser:    getEnv("ANALYTICS_DB_USER", "postgres"),
		DBPass:    getEnv("ANALYTICS_DB_PASSWORD", "postgres"),
		DBName:    getEnv("ANALYTICS_DB_NAME", "analytics_db"),
		JWTSecret: getEnv("JWT_SECRET", "dev-secret-change-in-production"),
		RabbitURL: getEnv("RABBITMQ_URL", ""),
	}
}

func (c *Config) DSN() string {
	return fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		c.DBHost, c.DBPort, c.DBUser, c.DBPass, c.DBName,
	)
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}
