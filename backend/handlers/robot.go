package handlers

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"image"
	"image/draw"
	"image/jpeg"
	"log"
	"net/http"
	"path/filepath"
	"photobooth/config"
	"photobooth/database"
	"photobooth/models"
	"photobooth/services"
	"strings"
	"time"

	"github.com/google/uuid"
)

const presetCaptureDelay = 3 * time.Second

func flipJPEGHorizontal(frame []byte) []byte {
	img, _, err := image.Decode(bytes.NewReader(frame))
	if err != nil {
		return frame
	}

	b := img.Bounds()
	w := b.Dx()
	h := b.Dy()
	if w <= 1 || h <= 1 {
		return frame
	}

	src := image.NewRGBA(b)
	draw.Draw(src, b, img, b.Min, draw.Src)
	dst := image.NewRGBA(b)

	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			dst.Set(x+b.Min.X, y+b.Min.Y, src.At((w-1-x)+b.Min.X, y+b.Min.Y))
		}
	}

	var out bytes.Buffer
	if err := jpeg.Encode(&out, dst, &jpeg.Options{Quality: 85}); err != nil {
		return frame
	}
	return out.Bytes()
}

// GET /api/robot/status
// Cek apakah kamera terhubung
func GetCameraStatus(w http.ResponseWriter, r *http.Request) {
	status, err := services.CheckCamera()
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal cek kamera")
		return
	}
	respondJSON(w, http.StatusOK, models.SuccessResponse(status))
}

// POST /api/robot/capture
// Trigger shutter Canon, simpan foto ke sesi
func RobotCapture(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SessionID string `json:"session_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	photo, err := captureRobotSessionPhoto(req.SessionID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusCreated, models.SuccessResponse(photo))
}

// GET /api/robot/liveview
// Stream 1 frame dari live view Canon sebagai JPEG
func GetLiveView(w http.ResponseWriter, r *http.Request) {
	frame, err := services.GetLiveViewFrame()
	if err != nil {
		respondError(w, http.StatusServiceUnavailable, "Live view tidak tersedia")
		return
	}

	frame = flipJPEGHorizontal(frame)

	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")
	w.Write(frame)
}

// GET /api/robot/liveview/stream
// Continuous MJPEG stream untuk live preview di browser
func StreamLiveView(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "multipart/x-mixed-replace; boundary=frame")
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")

	for {
		select {
		case <-r.Context().Done():
			return
		default:
			frame, err := services.GetLiveViewFrame()
			if err != nil {
				time.Sleep(500 * time.Millisecond)
				continue
			}

			frame = flipJPEGHorizontal(frame)

			fmt.Fprintf(w, "--frame\r\nContent-Type: image/jpeg\r\n\r\n")
			w.Write(frame)
			fmt.Fprintf(w, "\r\n")

			if f, ok := w.(http.Flusher); ok {
				f.Flush()
			}

			time.Sleep(100 * time.Millisecond) // ~10 fps
		}
	}
}

// ─── Robot Enable / Disable ───────────────────────────────────────────────────

// POST /api/robot/enable
// Dipanggil manual jika perlu enable robot dari luar payment flow
func EnableRobot(w http.ResponseWriter, r *http.Request) {
	go func() {
		if err := services.EnableRobot(); err != nil {
			log.Printf("⚠️  Robot enable gagal: %v", err)
		}
	}()

	respondJSON(w, http.StatusOK, models.SuccessResponse(map[string]string{
		"status":  "enabling",
		"message": "Robot sedang diaktifkan",
	}))
}

// POST /api/robot/disable
// Dipanggil dari frontend saat timer download selesai
func DisableRobot(w http.ResponseWriter, r *http.Request) {
	if err := services.DisableRobot(); err != nil {
		log.Printf("⚠️  Robot disable gagal: %v", err)
		respondError(w, http.StatusServiceUnavailable, "Gagal nonaktifkan robot: "+err.Error())
		return
	}

	respondJSON(w, http.StatusOK, models.SuccessResponse(map[string]string{
		"status":  "disabled",
		"message": "Robot berhasil dinonaktifkan",
	}))
}

// POST /api/robot/stop
// Emergency stop — hentikan semua aktivitas robot
func StopRobot(w http.ResponseWriter, r *http.Request) {
	if err := services.StopRobot(); err != nil {
		respondError(w, http.StatusServiceUnavailable, "Gagal menghentikan robot: "+err.Error())
		return
	}

	respondJSON(w, http.StatusOK, models.SuccessResponse(map[string]string{
		"status":  "stopped",
		"message": "Robot dihentikan",
	}))
}

// POST /api/robot/preset
// Trigger preset gerakan robot
func TriggerPreset(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Preset    int    `json:"preset"`
		SessionID string `json:"session_id,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Preset == 0 {
		respondError(w, http.StatusBadRequest, "Preset tidak valid")
		return
	}

	if err := services.TriggerPreset(req.Preset); err != nil {
		respondError(w, http.StatusServiceUnavailable, "Gagal trigger preset: "+err.Error())
		return
	}

	if config.App != nil {
		config.App.SetAutoCaptureAt(time.Time{})
	}

	autoCaptureScheduled := false
	resolvedSessionID, err := resolveRobotCaptureSessionID(req.SessionID)
	if err == nil {
		autoCaptureScheduled = true
		go func(sessionID string, preset int) {
			defer func() {
				if config.App != nil {
					config.App.SetCurrentPreset(0)
				}
			}()

			time.Sleep(presetCaptureDelay)

			photo, err := captureRobotSessionPhoto(sessionID)
			if err != nil {
				log.Printf("⚠️  Auto capture gagal (session: %s, preset: %d): %v", sessionID, preset, err)
				return
			}

			log.Printf("📸 Auto capture selesai (session: %s, preset: %d, photo: %s)", sessionID, preset, photo.ID)
		}(req.SessionID, req.Preset)
	} else {
		go func() {
			time.Sleep(presetCaptureDelay)
			if config.App != nil {
				config.App.ResetRobotState()
			}
		}()
		log.Printf("⚠️  Auto capture tidak dijadwalkan (preset: %d): %v", req.Preset, err)
	}

	currentPreset := 0
	if config.App != nil {
		currentPreset = config.App.GetCurrentPreset()
	}

	respondJSON(w, http.StatusOK, models.SuccessResponse(map[string]interface{}{
		"status":         "queued",
		"preset":         req.Preset,
		"session_id":     resolvedSessionID,
		"auto_capture":   autoCaptureScheduled,
		"current_preset": currentPreset,
	}))
}

