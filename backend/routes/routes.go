package routes

import (
	"net/http"
	"photobooth/handlers"
	"photobooth/middleware"
	"strings"

	"github.com/go-chi/chi/v5"
	chiMiddleware "github.com/go-chi/chi/v5/middleware"
)

func Setup(storagePath string) http.Handler {
	r := chi.NewRouter()

	// ─── Global Middleware ────────────────────────────────────────────────────
	r.Use(chiMiddleware.Logger)
	r.Use(chiMiddleware.Recoverer)
	r.Use(chiMiddleware.RealIP)
	r.Use(chiMiddleware.RequestID)
	r.Use(middleware.CORS)

	// ─── Health Check ─────────────────────────────────────────────────────────
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok","service":"photobooth"}`))
	})

	// ─── Static File Server ───────────────────────────────────────────────────
	storageFS := http.StripPrefix("/storage/", http.FileServer(http.Dir(storagePath)))
	r.Get("/storage/*", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, ".db") {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		storageFS.ServeHTTP(w, r)
	})

	// ── Gallery Public Route ───────────────────────────────────────────────
	r.Get("/gallery/{sessionID}", handlers.ServeGallery)

	// ─── API Routes ───────────────────────────────────────────────────────────
	r.Route("/api", func(r chi.Router) {

		// ── Categories ──────────────────────────────────────────────────────
		r.Get("/categories", handlers.GetCategories)

		// ── Session ─────────────────────────────────────────────────────────
		r.Route("/session", func(r chi.Router) {
			r.Post("/create", handlers.CreateSession)
			r.Get("/{sessionID}", handlers.GetSession)
			r.Patch("/{sessionID}/status", handlers.UpdateSessionStatus)
		})

		// ── Payment ─────────────────────────────────────────────────────────
		r.Route("/payment", func(r chi.Router) {
			r.Post("/create", handlers.CreatePayment)
			r.Get("/status/{orderID}", handlers.GetPaymentStatus)
			r.Post("/webhook", handlers.PaymentWebhook)
		})

		// ── Voucher ─────────────────────────────────────────────────────────
		r.Route("/voucher", func(r chi.Router) {
			r.Post("/apply", handlers.ApplyVoucher)
			r.Post("/remove", handlers.RemoveVoucher)
		})

		// ── Photo ───────────────────────────────────────────────────────────
		r.Route("/photo", func(r chi.Router) {
			r.Post("/upload", handlers.UploadPhoto)
			r.Post("/select", handlers.SelectPhotos)
			r.Post("/compose", handlers.ComposeFrame)
			r.Get("/session/{sessionID}", handlers.GetSessionPhotos)
			r.Get("/session/{sessionID}/framed", handlers.GetFramedPhotos)
			r.Get("/download/{photoID}", handlers.DownloadPhoto)
		})

		// ── Frames ──────────────────────────────────────────────────────────
		r.Get("/frames", handlers.GetFrames)

		// ── Robot / Canon Camera ───────────────────────────────────────────
		r.Route("/robot", func(r chi.Router) {
			// Kamera & live view
			r.Get("/status", handlers.GetCameraStatus)
			r.Post("/capture", handlers.RobotCapture)
			r.Get("/liveview", handlers.GetLiveView)
			r.Get("/liveview/stream", handlers.StreamLiveView)
			r.Get("/session/{sessionID}", handlers.GetRobotSessionPhotos)

			// Enable / disable robot via ngrok
			// POST /api/robot/enable  ← dipanggil otomatis setelah payment lunas
			// POST /api/robot/disable ← dipanggil dari frontend saat timer download habis
			r.Post("/enable", handlers.EnableRobot)
			r.Post("/disable", handlers.DisableRobot)

			// Emergency stop
			r.Post("/stop", handlers.StopRobot)

			// Trigger preset gerakan robot
			r.Post("/preset", handlers.TriggerPreset)

			// Cek konfigurasi robot saat ini
			r.Get("/config", handlers.GetRobotConfig)
		})

		// ── Gallery (legacy API path) ──────────────────────────────────────
		r.Get("/gallery/{sessionID}", handlers.GetGalleryData)

		// ── Admin ───────────────────────────────────────────────────────────
		r.Route("/admin", func(r chi.Router) {
			r.Get("/vouchers", handlers.ListVouchers)
			r.Post("/vouchers", handlers.CreateVoucher)
			r.Delete("/vouchers/{code}", handlers.DeleteVoucher)
		})
	})

	return r
}
