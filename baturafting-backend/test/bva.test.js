// Pengujian Boundary Value Analysis (BVA) pada field masukan numerik aplikasi Batu Rafting.
// Jalankan: npm run test:bva   (opsional: BVA_REPORT=hasil.json untuk menyimpan hasil aktual)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'rahasia123';
process.env.ADMIN_TOKEN_SECRET = 'secret-untuk-tes';

const { createMock } = require('./mockSupabase');
const mock = createMock();
const dbPath = require.resolve('../config/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: mock.client };
const app = require('../server');

let server; let base; let token; let pkgId;
const report = [];
let dayCounter = 2; // setiap pemesanan memakai tanggal berbeda agar kuota tidak saling memengaruhi

const dateOffset = (n) => new Date(Date.now() + n * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
const freshDate = () => dateOffset(dayCounter++);
const api = async (method, url, body, auth) => {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, json: await res.json() };
};

// ---- pembangun permintaan dasar (nilai normal), lalu satu field diganti dengan nilai batas ----
const booking = (over = {}) => ({
  package_id: pkgId, customer_name: 'Budi Santoso', customer_phone: '081234567890',
  booking_date: freshDate(), time_slot: '08:00', total_pax: 4, payment_type: 'TRANSFER', ...over
});
const postBooking = (over) => api('POST', '/api/bookings', booking(over));
const postReview = (over) => api('POST', '/api/reviews', { name: 'Sari', rating: 5, comment: 'Pelayanan sangat bagus', ...over });
const postPackage = (over) => api('POST', '/api/packages',
  { name: 'Paket BVA', category: 'rafting', price: 100000, price_strike: '', min_pax: 4, features: 'Safety Set', ...over }, token);
const overrideSlot = (cap) => api('POST', '/api/admin/override-slot',
  { slot_date: freshDate(), time_slot: '10:00', custom_capacity: cap }, token);

// ---- definisi test case: [id, kategori, nilai input, fungsi, status diharapkan, potongan pesan diharapkan] ----
const text = (n) => 'a'.repeat(n);
const GROUPS = [
  { field: 'Jumlah peserta (total_pax) - batas bawah = minimal paket (4)', rows: [
    ['BVA-01', 'Di bawah min-1 (invalid)', '0', () => postBooking({ total_pax: 0 }), 400, 'wajib diisi'],
    ['BVA-02', 'Nilai negatif (invalid)', '-1', () => postBooking({ total_pax: -1 }), 400, 'bilangan bulat'],
    ['BVA-03', 'Tepat di bawah batas min-1 (invalid)', '3', () => postBooking({ total_pax: 3 }), 400, 'Minimal pemesanan'],
    ['BVA-04', 'Batas bawah min (valid)', '4', () => postBooking({ total_pax: 4 }), 201, null],
    ['BVA-05', 'Tepat di atas batas min+1 (valid)', '5', () => postBooking({ total_pax: 5 }), 201, null],
    ['BVA-06', 'Bukan bilangan bulat (invalid)', '4.5', () => postBooking({ total_pax: 4.5 }), 400, 'bilangan bulat'],
    ['BVA-07', 'Bukan angka (invalid)', 'abc', () => postBooking({ total_pax: 'abc' }), 400, 'bilangan bulat']
  ] },
  { field: 'Jumlah peserta (total_pax) - batas atas = kuota slot (50)', rows: [
    ['BVA-08', 'Tepat di bawah max-1 (valid)', '49', () => postBooking({ total_pax: 49 }), 201, null],
    ['BVA-09', 'Batas atas max (valid)', '50', () => postBooking({ total_pax: 50 }), 201, null],
    ['BVA-10', 'Tepat di atas max+1 (invalid)', '51', () => postBooking({ total_pax: 51 }), 400, 'Kuota tidak mencukupi'],
    ['BVA-11', 'Batas maksimum sistem (invalid, melebihi kuota)', '1000', () => postBooking({ total_pax: 1000 }), 400, 'Kuota tidak mencukupi'],
    ['BVA-12', 'Di atas batas maksimum sistem (invalid)', '1001', () => postBooking({ total_pax: 1001 }), 400, 'bilangan bulat']
  ] },
  { field: 'Rating ulasan (rating) - rentang 1 sampai 5', rows: [
    ['BVA-13', 'min-1 (invalid)', '0', () => postReview({ rating: 0 }), 400, 'Rating'],
    ['BVA-14', 'min (valid)', '1', () => postReview({ rating: 1 }), 201, null],
    ['BVA-15', 'min+1 (valid)', '2', () => postReview({ rating: 2 }), 201, null],
    ['BVA-16', 'Nominal (valid)', '3', () => postReview({ rating: 3 }), 201, null],
    ['BVA-17', 'max-1 (valid)', '4', () => postReview({ rating: 4 }), 201, null],
    ['BVA-18', 'max (valid)', '5', () => postReview({ rating: 5 }), 201, null],
    ['BVA-19', 'max+1 (invalid)', '6', () => postReview({ rating: 6 }), 400, 'Rating'],
    ['BVA-20', 'Bukan bilangan bulat (invalid)', '4.5', () => postReview({ rating: 4.5 }), 400, 'Rating']
  ] },
  { field: 'Harga paket per orang (price) - harus lebih dari 0', rows: [
    ['BVA-21', 'Negatif (invalid)', '-1', () => postPackage({ price: -1 }), 400, 'Harga paket'],
    ['BVA-22', 'Batas bawah 0 (invalid)', '0', () => postPackage({ price: 0 }), 400, 'Harga paket'],
    ['BVA-23', 'Tepat di atas batas 1 (valid)', '1', () => postPackage({ price: 1 }), 201, null],
    ['BVA-24', 'min+1 (valid)', '2', () => postPackage({ price: 2 }), 201, null],
    ['BVA-25', 'Bukan angka (invalid)', 'abc', () => postPackage({ price: 'abc' }), 400, 'Harga paket']
  ] },
  { field: 'Harga normal (price_strike) terhadap harga promo 100.000', rows: [
    ['BVA-26', 'Tepat di bawah harga promo (invalid)', '99.999', () => postPackage({ price_strike: 99999 }), 400, 'Harga normal'],
    ['BVA-27', 'Sama dengan harga promo (valid)', '100.000', () => postPackage({ price_strike: 100000 }), 201, null],
    ['BVA-28', 'Tepat di atas harga promo (valid)', '100.001', () => postPackage({ price_strike: 100001 }), 201, null],
    ['BVA-29', 'Dikosongkan, tanpa harga normal (valid)', '(kosong)', () => postPackage({ price_strike: '' }), 201, null]
  ] },
  { field: 'Minimal peserta paket (min_pax) - bilangan bulat >= 1', rows: [
    ['BVA-30', 'Negatif (invalid)', '-1', () => postPackage({ min_pax: -1 }), 400, 'Minimal peserta'],
    ['BVA-31', 'min-1 (invalid)', '0', () => postPackage({ min_pax: 0 }), 400, 'Minimal peserta'],
    ['BVA-32', 'min (valid)', '1', () => postPackage({ min_pax: 1 }), 201, null],
    ['BVA-33', 'min+1 (valid)', '2', () => postPackage({ min_pax: 2 }), 201, null],
    ['BVA-34', 'Bukan bilangan bulat (invalid)', '1.5', () => postPackage({ min_pax: 1.5 }), 400, 'Minimal peserta']
  ] },
  { field: 'Kapasitas slot kustom oleh admin (custom_capacity) - bilangan bulat >= 1', rows: [
    ['BVA-35', 'Negatif (invalid)', '-1', () => overrideSlot(-1), 400, 'Kapasitas'],
    ['BVA-36', 'min-1 (invalid)', '0', () => overrideSlot(0), 400, 'Kapasitas'],
    ['BVA-37', 'min (valid)', '1', () => overrideSlot(1), 200, null],
    ['BVA-38', 'min+1 (valid)', '2', () => overrideSlot(2), 200, null],
    ['BVA-39', 'Nilai bawaan sistem (valid)', '50', () => overrideSlot(50), 200, null],
    ['BVA-40', 'Nilai besar (valid, tanpa batas atas)', '1000', () => overrideSlot(1000), 200, null],
    ['BVA-41', 'Bukan angka (invalid)', 'abc', () => overrideSlot('abc'), 400, 'Kapasitas']
  ] },
  { field: 'Nomor WhatsApp (customer_phone) - 9 sampai 14 digit berawalan 08', rows: [
    ['BVA-42', '8 digit, min-1 (invalid)', '08123456', () => postBooking({ customer_phone: '08123456' }), 400, 'Nomor WhatsApp'],
    ['BVA-43', '9 digit, min (valid)', '081234567', () => postBooking({ customer_phone: '081234567' }), 201, null],
    ['BVA-44', '10 digit, min+1 (valid)', '0812345678', () => postBooking({ customer_phone: '0812345678' }), 201, null],
    ['BVA-45', '14 digit, max (valid)', '08123456789012', () => postBooking({ customer_phone: '08123456789012' }), 201, null],
    ['BVA-46', '15 digit, max+1 (invalid)', '081234567890123', () => postBooking({ customer_phone: '081234567890123' }), 400, 'Nomor WhatsApp'],
    ['BVA-47', 'Digit ke-3 bernilai 0 (invalid)', '0801234567', () => postBooking({ customer_phone: '0801234567' }), 400, 'Nomor WhatsApp']
  ] },
  { field: 'Tanggal wisata (booking_date) - tidak boleh sebelum hari ini', rows: [
    ['BVA-48', 'Kemarin, tepat di bawah batas (invalid)', 'hari ini - 1', () => postBooking({ booking_date: dateOffset(-1) }), 400, 'sebelum hari ini'],
    ['BVA-49', 'Hari ini, batas bawah (valid)', 'hari ini', () => postBooking({ booking_date: dateOffset(0), time_slot: '13:00' }), 201, null],
    ['BVA-50', 'Besok, tepat di atas batas (valid)', 'hari ini + 1', () => postBooking({ booking_date: dateOffset(1), time_slot: '13:00' }), 201, null]
  ] },
  { field: 'Panjang nama pemesan (customer_name) - 2 sampai 100 karakter', rows: [
    ['BVA-51', '0 karakter (invalid)', '(kosong)', () => postBooking({ customer_name: '' }), 400, 'wajib diisi'],
    ['BVA-52', '1 karakter, min-1 (invalid)', '1 karakter', () => postBooking({ customer_name: text(1) }), 400, 'Nama harus'],
    ['BVA-53', '2 karakter, min (valid)', '2 karakter', () => postBooking({ customer_name: text(2) }), 201, null],
    ['BVA-54', '3 karakter, min+1 (valid)', '3 karakter', () => postBooking({ customer_name: text(3) }), 201, null],
    ['BVA-55', '99 karakter, max-1 (valid)', '99 karakter', () => postBooking({ customer_name: text(99) }), 201, null],
    ['BVA-56', '100 karakter, max (valid)', '100 karakter', () => postBooking({ customer_name: text(100) }), 201, null],
    ['BVA-57', '101 karakter, max+1 (invalid)', '101 karakter', () => postBooking({ customer_name: text(101) }), 400, 'Nama harus']
  ] },
  { field: 'Panjang komentar ulasan (comment) - 5 sampai 500 karakter', rows: [
    ['BVA-58', '4 karakter, min-1 (invalid)', '4 karakter', () => postReview({ comment: text(4) }), 400, 'Komentar'],
    ['BVA-59', '5 karakter, min (valid)', '5 karakter', () => postReview({ comment: text(5) }), 201, null],
    ['BVA-60', '6 karakter, min+1 (valid)', '6 karakter', () => postReview({ comment: text(6) }), 201, null],
    ['BVA-61', '499 karakter, max-1 (valid)', '499 karakter', () => postReview({ comment: text(499) }), 201, null],
    ['BVA-62', '500 karakter, max (valid)', '500 karakter', () => postReview({ comment: text(500) }), 201, null],
    ['BVA-63', '501 karakter, max+1 (invalid)', '501 karakter', () => postReview({ comment: text(501) }), 400, 'Komentar']
  ] },
  { field: 'Tabel ringkas gaya slide - form Kelola Paket (a = price, b = price_strike, c = min_pax)', rows: [
    ['BVA-64', 'a: min-1 (invalid)', '0 | 150000 | 4', () => postPackage({ price: 0, price_strike: 150000, min_pax: 4 }), 400, 'Harga paket'],
    ['BVA-65', 'a: min (valid)', '1 | 150000 | 4', () => postPackage({ price: 1, price_strike: 150000, min_pax: 4 }), 201, null],
    ['BVA-66', 'a: min+1 (valid)', '2 | 150000 | 4', () => postPackage({ price: 2, price_strike: 150000, min_pax: 4 }), 201, null],
    ['BVA-67', 'Semua nominal (valid)', '100000 | 150000 | 4', () => postPackage({ price: 100000, price_strike: 150000, min_pax: 4 }), 201, null],
    ['BVA-68', 'b: min-1 (invalid)', '100000 | 99999 | 4', () => postPackage({ price: 100000, price_strike: 99999, min_pax: 4 }), 400, 'Harga normal'],
    ['BVA-69', 'b: min (valid)', '100000 | 100000 | 4', () => postPackage({ price: 100000, price_strike: 100000, min_pax: 4 }), 201, null],
    ['BVA-70', 'b: min+1 (valid)', '100000 | 100001 | 4', () => postPackage({ price: 100000, price_strike: 100001, min_pax: 4 }), 201, null],
    ['BVA-71', 'c: min-1 (invalid)', '100000 | 150000 | 0', () => postPackage({ price: 100000, price_strike: 150000, min_pax: 0 }), 400, 'Minimal peserta'],
    ['BVA-72', 'c: min (valid)', '100000 | 150000 | 1', () => postPackage({ price: 100000, price_strike: 150000, min_pax: 1 }), 201, null],
    ['BVA-73', 'c: min+1 (valid)', '100000 | 150000 | 2', () => postPackage({ price: 100000, price_strike: 150000, min_pax: 2 }), 201, null]
  ] }
];

before(async () => {
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  token = (await api('POST', '/api/admin/login', { username: 'admin', password: 'rahasia123' })).json.token;
  const pkg = await api('POST', '/api/packages',
    { name: 'Paket Batu Rafting', category: 'rafting', price: 200000, price_strike: 215000, min_pax: 4, features: 'Safety Set' }, token);
  pkgId = pkg.json.data.id;
});
after(() => {
  server.close();
  if (process.env.BVA_REPORT) fs.writeFileSync(process.env.BVA_REPORT, JSON.stringify(report, null, 2));
});

for (const group of GROUPS) {
  for (const [id, kategori, input, call, status, msg] of group.rows) {
    test(`${id} ${group.field.split(' (')[0]} = ${input} -> HTTP ${status}`, async () => {
      const r = await call();
      const actualMsg = r.json.message || '';
      const pass = r.status === status && (msg ? actualMsg.includes(msg) : r.json.success === true);
      report.push({ id, field: group.field, kategori, input, expectedStatus: status, expectedMsg: msg, actualStatus: r.status, actualMsg, pass });
      assert.equal(r.status, status, `${id}: status ${r.status}, pesan "${actualMsg}"`);
      if (msg) assert.ok(actualMsg.includes(msg), `${id}: pesan "${actualMsg}" tidak memuat "${msg}"`);
      else assert.equal(r.json.success, true);
    });
  }
}
