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
		Port:      getEnv("AUTH_SERVICE_PORT", "8081"),
		DBHost:    getEnv("AUTH_DB_HOST", "localhost"),
		DBPort:    getEnv("AUTH_DB_PORT", "5432"),
		DBUser:    getEnv("AUTH_DB_USER", "postgres"),
		DBPass:    getEnv("AUTH_DB_PASSWORD", "postgres"),
		DBName:    getEnv("AUTH_DB_NAME", "auth_db"),
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
