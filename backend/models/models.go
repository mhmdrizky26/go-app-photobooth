package models

import "time"

// ─── Category ────────────────────────────────────────────────────────────────

type Category string

const (
	CategoryRegular Category = "regular"
	CategoryVIP     Category = "vip"
)

type CategoryInfo struct {
	ID           Category `json:"id"`
	Name         string   `json:"name"`
	Price        int      `json:"price"`
	DurationSecs int      `json:"duration_secs"`
	DurationMins int      `json:"duration_mins"`
	Description  string   `json:"description"`
}

var Categories = map[Category]CategoryInfo{
	CategoryRegular: {
		ID:           CategoryRegular,
		Name:         "Regular",
		Price:        35000,
		DurationSecs: 300,
		DurationMins: 5,
		Description:  "5 menit sesi foto, cetak 3 strip",
	},
	CategoryVIP: {
		ID:           CategoryVIP,
		Name:         "VIP",
		Price:        45000,
		DurationSecs: 480,
		DurationMins: 8,
		Description:  "8 menit sesi foto, cetak 3 strip, prioritas antrian",
	},
}

// ─── Session ─────────────────────────────────────────────────────────────────

type SessionStatus string

const (
	StatusPendingPayment SessionStatus = "pending_payment"
	StatusPaid           SessionStatus = "paid"
	StatusShooting       SessionStatus = "shooting"
	StatusCompleted      SessionStatus = "completed"
	StatusExpired        SessionStatus = "expired"
)

type Session struct {
	ID           string        `json:"id"`
	Category     Category      `json:"category"`
	DurationSecs int           `json:"duration_secs"`
	Price        int           `json:"price"`
	Discount     int           `json:"discount"`
	FinalPrice   int           `json:"final_price"`
	Status       SessionStatus `json:"status"`
	FrameID      string        `json:"frame_id,omitempty"`
	CreatedAt    time.Time     `json:"created_at"`
	ExpiresAt    time.Time     `json:"expires_at"`
	CompletedAt  *time.Time    `json:"completed_at,omitempty"`
}

// ─── Transaction ─────────────────────────────────────────────────────────────

type TransactionStatus string

const (
	TxPending   TransactionStatus = "pending"
	TxPaid      TransactionStatus = "paid"
	TxFailed    TransactionStatus = "failed"
	TxExpired   TransactionStatus = "expired"
	TxCancelled TransactionStatus = "cancelled"
)

type Transaction struct {
	ID              string            `json:"id"`
	SessionID       string            `json:"session_id"`
	MidtransOrderID string            `json:"midtrans_order_id"`
	Amount          int               `json:"amount"`
	Status          TransactionStatus `json:"status"`
	QRISUrl         string            `json:"qris_url,omitempty"`
	QRISRawString   string            `json:"qris_raw_string,omitempty"`
	PaidAt          *time.Time        `json:"paid_at,omitempty"`
	CreatedAt       time.Time         `json:"created_at"`
}

// ─── Photo ───────────────────────────────────────────────────────────────────

type PhotoType string

const (
	PhotoRaw    PhotoType = "raw"
	PhotoFramed PhotoType = "framed"
)

type Photo struct {
	ID          string    `json:"id"`
	SessionID   string    `json:"session_id"`
	FilePath    string    `json:"file_path"`
	FileName    string    `json:"file_name"`
	Type        PhotoType `json:"type"`
	Selected    bool      `json:"selected"`
	Position    *int      `json:"position,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	URL         string    `json:"url,omitempty"`
	DownloadURL string    `json:"download_url,omitempty"`
}

// ─── Voucher ─────────────────────────────────────────────────────────────────

type DiscountType string

const (
	DiscountPercent DiscountType = "percent"
	DiscountFixed   DiscountType = "fixed"
)

type Voucher struct {
	Code          string       `json:"code"`
	Description   string       `json:"description"`
	DiscountType  DiscountType `json:"discount_type"`
	DiscountValue int          `json:"discount_value"`
	MinPrice      int          `json:"min_price"`
	MaxUses       int          `json:"max_uses"`
	UsedCount     int          `json:"used_count"`
	IsActive      bool         `json:"is_active"`
	ExpiresAt     *time.Time   `json:"expires_at,omitempty"`
	CreatedAt     time.Time    `json:"created_at"`
}

// ─── Frame ───────────────────────────────────────────────────────────────────

type Frame struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	FilePath   string `json:"file_path"`
	ThumbURL   string `json:"thumb_url"`
	PhotoSlots int    `json:"photo_slots"`
}

// ─── Request / Response DTOs ─────────────────────────────────────────────────

type CreateSessionRequest struct {
	Category Category `json:"category"`
}

type CreatePaymentRequest struct {
	SessionID   string `json:"session_id"`
	VoucherCode string `json:"voucher_code,omitempty"`
}

type CreatePaymentResponse struct {
	Transaction Transaction `json:"transaction"`
	Session     Session     `json:"session"`
}

type PaymentStatusResponse struct {
	Status    TransactionStatus `json:"status"`
	SessionID string            `json:"session_id"`
	Paid      bool              `json:"paid"`
}

type ApplyVoucherRequest struct {
	SessionID   string `json:"session_id"`
	VoucherCode string `json:"voucher_code"`
}

type ApplyVoucherResponse struct {
	Valid          bool     `json:"valid"`
	Message        string   `json:"message"`
	DiscountAmount int      `json:"discount_amount"`
	FinalPrice     int      `json:"final_price"`
	Voucher        *Voucher `json:"voucher,omitempty"`
}

type SelectPhotosRequest struct {
	SessionID string   `json:"session_id"`
	PhotoIDs  []string `json:"photo_ids"`
}

type ComposeFrameRequest struct {
	SessionID   string   `json:"session_id"`
	FrameID     string   `json:"frame_id"`
	PhotoIDs    []string `json:"photo_ids"`
	StripFilter string   `json:"strip_filter,omitempty"`
}

// ─── Generic Response ─────────────────────────────────────────────────────────

type APIResponse struct {
	Success bool        `json:"success"`
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}

func SuccessResponse(data interface{}) APIResponse {
	return APIResponse{Success: true, Data: data}
}

func ErrorResponse(msg string) APIResponse {
	return APIResponse{Success: false, Error: msg}
}
