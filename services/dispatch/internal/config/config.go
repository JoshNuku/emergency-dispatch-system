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
	DBSSLMode string
	JWTSecret string
	RabbitURL string
}

func Load() *Config {
	return &Config{
		Port:      getEnv("DISPATCH_SERVICE_PORT", getEnv("PORT", "8083")),
		DBHost:    getEnv("DISPATCH_DB_HOST", "localhost"),
		DBPort:    getEnv("DISPATCH_DB_PORT", "5432"),
		DBUser:    getEnv("DISPATCH_DB_USER", "postgres"),
		DBPass:    getEnv("DISPATCH_DB_PASSWORD", "postgres"),
		DBName:    getEnv("DISPATCH_DB_NAME", "dispatch_db"),
		DBSSLMode: getEnv("DISPATCH_DB_SSLMODE", "disable"),
		JWTSecret: getEnv("JWT_SECRET", "dev-secret-change-in-production"),
		RabbitURL: getEnv("RABBITMQ_URL", ""),
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
