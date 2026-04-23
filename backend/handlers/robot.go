package handlers

import (
	"bytes"
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
	"time"

	"github.com/google/uuid"
)

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

	// Validasi sesi
	session, err := GetSessionByID(req.SessionID)
	if err != nil {
		respondError(w, http.StatusNotFound, "Session tidak ditemukan")
		return
	}

	if session.Status != models.StatusPaid && session.Status != models.StatusShooting {
		respondError(w, http.StatusForbidden, "Sesi tidak dalam status foto")
		return
	}

	// Update status ke shooting kalau masih paid
	if session.Status == models.StatusPaid {
		if _, err := database.DB.Exec(`UPDATE sessions SET status = 'shooting' WHERE id = ?`, req.SessionID); err != nil {
			respondError(w, http.StatusInternalServerError, "Gagal memperbarui status sesi")
			return
		}
	}

	// Trigger Canon via digiCamControl
	filePath, err := services.TriggerCapture(req.SessionID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal trigger kamera: "+err.Error())
		return
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

	// Simpan metadata ke DB
	_, err = database.DB.Exec(`
		INSERT INTO photos
			(id, session_id, file_path, file_name, type, selected, created_at)
		VALUES
			(?, ?, ?, ?, 'raw', 0, ?)`,
		photoID, req.SessionID, relPath, fileName, time.Now().UTC(),
	)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal simpan metadata foto")
		return
	}

	photo := models.Photo{
		ID:        photoID,
		SessionID: req.SessionID,
		FilePath:  relPath,
		FileName:  fileName,
		Type:      models.PhotoRaw,
		Selected:  false,
		CreatedAt: time.Now(),
		URL:       fmt.Sprintf("/storage/%s", relPath),
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

// GET /api/robot/session/{sessionID}
// Ambil semua foto raw dari sesi (sama seperti GetSessionPhotos tapi untuk robot)
func GetRobotSessionPhotos(w http.ResponseWriter, r *http.Request) {
	GetSessionPhotos(w, r)
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
		Preset int `json:"preset"`
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

	respondJSON(w, http.StatusOK, models.SuccessResponse(map[string]interface{}{
		"status": "queued",
		"preset": req.Preset,
	}))
}

// GET /api/robot/config
// Cek konfigurasi robot saat ini (URL dan status enabled)
func GetRobotConfig(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, models.SuccessResponse(map[string]interface{}{
		"enabled": config.App.RobotEnabled,
		"url":     config.App.RobotAPIURL,
	}))
}
