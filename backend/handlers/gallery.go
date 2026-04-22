package handlers

import (
	"database/sql"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"photobooth/config"
	"photobooth/database"
	"photobooth/models"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

type galleryPhoto struct {
	ID          string `json:"id"`
	URL         string `json:"url"`
	DownloadURL string `json:"download_url"`
	Number      int    `json:"number"`
}

type galleryData struct {
	SessionID   string         `json:"session_id"`
	Category    string         `json:"category"`
	FrameName   string         `json:"frame_name"`
	PhotoCount  int            `json:"photo_count"`
	RawPhotos   []galleryPhoto `json:"raw_photos"`
	FramedPhoto *galleryPhoto  `json:"framed_photo,omitempty"`
	ExpiresAt   string         `json:"expires_at"`
}

// GET /api/gallery/{sessionID}
func GetGalleryData(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")

	session, err := validateGallerySession(sessionID)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	// ── 5. Ambil foto raw dari DB ─────────────────────────────────────────
	rows, err := database.DB.Query(`
    SELECT id, file_path, position
		FROM photos
		WHERE session_id = ? AND type = 'raw' AND selected = 1
		ORDER BY COALESCE(position, 99) ASC`,
		sessionID,
	)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal memuat foto")
		return
	}
	defer rows.Close()

	var rawPhotos []galleryPhoto
	num := 1
	for rows.Next() {
		var id, filePath string
		var pos *int
		if err := rows.Scan(&id, &filePath, &pos); err != nil {
			respondError(w, http.StatusInternalServerError, "Gagal memuat foto")
			return
		}

		// Pastikan file fisik masih ada
		fullPath := filepath.Join(config.App.StoragePath, filePath)
		if _, err := os.Stat(fullPath); os.IsNotExist(err) {
			continue
		}

		rawPhotos = append(rawPhotos, galleryPhoto{
			ID:          id,
			URL:         fmt.Sprintf("/storage/%s", filePath),
			DownloadURL: fmt.Sprintf("/api/photo/download/%s", id),
			Number:      num,
		})
		num++
	}

	if err := rows.Err(); err != nil {
		respondError(w, http.StatusInternalServerError, "Gagal memuat foto")
		return
	}

	// ── 6. Ambil foto framed dari DB ──────────────────────────────────────
	var framedPhoto *galleryPhoto
	var framedID, framedPath, framedName string
	err = database.DB.QueryRow(`
		SELECT id, file_path, file_name
		FROM photos
		WHERE session_id = ? AND type = 'framed'
		ORDER BY created_at DESC
		LIMIT 1`,
		sessionID,
	).Scan(&framedID, &framedPath, &framedName)

	if err == nil {
		fullPath := filepath.Join(config.App.StoragePath, framedPath)
		if _, err := os.Stat(fullPath); err == nil {
			framedPhoto = &galleryPhoto{
				ID:          framedID,
				URL:         fmt.Sprintf("/storage/%s", framedPath),
				DownloadURL: fmt.Sprintf("/api/photo/download/%s", framedID),
			}
		}
	} else if err != sql.ErrNoRows {
		respondError(w, http.StatusInternalServerError, "Gagal memuat strip foto")
		return
	}

	// ── 7. Ambil nama frame ───────────────────────────────────────────────
	frameName := "—"
	if session.FrameID != "" {
		frameName = formatFrameName(session.FrameID)
	}

	// ── 8. Render gallery HTML ────────────────────────────────────────────
	data := galleryData{
		SessionID:   sessionID,
		Category:    string(session.Category),
		FrameName:   frameName,
		PhotoCount:  len(rawPhotos),
		RawPhotos:   rawPhotos,
		FramedPhoto: framedPhoto,
		ExpiresAt:   session.ExpiresAt.Format("02 January 2006"),
	}

	respondJSON(w, http.StatusOK, models.SuccessResponse(data))
}

// GET /gallery/{sessionID}
// Redirect legacy URL ke frontend page agar QR lama tetap berfungsi.
func ServeGallery(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")
	target := strings.TrimRight(config.App.FrontendURL, "/") + "/gallery.html?session_id=" + url.QueryEscape(sessionID)
	http.Redirect(w, r, target, http.StatusFound)
}

func validateGallerySession(sessionID string) (*models.Session, error) {
	session, err := GetSessionByID(sessionID)
	if err != nil {
		return nil, fmt.Errorf("sesi foto tidak ditemukan")
	}

	if time.Now().After(session.ExpiresAt) || session.Status == models.StatusExpired {
		return nil, fmt.Errorf("link gallery sudah kedaluwarsa")
	}

	if session.Status != models.StatusCompleted {
		return nil, fmt.Errorf("foto untuk sesi ini belum siap")
	}

	sessionDir := filepath.Join(config.App.StoragePath, "sessions", sessionID)
	if _, err := os.Stat(sessionDir); os.IsNotExist(err) {
		return nil, fmt.Errorf("file foto untuk sesi ini sudah tidak tersedia")
	}

	return session, nil
}