// GET /api/robot/config
// Cek konfigurasi robot saat ini (URL dan status enabled)
func GetRobotConfig(w http.ResponseWriter, r *http.Request) {
	autoCaptureActive := false
	autoCaptureRemainingMs := int64(0)
	autoCaptureAt := time.Time{}
	if config.App != nil {
		autoCaptureAt = config.App.GetAutoCaptureAt()
	}
	if !autoCaptureAt.IsZero() {
		autoCaptureRemainingMs = time.Until(autoCaptureAt).Milliseconds()
		if autoCaptureRemainingMs > 0 {
			autoCaptureActive = true
		} else {
			autoCaptureRemainingMs = 0
		}
	}
	currentPreset := 0
	if config.App != nil {
		currentPreset = config.App.GetCurrentPreset()
	}

	respondJSON(w, http.StatusOK, models.SuccessResponse(map[string]interface{}{
		"enabled":                   config.App.RobotEnabled,
		"url":                       config.App.RobotAPIURL,
		"current_preset":            currentPreset,
		"auto_capture_at":           autoCaptureAt.UTC().Format(time.RFC3339Nano),
		"auto_capture_active":       autoCaptureActive,
		"auto_capture_remaining_ms": autoCaptureRemainingMs,
	}))
}

// POST /api/robot/webhook
// Simple webhook for robot to report active preset or events.
func RobotWebhook(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Preset int    `json:"preset"`
		Event  string `json:"event,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Preset <= 0 {
		respondError(w, http.StatusBadRequest, "Preset missing or invalid")
		return
	}

	if config.App != nil {
		// If robot reports an ending event, clear current preset
		if strings.ToLower(req.Event) == "ended" || strings.ToLower(req.Event) == "finished" {
			config.App.ResetRobotState()
		} else {
			config.App.SetCurrentPreset(req.Preset)
		}
	}

	currentPreset := 0
	if config.App != nil {
		currentPreset = config.App.GetCurrentPreset()
	}

	respondJSON(w, http.StatusOK, models.SuccessResponse(map[string]interface{}{
		"current_preset": currentPreset,
	}))
}

// POST /api/robot/moving
// Called when robot starts moving to a preset. Updates current_preset so UI shows it.
func RobotMoving(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Preset    int    `json:"preset"`
		SessionID string `json:"session_id,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Preset <= 0 {
		respondError(w, http.StatusBadRequest, "Preset missing or invalid")
		return
	}

	if config.App != nil {
		config.App.SetCurrentPreset(req.Preset)
		config.App.SetAutoCaptureAt(time.Time{})
	}

	currentPreset := 0
	if config.App != nil {
		currentPreset = config.App.GetCurrentPreset()
	}

	respondJSON(w, http.StatusOK, models.SuccessResponse(map[string]interface{}{
		"current_preset": currentPreset,
		"session_id":     req.SessionID,
	}))
}

