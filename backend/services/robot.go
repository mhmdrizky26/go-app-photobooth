package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"photobooth/config"
	"strings"
	"time"
)

var robotHTTPClient = &http.Client{Timeout: 12 * time.Second}

func robotBaseURL() (string, error) {
	if config.App == nil {
		return "", fmt.Errorf("config belum dimuat")
	}

	base := strings.TrimSpace(config.App.RobotAPIURL)
	if base == "" {
		return "", fmt.Errorf("ROBOT_API_URL belum diset")
	}

	return strings.TrimRight(base, "/"), nil
}

func callRobotAPI(method, path string, body []byte) error {
	base, err := robotBaseURL()
	if err != nil {
		return err
	}

	url := base + path
	var reader io.Reader
	if len(body) > 0 {
		reader = bytes.NewReader(body)
	}

	req, err := http.NewRequest(method, url, reader)
	if err != nil {
		return fmt.Errorf("gagal membuat request robot: %w", err)
	}
	if len(body) > 0 {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := robotHTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("gagal memanggil robot api: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		detail := strings.TrimSpace(string(respBody))
		if detail != "" {
			return fmt.Errorf("robot api %s gagal: status %d: %s", path, resp.StatusCode, detail)
		}
		return fmt.Errorf("robot api %s gagal: status %d", path, resp.StatusCode)
	}

	return nil
}

// EnableRobot memanggil API robot luar untuk menyalakan mode kerja.
func EnableRobot() error {
	if err := callRobotAPI(http.MethodPost, "/robot/enable", nil); err != nil {
		return err
	}
	if config.App != nil {
		config.App.RobotEnabled = true
	}
	return nil
}

// DisableRobot memanggil API robot luar untuk mematikan mode kerja.
func DisableRobot() error {
	if err := callRobotAPI(http.MethodPost, "/robot/disable", nil); err != nil {
		return err
	}
	if config.App != nil {
		config.App.RobotEnabled = false
	}
	return nil
}

// StopRobot memanggil emergency stop pada robot luar.
func StopRobot() error {
	if err := callRobotAPI(http.MethodPost, "/robot/stop", nil); err != nil {
		return err
	}
	if config.App != nil {
		config.App.RobotEnabled = false
	}
	return nil
}

// TriggerPreset menjalankan preset gerakan robot di service luar.
func TriggerPreset(preset int) error {
	body, err := json.Marshal(map[string]int{"preset": preset})
	if err != nil {
		return fmt.Errorf("gagal encode preset: %w", err)
	}

	return callRobotAPI(http.MethodPost, "/robot/preset", body)
}
