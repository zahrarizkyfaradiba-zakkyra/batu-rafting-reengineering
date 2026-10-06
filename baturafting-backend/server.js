const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const packageRoutes = require('./routes/packageRoutes');
const slotRoutes = require('./routes/slotRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const articleRoutes = require('./routes/articleRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

app.disable('x-powered-by');

// CORS: isi CORS_ORIGINS (pisahkan dengan koma) di production. Kosong = izinkan semua (hanya untuk development).
const origins = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors(origins.length ? { origin: origins } : undefined));
app.use(express.json({ limit: '100kb' }));

// Tes route utama
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Server Backend Batu Rafting Berhasil Jalan!' });
});

// Register routes API
app.use('/api/packages', packageRoutes);
app.use('/api/slots', slotRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/articles', articleRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/admin', adminRoutes);

// Sajikan frontend dari server yang sama (opsional, memudahkan deployment)
const frontendDir = path.join(__dirname, '..', 'baturafting-frontend');
if (fs.existsSync(frontendDir)) app.use(express.static(frontendDir));

// 404 untuk route API yang tidak ada
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint tidak ditemukan.' });
});

// Penanganan error (mis. JSON rusak)
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Format JSON tidak valid.' });
  }
  console.error(err);
  res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.' });
});

if (require.main === module) {
  const missing = ['ADMIN_USERNAME', 'ADMIN_PASSWORD', 'ADMIN_TOKEN_SECRET'].filter((k) => !process.env[k]);
  if (missing.length) console.warn(`Peringatan: ${missing.join(', ')} belum diisi di .env, login admin tidak akan berfungsi.`);
  app.listen(PORT, () => console.log(`Server backend berjalan di http://localhost:${PORT}`));
}

module.exports = app;
