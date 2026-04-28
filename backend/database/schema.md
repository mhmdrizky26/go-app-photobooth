# Database Schema

Skema ini mengikuti tabel yang dipakai backend saat ini.

```mermaid
erDiagram
    SESSIONS ||--o{ TRANSACTIONS : has
    SESSIONS ||--o{ PHOTOS : has
    SESSIONS ||--o| VOUCHER_USAGE : applies
    VOUCHERS ||--o{ VOUCHER_USAGE : records

    SESSIONS {
        TEXT id PK
        TEXT category
        INTEGER duration_secs
        INTEGER price
        INTEGER discount
        INTEGER final_price
        TEXT status
        TEXT frame_id
        DATETIME created_at
        DATETIME expires_at
        DATETIME completed_at
    }

    TRANSACTIONS {
        TEXT id PK
        TEXT session_id FK
        TEXT midtrans_order_id
        INTEGER amount
        TEXT status
        TEXT qris_url
        TEXT qris_raw_string
        DATETIME paid_at
        DATETIME created_at
    }

    PHOTOS {
        TEXT id PK
        TEXT session_id FK
        TEXT file_path
        TEXT file_name
        TEXT type
        INTEGER selected
        INTEGER position
        DATETIME created_at
    }

    VOUCHERS {
        TEXT code PK
        TEXT description
        TEXT discount_type
        INTEGER discount_value
        INTEGER min_price
        INTEGER max_uses
        INTEGER used_count
        INTEGER is_active
        DATETIME expires_at
        DATETIME created_at
    }

    VOUCHER_USAGE {
        TEXT id PK
        TEXT voucher_code FK
        TEXT session_id FK
        DATETIME used_at
    }
```

## Ringkasan Tabel

### sessions
Menyimpan status utama sesi photobooth, harga awal, diskon, harga akhir, dan masa berlaku sesi.

### transactions
Menyimpan transaksi Midtrans atau transaksi gratis untuk satu sesi.

### photos
Menyimpan file foto mentah dan foto hasil komposisi per sesi.

### vouchers
Menyimpan master voucher, batas penggunaan, minimum pembelian, dan masa berlaku.

### voucher_usage
Mencatat voucher yang sedang dipakai oleh sebuah sesi.
