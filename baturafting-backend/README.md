# Batu Rafting - Backend API

Express 5 + Supabase (PostgreSQL). Frontend statis ada di `../baturafting-frontend` dan ikut disajikan oleh server ini.

## Menjalankan
1. `npm install`
2. Salin `.env.example` menjadi `.env`, lalu isi `SUPABASE_URL`, `SUPABASE_KEY`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_TOKEN_SECRET`.
3. Jalankan isi `schema.sql` di Supabase (SQL Editor) agar tabel dan kolom sesuai.
4. `npm start` lalu buka http://localhost:5000 (admin: http://localhost:5000/admin.html).

## Pengujian
- `npm test` : tes API (database tiruan, tanpa internet) dan tes kualitas statis.
- `npm run test:ui` : tes UI end-to-end memakai jsdom terhadap server demo.
- `npm run dev:mock` : server demo dengan database memori (admin / admin123).

## Struktur
`routes/` (pemetaan URL) -> `controllers/` (logika) -> `utils/` dan `config/` (pembantu dan konstanta); `middleware/auth.js` untuk autentikasi admin.
