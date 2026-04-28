-- Photobooth SQLite schema
--
-- This schema reflects the tables currently used by the Go backend.
-- Frame assets are stored as files under storage/frames and are not stored
-- in a database table.

PRAGMA foreign_keys = ON;

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
);

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
);

CREATE TABLE IF NOT EXISTS photos (
	id          TEXT PRIMARY KEY,
	session_id  TEXT NOT NULL REFERENCES sessions(id),
	file_path   TEXT NOT NULL,
	file_name   TEXT NOT NULL,
	type        TEXT NOT NULL CHECK(type IN ('raw', 'framed')),
	selected    INTEGER NOT NULL DEFAULT 0,
	position    INTEGER,
	created_at  DATETIME NOT NULL DEFAULT (datetime('now'))
);

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
);

CREATE TABLE IF NOT EXISTS voucher_usage (
	id           TEXT PRIMARY KEY,
	voucher_code TEXT NOT NULL REFERENCES vouchers(code),
	session_id   TEXT NOT NULL REFERENCES sessions(id),
	used_at      DATETIME NOT NULL DEFAULT (datetime('now'))
);
