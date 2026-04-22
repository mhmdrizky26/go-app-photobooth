package database

import (
	"database/sql"
	"fmt"
	"log"

	_ "modernc.org/sqlite"
)

var DB *sql.DB

func Init(storagePath string) error {
	dbPath := storagePath + "/photobooth.db"

	db, err := sql.Open("sqlite", dbPath+"?_journal_mode=WAL&_foreign_keys=on")
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}

	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)

	if err := db.Ping(); err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}

	DB = db
	log.Printf("✅ Database connected: %s", dbPath)

	return runMigrations(db)
}

func runMigrations(db *sql.DB) error {
	migrations := []string{
		createSessionsTable,
		createTransactionsTable,
		createPhotosTable,
		createVouchersTable,
		createVoucherUsageTable,
	}

	for i, m := range migrations {
		if _, err := db.Exec(m); err != nil {
			return fmt.Errorf("migration %d failed: %w", i+1, err)
		}
	}

	log.Println("✅ Database migrations completed")
	return nil
}

const createSessionsTable = `
CREATE TABLE IF NOT EXISTS sessions (
	id            TEXT PRIMARY KEY,
	category      TEXT NOT NULL CHECK(category IN ('regular', 'vip')),
	duration_secs INTEGER NOT NULL,
	price         INTEGER NOT NULL,
	discount      INTEGER NOT NULL DEFAULT 0,
	final_price   INTEGER NOT NULL,
	status        TEXT NOT NULL DEFAULT 'pending_payment'
	              CHECK(status IN ('pending_payment', 'paid', 'shooting', 'completed', 'expired')),
	frame_id      TEXT,
	created_at    DATETIME NOT NULL DEFAULT (datetime('now')),
	expires_at    DATETIME NOT NULL,
	completed_at  DATETIME
);`

const createTransactionsTable = `
CREATE TABLE IF NOT EXISTS transactions (
	id                TEXT PRIMARY KEY,
	session_id        TEXT NOT NULL REFERENCES sessions(id),
	midtrans_order_id TEXT UNIQUE NOT NULL,
	amount            INTEGER NOT NULL,
	status            TEXT NOT NULL DEFAULT 'pending'
	                  CHECK(status IN ('pending', 'paid', 'failed', 'expired', 'cancelled')),
	qris_url          TEXT,
	qris_raw_string   TEXT,
	paid_at           DATETIME,
	created_at        DATETIME NOT NULL DEFAULT (datetime('now'))
);`

const createPhotosTable = `
CREATE TABLE IF NOT EXISTS photos (
	id          TEXT PRIMARY KEY,
	session_id  TEXT NOT NULL REFERENCES sessions(id),
	file_path   TEXT NOT NULL,
	file_name   TEXT NOT NULL,
	type        TEXT NOT NULL CHECK(type IN ('raw', 'framed')),
	selected    INTEGER NOT NULL DEFAULT 0,
	position    INTEGER,
	created_at  DATETIME NOT NULL DEFAULT (datetime('now'))
);`

const createVouchersTable = `
CREATE TABLE IF NOT EXISTS vouchers (
	code           TEXT PRIMARY KEY,
	description    TEXT,
	discount_type  TEXT NOT NULL CHECK(discount_type IN ('percent', 'fixed')),
	discount_value INTEGER NOT NULL,
	min_price      INTEGER NOT NULL DEFAULT 0,
	max_uses       INTEGER NOT NULL DEFAULT 1,
	used_count     INTEGER NOT NULL DEFAULT 0,
	is_active      INTEGER NOT NULL DEFAULT 1,
	expires_at     DATETIME,
	created_at     DATETIME NOT NULL DEFAULT (datetime('now'))
);`

const createVoucherUsageTable = `
CREATE TABLE IF NOT EXISTS voucher_usage (
	id           TEXT PRIMARY KEY,
	voucher_code TEXT NOT NULL REFERENCES vouchers(code),
	session_id   TEXT NOT NULL REFERENCES sessions(id),
	used_at      DATETIME NOT NULL DEFAULT (datetime('now'))
);`

func Close() {
	if DB != nil {
		DB.Close()
	}
}
