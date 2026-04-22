# Photobooth App (Go Backend + Static Frontend)

Panduan cepat agar setelah clone project bisa langsung jalan.

## 1) Prasyarat

- Go versi 1.25+ (sesuai go.mod)
- Salah satu static server untuk frontend:
  - Python 3, atau
  - Node.js (opsional)

## 2) Clone dan Masuk Project

- Clone repository ini
- Masuk ke folder project root

## 3) Setup Environment Backend

File rahasia tidak di-commit, jadi setiap developer wajib buat file env lokal.

- Copy file contoh:
  - dari backend/.env.example
  - menjadi backend/.env

Contoh PowerShell:

Copy-Item backend/.env.example backend/.env

Nilai default di env sudah cukup untuk menjalankan local development.

Catatan:
- MIDTRANS_SERVER_KEY dan MIDTRANS_CLIENT_KEY boleh dikosongkan jika belum tes pembayaran.
- ROBOT_ENABLED bisa tetap false jika tidak pakai integrasi robot.

## 4) Jalankan Backend

Masuk ke folder backend, lalu jalankan:

go mod tidy
go run main.go

Backend default berjalan di:
- http://localhost:8080

Cek health endpoint:
- http://localhost:8080/health

## 5) Jalankan Frontend (Static)

Frontend harus dijalankan lewat static server, jangan dibuka langsung sebagai file lokal.

Opsi A (Python):

cd frontend
python -m http.server 3000

Opsi B (Node):

cd frontend
npx serve -l 3000 .

Buka aplikasi:
- http://localhost:3000/index.html

## 6) Konfigurasi Penting

- Frontend memanggil backend default ke localhost:8080.
- CORS backend sudah mengizinkan origin localhost.
- Storage runtime akan dibuat otomatis saat backend start.

## 7) Troubleshooting Cepat

- Frontend tidak bisa akses API:
  - Pastikan backend sudah running di port 8080.
  - Pastikan frontend dijalankan dari static server (port 3000), bukan double-click file HTML.

- Error env tidak terbaca:
  - Pastikan file ada di backend/.env.

- Fitur payment tidak aktif:
  - Isi MIDTRANS_SERVER_KEY dan MIDTRANS_CLIENT_KEY di backend/.env.

## 8) Keamanan Repo

File berikut sudah di-ignore oleh .gitignore:
- .env dan backend/.env
- folder runtime storage
- log, cache, artefak build

Tetap jangan commit credential sensitif ke repository.
