package services

import (
	"crypto/sha512"
	"encoding/hex"
	"fmt"
	"photobooth/config"
	"strings"

	"github.com/midtrans/midtrans-go"
	"github.com/midtrans/midtrans-go/coreapi"
)

var midtransClient coreapi.Client

type QRISResult struct {
	OrderID string
	QRISUrl string
	QRISRaw string
	Status  string
}

// InitMidtrans dipanggil sekali saat main.go start
func InitMidtrans() {
	env := midtrans.Sandbox
	if config.App.MidtransEnv == "production" {
		env = midtrans.Production
	}

	midtransClient.New(config.App.MidtransServerKey, env)
}

// CreateQRISPayment membuat transaksi QRIS baru via Midtrans Core API
func CreateQRISPayment(orderID string, amount int, sessionID string) (*QRISResult, error) {
	// Buat pointer untuk CustomField
	sid := sessionID // ← tampung dulu ke variable

	req := &coreapi.ChargeReq{
		PaymentType: coreapi.PaymentTypeQris,
		TransactionDetails: midtrans.TransactionDetails{
			OrderID:  orderID,
			GrossAmt: int64(amount),
		},
		Qris: &coreapi.QrisDetails{
			Acquirer: "gopay",
		},
		CustomField1: &sid, // ← pakai pointer &sid bukan langsung sessionID
	}

	resp, err := midtransClient.ChargeTransaction(req)
	if err != nil {
		return nil, fmt.Errorf("midtrans charge gagal: %w", err)
	}

	result := &QRISResult{
		OrderID: resp.OrderID,
		Status:  resp.TransactionStatus,
		QRISRaw: resp.QRString,
	}

	for _, action := range resp.Actions {
		if action.Name == "generate-qr-code" {
			result.QRISUrl = action.URL
			break
		}
	}

	return result, nil
}

// CheckPaymentStatus cek status transaksi ke Midtrans
// Return: "paid", "pending", "failed", "expired"
func CheckPaymentStatus(orderID string) (string, error) {
	resp, err := midtransClient.CheckTransaction(orderID)
	if err != nil {
		return "", fmt.Errorf("gagal cek transaksi: %w", err)
	}

	switch resp.TransactionStatus {
	case "capture", "settlement":
		return "paid", nil
	case "pending":
		return "pending", nil
	case "deny", "cancel":
		return "failed", nil
	case "expire":
		return "expired", nil
	default:
		return resp.TransactionStatus, nil
	}
}

// VerifyMidtransSignature memverifikasi signature webhook Midtrans.
func VerifyMidtransSignature(orderID, statusCode, grossAmount, signatureKey string) bool {
	if config.App == nil || config.App.MidtransServerKey == "" {
		return false
	}

	payload := orderID + statusCode + grossAmount + config.App.MidtransServerKey
	hash := sha512.Sum512([]byte(payload))
	expected := hex.EncodeToString(hash[:])

	return strings.EqualFold(expected, signatureKey)
}
