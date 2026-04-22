package config

import (
	"bufio"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	AppPort              string
	AppEnv               string
	MidtransServerKey    string
	MidtransClientKey    string
	MidtransEnv          string
	StoragePath          string
	DigiCamBaseURL       string
	SessionExpiryHours   int
	CleanupIntervalHours int
	FrontendURL          string
	RobotAPIURL          string
	RobotEnabled         bool
}

var App *Config

func Load() {
	if !loadEnvFile(".env") {
		loadEnvFile("backend/.env")
	}

	App = &Config{
		AppPort:              getEnv("APP_PORT", "8080"),
		AppEnv:               getEnv("APP_ENV", "development"),
		MidtransServerKey:    getEnv("MIDTRANS_SERVER_KEY", ""),
		MidtransClientKey:    getEnv("MIDTRANS_CLIENT_KEY", ""),
		MidtransEnv:          getEnv("MIDTRANS_ENV", "sandbox"),
		StoragePath:          getEnv("STORAGE_PATH", "./storage"),
		DigiCamBaseURL:       getEnv("DIGICAM_BASE_URL", "http://localhost:5513/api"),
		SessionExpiryHours:   getEnvInt("SESSION_EXPIRY_HOURS", 72),
		CleanupIntervalHours: getEnvInt("CLEANUP_INTERVAL_HOURS", 24),
		FrontendURL:          getEnv("FRONTEND_URL", "http://localhost:3000"),
		RobotAPIURL:          getEnv("ROBOT_API_URL", ""),
		RobotEnabled:         getEnv("ROBOT_ENABLED", "false") == "true",
	}
}

func loadEnvFile(filename string) bool {
	f, err := os.Open(filename)
	if err != nil {
		return false
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			key := strings.TrimSpace(parts[0])
			val := strings.TrimSpace(parts[1])
			if os.Getenv(key) == "" {
				os.Setenv(key, val)
			}
		}
	}

	return true
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if val := os.Getenv(key); val != "" {
		if i, err := strconv.Atoi(val); err == nil {
			return i
		}
	}
	return fallback
}
