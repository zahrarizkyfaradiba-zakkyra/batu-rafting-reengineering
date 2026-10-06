# Daftar Perbaikan (dari hasil inspeksi kode)

| No | Masalah awal | Perbaikan |
|----|--------------|-----------|
| 1 | Form booking tidak mengirim `payment_type` dan `package_id` bisa null | Form memuat paket dari API (`?id=`), menambah pilihan metode pembayaran, validasi di klien dan server |
| 2 | Nama field slot tidak cocok (`time`, `remaining_capacity` vs `time_slot`, `remaining_pax`) | Frontend disesuaikan dengan respons API |
| 3 | CRUD paket di admin memanggil endpoint yang belum ada | Ditambah POST/PUT/DELETE /api/packages (hapus = nonaktifkan) |
| 4 | Admin dan semua /api/admin terbuka tanpa login | Login admin + token HMAC 8 jam, middleware `requireAdmin`, batas 5 kali gagal login per 15 menit |
| 5 | Kuota hardcode 50, tidak atomik, CANCELLED tidak mengembalikan kuota | Kapasitas dari tabel, compare-and-swap anti overbooking, rollback, pembatalan mengembalikan kuota |
| 6 | paket/index/artikel statis dan API hardcode localhost:5000 | Halaman paket dan artikel memuat dari API (fallback statis), `config.js` menentukan API_URL otomatis |
| 7 | Pemasukan menjumlah semua booking | Pemasukan hanya status PAID |
| 8 | Data pengguna masuk innerHTML mentah (risiko XSS) | Semua keluaran di-escape dengan `esc()` |
| 9 | `server.js`: route ulasan didaftarkan setelah listen, CORS terbuka | Diperbaiki, CORS dapat dibatasi lewat `CORS_ORIGINS`, handler error JSON |
| 10 | `.env` berisi kunci ikut di arsip | `.env` dihapus dari paket ini; gunakan `.env.example` dan `.gitignore` |
| 11 | Tidak ada fitur cek status, ulasan publik, detail artikel | Ditambah `cek-status.html`, form dan daftar ulasan di beranda, `artikel-detail.html` |
| 12 | style.css tanpa media query, meta description tidak ada | Ditambah aturan responsif dan meta description |

Langkah awal: jalankan `schema.sql` di Supabase, isi `.env`, lalu `npm install` dan `npm start`.
