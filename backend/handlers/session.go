package handlers

import (
	"encoding/json"
	"net/http"
	"photobooth/config"
	"photobooth/database"
	"photobooth/models"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// GET /api/categories
func GetCategories(w http.ResponseWriter, r *http.Request) {
	cats := []models.CategoryInfo{
		models.Categories[models.CategoryRegular],
		models.Categories[models.CategoryVIP],
	}
	respondJSON(w, http.StatusOK, models.SuccessResponse(cats))
}

// POST /api/session/create
func CreateSession(w http.ResponseWriter, r *http.Request) {
	var req models.CreateSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	catInfo, ok := models.Categories[req.Category]
	if !ok {
		respondError(w, http.StatusBadRequest, "Invalid category, gunakan 'regular' atau 'vip'")
		return
	}

	sessionID := uuid.New().String()
	now := time.Now()
	expiresAt := now.Add(time.Duration(config.App.SessionExpiryHours) * time.Hour)

	_, err := database.DB.Exec(`
		INSERT INTO sessions 
			(id, category, duration_secs, price, discount, final_price, status, created_at, expires_at)
		VALUES 
			(?, ?, ?, ?, 0, ?, 'pending_payment', ?, ?)`,
		sessionID,
		string(catInfo.ID),
		catInfo.DurationSecs,
		catInfo.Price,
		catInfo.Price,
		now.UTC(),
		expiresAt.UTC(),
	)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to create session")
		return
	}

	session := models.Session{
		ID:           sessionID,
		Category:     catInfo.ID,
		DurationSecs: catInfo.DurationSecs,
		Price:        catInfo.Price,
		Discount:     0,
		FinalPrice:   catInfo.Price,
		Status:       models.StatusPendingPayment,
		CreatedAt:    now,
		ExpiresAt:    expiresAt,
	}

	respondJSON(w, http.StatusCreated, models.SuccessResponse(session))
}

// GET /api/session/{sessionID}
func GetSession(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")

	session, err := GetSessionByID(sessionID)
	if err != nil {
		respondError(w, http.StatusNotFound, "Session not found")
		return
	}

	respondJSON(w, http.StatusOK, models.SuccessResponse(session))
}

// PATCH /api/session/{sessionID}/status
func UpdateSessionStatus(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")

	var body struct {
		Status models.SessionStatus `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	_, err := database.DB.Exec(
		`UPDATE sessions SET status = ? WHERE id = ?`,
		string(body.Status), sessionID,
	)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to update session")
		return
	}

	respondJSON(w, http.StatusOK, models.SuccessResponse(map[string]string{
		"session_id": sessionID,
		"status":     string(body.Status),
	}))
}

// ─── Shared helper, dipakai handler lain ─────────────────────────────────────

func GetSessionByID(id string) (*models.Session, error) {
	row := database.DB.QueryRow(`
		SELECT 
			id, category, duration_secs, price, discount, final_price,
			status, COALESCE(frame_id, ''), created_at, expires_at
		FROM sessions 
		WHERE id = ?`, id)

	var s models.Session
	var frameID string
	err := row.Scan(
		&s.ID,
		&s.Category,
		&s.DurationSecs,
		&s.Price,
		&s.Discount,
		&s.FinalPrice,
		&s.Status,
		&frameID,
		&s.CreatedAt,
		&s.ExpiresAt,
	)
	if err != nil {
		return nil, err
	}

	s.FrameID = frameID
	return &s, nil
}
