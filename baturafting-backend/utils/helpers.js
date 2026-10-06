// Fungsi bantu kecil yang dipakai beberapa controller

// Tanggal hari ini (YYYY-MM-DD) menurut zona waktu WIB
function todayWIB() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
}

// Cek format YYYY-MM-DD dan apakah tanggalnya benar-benar ada
function isValidDate(str) {
  if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const d = new Date(`${str}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === str;
}

// Normalisasi nomor telepon Indonesia; kembalikan null jika tidak valid
function normalizePhone(raw) {
  const cleaned = String(raw || '').replace(/[\s.\-()]/g, '');
  if (!/^(\+62|62|0)8[1-9][0-9]{6,11}$/.test(cleaned)) return null;
  return cleaned.replace(/^\+?62/, '0');
}

// Bilangan bulat positif dari input (angka atau string angka)
function toPositiveInt(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function sendError(res, status, message) {
  return res.status(status).json({ success: false, message });
}

module.exports = { todayWIB, isValidDate, normalizePhone, toPositiveInt, sendError };
