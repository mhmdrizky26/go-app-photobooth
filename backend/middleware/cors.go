package middleware

import (
	"net/http"
	"net/url"
	"photobooth/config"
	"strconv"
	"strings"

	chiCors "github.com/go-chi/cors"
)

func CORS(next http.Handler) http.Handler {
	cors := chiCors.New(chiCors.Options{
		AllowOriginFunc: func(r *http.Request, origin string) bool {
			if origin == "" {
				return false
			}
			if origin == config.App.FrontendURL {
				return true
			}

			u, err := url.Parse(origin)
			if err != nil {
				return false
			}

			host := u.Hostname()
			if host == "localhost" || host == "127.0.0.1" {
				return true
			}
			if strings.HasPrefix(host, "192.168.") || strings.HasPrefix(host, "10.") {
				return true
			}

			parts := strings.Split(host, ".")
			if len(parts) == 4 && parts[0] == "172" {
				if second, err := strconv.Atoi(parts[1]); err == nil {
					return second >= 16 && second <= 31
				}
			}

			return false
		},
		AllowedMethods: []string{
			"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS",
		},
		AllowedHeaders: []string{
			"Accept",
			"Authorization",
			"Content-Type",
			"X-Session-ID",
		},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	})
	return cors.Handler(next)
}
