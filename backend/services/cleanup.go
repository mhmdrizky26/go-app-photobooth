package services

import (
	"log"
	"os"
	"path/filepath"
	"photobooth/config"
	"photobooth/database"
	"time"
)

// StartCleanupJob jalankan goroutine cleanup otomatis setiap N jam
func StartCleanupJob() {
	interval := time.Duration(config.App.CleanupIntervalHours) * time.Hour
	log.Printf("🧹 Cleanup job aktif (interval: setiap %d jam)", config.App.CleanupIntervalHours)

	go func() {
		// Jalankan sekali saat pertama kali start
		runCleanup()

		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for range ticker.C {
			runCleanup()
		}
	}()
}

func runCleanup() {
	log.Println("🧹 Menjalankan cleanup sesi yang sudah expired...")

	rows, err := database.DB.Query(`
		SELECT id FROM sessions
		WHERE expires_at < datetime('now')
		AND status != 'expired'
	`)
	if err != nil {
		log.Printf("❌ Cleanup query gagal: %v", err)
		return
	}
	defer rows.Close()

	var expiredIDs []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			log.Printf("❌ Cleanup scan gagal: %v", err)
			return
		}
		expiredIDs = append(expiredIDs, id)
	}

	if err := rows.Err(); err != nil {
		log.Printf("❌ Cleanup rows error: %v", err)
		return
	}

	if len(expiredIDs) == 0 {
		log.Println("✅ Tidak ada sesi expired")
		return
	}

	deleted := 0
	for _, sessionID := range expiredIDs {
		if err := cleanupSession(sessionID); err != nil {
			log.Printf("❌ Gagal hapus sesi %s: %v", sessionID, err)
			continue
		}
		deleted++
	}

	log.Printf("✅ Cleanup selesai: %d sesi dihapus", deleted)
}

func cleanupSession(sessionID string) error {
	// Hapus semua file foto dari disk
	sessionDir := filepath.Join(config.App.StoragePath, "sessions", sessionID)
	if err := os.RemoveAll(sessionDir); err != nil && !os.IsNotExist(err) {
		return err
	}

	// Hapus data dari DB dalam satu transaksi
	tx, err := database.DB.Begin()
	if err != nil {
		return err
	}

	if _, err := tx.Exec(`DELETE FROM voucher_usage WHERE session_id = ?`, sessionID); err != nil {
		tx.Rollback()
		return err
	}
	if _, err := tx.Exec(`DELETE FROM photos WHERE session_id = ?`, sessionID); err != nil {
		tx.Rollback()
		return err
	}
	if _, err := tx.Exec(`DELETE FROM transactions WHERE session_id = ?`, sessionID); err != nil {
		tx.Rollback()
		return err
	}
	if _, err := tx.Exec(`UPDATE sessions SET status = 'expired' WHERE id = ?`, sessionID); err != nil {
		tx.Rollback()
		return err
	}

	if err := tx.Commit(); err != nil {
		tx.Rollback()
		return err
	}

	log.Printf("🗑️  Sesi %s berhasil dihapus", sessionID)
	return nil
}
