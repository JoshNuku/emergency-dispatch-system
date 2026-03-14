package config

import "os"

type Config struct {
	Port      string
	JWTSecret string
}

func Load() *Config {
	return &Config{
		Port:      getEnv("REALTIME_PORT", "8085"),
		JWTSecret: getEnv("JWT_SECRET", "supersecretkey"),
	}
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}