// POST /api/robot/done
// Called when robot finishes movement for a preset. Triggers auto-capture for session.
func RobotDone(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Preset    int    `json:"preset"`
		SessionID string `json:"session_id,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Start countdown for the auto-capture window, but keep preset visible
	if config.App != nil {
		config.App.SetAutoCaptureAt(time.Now().Add(presetCaptureDelay))
	}

	// Try to resolve session ID and schedule capture
	resolvedSessionID, err := resolveRobotCaptureSessionID(req.SessionID)
	if err != nil {
		// No session to capture, return accepted but note missing session
		if config.App != nil {
			config.App.ResetRobotState()
		}
		currentPreset := 0
		autoCaptureAt := time.Time{}
		if config.App != nil {
			currentPreset = config.App.GetCurrentPreset()
			autoCaptureAt = config.App.GetAutoCaptureAt()
		}
		respondJSON(w, http.StatusOK, models.SuccessResponse(map[string]interface{}{
			"status":          "no_session",
			"message":         err.Error(),
			"current_preset":  currentPreset,
			"auto_capture_at": autoCaptureAt.UTC().Format(time.RFC3339Nano),
		}))
		return
	}

	// Schedule capture asynchronously so robot webhook returns quickly
	go func(sessionID string, preset int) {
		// Wait for the configured preset capture delay so frontend countdown can run
		time.Sleep(presetCaptureDelay)

		photo, err := captureRobotSessionPhoto(sessionID)
		if err != nil {
			log.Printf("⚠️  Auto capture (robot done) gagal (session: %s, preset: %d): %v", sessionID, preset, err)
			return
		}

		log.Printf("📸 Auto capture (robot done) selesai (session: %s, preset: %d, photo: %s)", sessionID, preset, photo.ID)

		// ensure preset cleared (defensive)
		if config.App != nil {
			config.App.ResetRobotState()
		}
	}(resolvedSessionID, req.Preset)

	currentPreset := 0
	autoCaptureAt := time.Time{}
	if config.App != nil {
		currentPreset = config.App.GetCurrentPreset()
		autoCaptureAt = config.App.GetAutoCaptureAt()
	}

	respondJSON(w, http.StatusAccepted, models.SuccessResponse(map[string]interface{}{
		"status":          "capture_scheduled",
		"session_id":      resolvedSessionID,
		"current_preset":  currentPreset,
		"auto_capture_at": autoCaptureAt.UTC().Format(time.RFC3339Nano),
	}))
}

func captureRobotSessionPhoto(sessionID string) (*models.Photo, error) {
	resolvedSessionID, err := resolveRobotCaptureSessionID(sessionID)
	if err != nil {
		return nil, err
	}

	// Validasi sesi
	session, err := GetSessionByID(resolvedSessionID)
	if err != nil {
		return nil, fmt.Errorf("Session tidak ditemukan")
	}

	if session.Status != models.StatusPaid && session.Status != models.StatusShooting {
		return nil, fmt.Errorf("Sesi tidak dalam status foto")
	}

	// Update status ke shooting kalau masih paid
	if session.Status == models.StatusPaid {
		if _, err := database.DB.Exec(`UPDATE sessions SET status = 'shooting' WHERE id = ?`, resolvedSessionID); err != nil {
			return nil, fmt.Errorf("Gagal memperbarui status sesi")
		}
	}

	// Trigger Canon via digiCamControl
	filePath, err := services.TriggerCapture(resolvedSessionID)
	if err != nil {
		return nil, fmt.Errorf("Gagal trigger kamera: %w", err)
	}

	// Hitung relative path untuk DB
	storagePath := config.App.StoragePath
	relPath, err := filepath.Rel(storagePath, filePath)
	if err != nil {
		relPath = filePath
	}
	// Normalize path separator
	relPath = filepath.ToSlash(relPath)

	fileName := filepath.Base(filePath)
	photoID := uuid.New().String()
	now := time.Now()

	// Simpan metadata ke DB
	_, err = database.DB.Exec(`
		INSERT INTO photos
			(id, session_id, file_path, file_name, type, selected, created_at)
		VALUES
			(?, ?, ?, ?, 'raw', 0, ?)`,
		photoID, resolvedSessionID, relPath, fileName, now.UTC(),
	)
	if err != nil {
		return nil, fmt.Errorf("Gagal simpan metadata foto")
	}

	photo := &models.Photo{
		ID:        photoID,
		SessionID: resolvedSessionID,
		FilePath:  relPath,
		FileName:  fileName,
		Type:      models.PhotoRaw,
		Selected:  false,
		CreatedAt: now,
		URL:       fmt.Sprintf("/storage/%s", relPath),
	}

	return photo, nil
}

func resolveRobotCaptureSessionID(sessionID string) (string, error) {
	if sessionID != "" {
		return sessionID, nil
	}

	row := database.DB.QueryRow(`
		SELECT id FROM sessions
		WHERE status IN ('paid', 'shooting')
		ORDER BY created_at DESC
		LIMIT 1
	`)

	var resolved string
	if err := row.Scan(&resolved); err != nil {
		if err == sql.ErrNoRows {
			return "", fmt.Errorf("Session aktif tidak ditemukan")
		}
		return "", err
	}

	return resolved, nil
}
