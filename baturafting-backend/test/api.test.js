const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'rahasia123';
process.env.ADMIN_TOKEN_SECRET = 'secret-untuk-tes';

// Ganti modul database dengan tiruan memori sebelum aplikasi dimuat
const { createMock } = require('./mockSupabase');
const mock = createMock();
const dbPath = require.resolve('../config/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: mock.client };

const app = require('../server');
let server; let base; let token; let pkgId;

const tomorrow = () => {
  const d = new Date(Date.now() + 36 * 3600 * 1000);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
};
const api = async (method, url, body, auth) => {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, json: await res.json() };
};
const validBooking = (over = {}) => ({
  package_id: pkgId, customer_name: 'Budi Santoso', customer_phone: '081234567890',
  booking_date: tomorrow(), time_slot: '08:00', total_pax: 5, payment_type: 'TRANSFER', ...over
});

before(async () => {
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('login: salah ditolak, endpoint admin tanpa token 401', async () => {
  assert.equal((await api('POST', '/api/admin/login', { username: 'admin', password: 'salah' })).status, 401);
  assert.equal((await api('GET', '/api/admin/stats')).status, 401);
  assert.equal((await api('GET', '/api/admin/stats', null, 'token.palsu')).status, 401);
  assert.equal((await api('POST', '/api/packages', {})).status, 401);
  assert.equal((await api('GET', '/api/reviews/all')).status, 401);
});

test('login benar menghasilkan token yang dapat dipakai', async () => {
  const r = await api('POST', '/api/admin/login', { username: 'admin', password: 'rahasia123' });
  assert.equal(r.status, 200);
  token = r.json.token;
  assert.equal((await api('GET', '/api/admin/stats', null, token)).status, 200);
});

test('CRUD paket oleh admin; hapus = nonaktifkan', async () => {
  const bad = await api('POST', '/api/packages', { name: 'x' }, token);
  assert.equal(bad.status, 400);
  const created = await api('POST', '/api/packages', {
    name: 'Paket Batu Rafting', category: 'rafting', price_strike: 215000, price: 200000, min_pax: 4, features: 'Makan Siang, Safety Set'
  }, token);
  assert.equal(created.status, 201);
  pkgId = created.json.data.id;

  const list = await api('GET', '/api/packages');
  assert.equal(list.json.data.length, 1);
  assert.equal(list.json.data[0].price_per_pax, 200000);

  const upd = await api('PUT', `/api/packages/${pkgId}`, {
    name: 'Paket Batu Rafting', category: 'rafting', price_strike: 215000, price: 190000, min_pax: 4, features: 'Makan Siang'
  }, token);
  assert.equal(upd.status, 200);
  assert.equal((await api('GET', `/api/packages/${pkgId}`)).json.data.price_per_pax, 190000);

  const second = await api('POST', '/api/packages', { name: 'Paket Sementara', category: 'offroad', price: 500000, min_pax: 1, features: 'Jeep' }, token);
  assert.equal((await api('DELETE', `/api/packages/${second.json.data.id}`, null, token)).status, 200);
  assert.equal((await api('GET', '/api/packages')).json.data.length, 1);
});

test('validasi pemesanan', async () => {
  assert.equal((await api('POST', '/api/bookings', { package_id: pkgId })).status, 400);
  assert.equal((await api('POST', '/api/bookings', validBooking({ customer_phone: '12345' }))).status, 400);
  assert.equal((await api('POST', '/api/bookings', validBooking({ booking_date: '2020-01-01' }))).status, 400);
  assert.equal((await api('POST', '/api/bookings', validBooking({ time_slot: '23:00' }))).status, 400);
  assert.equal((await api('POST', '/api/bookings', validBooking({ payment_type: 'BITCOIN' }))).status, 400);
  assert.equal((await api('POST', '/api/bookings', validBooking({ total_pax: 2.5 }))).status, 400);
  const lowPax = await api('POST', '/api/bookings', validBooking({ total_pax: 3 }));
  assert.equal(lowPax.status, 400);
  assert.match(lowPax.json.message, /Minimal pemesanan/);
  assert.equal((await api('POST', '/api/bookings', validBooking({ package_id: 'tidak-ada' }))).status, 404);
});

test('pemesanan berhasil: harga dihitung server, kode booking, kuota berkurang', async () => {
  const r = await api('POST', '/api/bookings', { ...validBooking({ total_pax: 5 }), total_price: 1 });
  assert.equal(r.status, 201);
  assert.match(r.json.data.booking_code, /^BR-\d{8}-\d{4}$/);
  assert.equal(r.json.data.total_price, 190000 * 5); // abaikan total_price dari klien
  assert.equal(r.json.data.payment_status, 'PENDING');

  const slots = await api('GET', `/api/slots?date=${tomorrow()}`);
  const s = slots.json.slots.find((x) => x.time_slot === '08:00');
  assert.equal(s.booked_pax, 5);
  assert.equal(s.remaining_pax, 45);
  assert.equal(s.is_available, true);
});

test('cek status memakai kode booking dan menyamarkan nama', async () => {
  const code = mock.tables.bookings[0].booking_code;
  const r = await api('GET', `/api/bookings/${code}`);
  assert.equal(r.status, 200);
  assert.equal(r.json.data.customer_name, 'B***');
  assert.equal(r.json.data.customer_phone, undefined);
  assert.equal((await api('GET', '/api/bookings/BR-20260101-0000')).status, 404);
  assert.equal((await api('GET', '/api/bookings/asal')).status, 400);
});

test('pemesanan bersamaan tidak boleh melebihi kuota (CAS)', async () => {
  const date = tomorrow();
  // slot 10:00: 12 permintaan x 10 orang bersamaan, kuota 50 -> maksimal 5 berhasil
  const results = await Promise.all(Array.from({ length: 12 }, () =>
    api('POST', '/api/bookings', validBooking({ time_slot: '10:00', total_pax: 10, booking_date: date }))));
  const ok = results.filter((r) => r.status === 201).length;
  assert.equal(ok, 5);
  const row = mock.tables.slot_capacities.find((s) => s.slot_date === date && s.time_slot === '10:00');
  assert.equal(row.booked_pax, 50);
  const full = results.find((r) => r.status === 400);
  assert.match(full.json.message, /Kuota tidak mencukupi/);
});

test('slot ditutup manual & kapasitas kustom oleh admin', async () => {
  const date = tomorrow();
  assert.equal((await api('POST', '/api/admin/override-slot', { slot_date: date, time_slot: '13:00', is_manual_full: true }, token)).status, 200);
  const closed = await api('POST', '/api/bookings', validBooking({ time_slot: '13:00' }));
  assert.equal(closed.status, 400);
  assert.match(closed.json.message, /ditutup/);

  await api('POST', '/api/admin/override-slot', { slot_date: date, time_slot: '13:00', is_manual_full: false, custom_capacity: 6 }, token);
  assert.equal((await api('POST', '/api/bookings', validBooking({ time_slot: '13:00', total_pax: 5 }))).status, 201);
  const over = await api('POST', '/api/bookings', validBooking({ time_slot: '13:00', total_pax: 5 }));
  assert.equal(over.status, 400); // sisa 1 dari kapasitas kustom 6
  assert.equal((await api('POST', '/api/admin/override-slot', { slot_date: date, time_slot: '99:00' }, token)).status, 400);
});

test('status pemesanan: PAID, CANCELLED mengembalikan kuota, CANCELLED final, pemasukan hanya PAID', async () => {
  const a = mock.tables.bookings.find((b) => b.time_slot === '08:00');
  const paid = await api('PATCH', `/api/admin/booking-status/${a.id}`, { payment_status: 'PAID' }, token);
  assert.equal(paid.status, 200);

  const b = mock.tables.bookings.find((x) => x.time_slot === '13:00');
  const before = mock.tables.slot_capacities.find((s) => s.time_slot === '13:00').booked_pax;
  assert.equal((await api('PATCH', `/api/admin/booking-status/${b.id}`, { payment_status: 'CANCELLED' }, token)).status, 200);
  const after = mock.tables.slot_capacities.find((s) => s.time_slot === '13:00').booked_pax;
  assert.equal(after, before - b.total_pax);

  // tidak bisa diubah lagi, kuota tidak dikembalikan dua kali
  assert.equal((await api('PATCH', `/api/admin/booking-status/${b.id}`, { payment_status: 'PAID' }, token)).status, 409);
  assert.equal((await api('PATCH', `/api/admin/booking-status/${b.id}`, { payment_status: 'CANCELLED' }, token)).status, 409);
  assert.equal(mock.tables.slot_capacities.find((s) => s.time_slot === '13:00').booked_pax, after);
  assert.equal((await api('PATCH', `/api/admin/booking-status/${a.id}`, { payment_status: 'HAPUS' }, token)).status, 400);
  assert.equal((await api('PATCH', '/api/admin/booking-status/tidak-ada', { payment_status: 'PAID' }, token)).status, 404);

  const stats = await api('GET', '/api/admin/stats', null, token);
  assert.equal(stats.json.stats.total_revenue, 190000 * 5); // hanya booking PAID
  assert.equal(stats.json.stats.by_status.CANCELLED, 1);
});

test('ulasan: validasi, moderasi, hanya yang disetujui tampil', async () => {
  assert.equal((await api('POST', '/api/reviews', { name: 'Sari', rating: 9, comment: 'Seru banget!' })).status, 400);
  assert.equal((await api('POST', '/api/reviews', { name: 'Sari', rating: 5, comment: 'ok' })).status, 400);
  assert.equal((await api('POST', '/api/reviews', { name: 'Sari', rating: 5, comment: 'Seru banget, pemandunya ramah!' })).status, 201);
  assert.equal((await api('GET', '/api/reviews/approved')).json.data.length, 0);

  const all = await api('GET', '/api/reviews/all', null, token);
  assert.equal(all.json.data.length, 1);
  const id = all.json.data[0].id;
  assert.equal((await api('PATCH', `/api/reviews/${id}/status`, { is_approved: 'ya' }, token)).status, 400);
  assert.equal((await api('PATCH', `/api/reviews/${id}/status`, { is_approved: true }, token)).status, 200);
  assert.equal((await api('GET', '/api/reviews/approved')).json.data.length, 1);
});

test('artikel: buat (slug unik), baca, hapus', async () => {
  assert.equal((await api('POST', '/api/articles', { title: 'Tips', content: 'isi' })).status, 401);
  assert.equal((await api('POST', '/api/articles', { title: '', content: 'isi' }, token)).status, 400);
  const a1 = await api('POST', '/api/articles', { title: 'Tips Rafting Aman!', content: 'Isi artikel' }, token);
  const a2 = await api('POST', '/api/articles', { title: 'Tips Rafting Aman!', content: 'Isi lain' }, token);
  assert.equal(a1.status, 201);
  assert.equal(a1.json.data.slug, 'tips-rafting-aman');
  assert.notEqual(a2.json.data.slug, a1.json.data.slug);

  assert.equal((await api('GET', '/api/articles/tips-rafting-aman')).status, 200);
  assert.equal((await api('GET', '/api/articles/tidak-ada')).status, 404);
  assert.equal((await api('DELETE', `/api/articles/${a1.json.data.id}`, null, token)).status, 200);
  assert.equal((await api('GET', '/api/articles')).json.data.length, 1);
});


// ================= Tambahan: keamanan, keandalan, performa =================
const crypto = require('crypto');
const { verifyToken, signToken } = require('../middleware/auth');

test('keamanan: token yang dimodifikasi atau kedaluwarsa ditolak', async () => {
  const [body, sig] = token.split('.');
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
  const forgedBody = Buffer.from(JSON.stringify({ ...payload, sub: 'superadmin' })).toString('base64url');
  assert.equal(verifyToken(`${forgedBody}.${sig}`), null);               // payload diubah, tanda tangan lama
  assert.equal(verifyToken(`${body}.${sig}x`), null);                   // tanda tangan rusak

  const expiredBody = Buffer.from(JSON.stringify({ sub: 'admin', exp: Math.floor(Date.now() / 1000) - 10 })).toString('base64url');
  const expiredSig = crypto.createHmac('sha256', process.env.ADMIN_TOKEN_SECRET).update(expiredBody).digest('base64url');
  assert.equal(verifyToken(`${expiredBody}.${expiredSig}`), null);       // kedaluwarsa
  assert.equal((await api('GET', '/api/admin/stats', null, `${expiredBody}.${expiredSig}`)).status, 401);

  const otherSecret = crypto.createHmac('sha256', 'secret-lain').update(body).digest('base64url');
  assert.equal(verifyToken(`${body}.${otherSecret}`), null);             // ditandatangani kunci lain
  assert.ok(verifyToken(signToken({ sub: 'admin' })));                   // token sah tetap diterima
});

test('keamanan: harga dari klien diabaikan dan payload injeksi diperlakukan sebagai data', async () => {
  const r = await api('POST', '/api/bookings', validBooking({ package_id: "1' OR '1'='1", booking_date: tomorrow() }));
  assert.equal(r.status, 404);
  const bad = await api('POST', '/api/bookings', validBooking({ customer_name: '<script>alert(1)</script>' }));
  assert.ok([201, 400].includes(bad.status)); // disimpan sebagai teks biasa; escape dilakukan saat ditampilkan
});

test('keandalan: JSON rusak -> 400 dan endpoint tidak dikenal -> 404 berformat JSON', async () => {
  const bad = await fetch(base + '/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{rusak' });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).success, false);
  const nf = await fetch(base + '/api/tidak-ada');
  assert.equal(nf.status, 404);
  assert.equal((await nf.json()).success, false);
});

test('keandalan: kuota dikembalikan bila penyimpanan pemesanan gagal (rollback)', async () => {
  const date = new Date(Date.now() + 60 * 3600 * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
  const originalFrom = mock.client.from;
  mock.client.from = (table) => {
    const q = originalFrom(table);
    if (table === 'bookings') q.insert = () => ({ select: () => ({ single: async () => ({ data: null, error: { message: 'DB error' } }) }) });
    return q;
  };
  const r = await api('POST', '/api/bookings', validBooking({ booking_date: date, total_pax: 8 }));
  mock.client.from = originalFrom;
  assert.equal(r.status, 500);
  const row = mock.tables.slot_capacities.find((x) => x.slot_date === date && x.time_slot === '08:00');
  assert.equal(row.booked_pax, 0); // kuota tidak boleh terpotong
});

test('performa: 100 permintaan bersamaan ke katalog dan slot selesai < 2 detik per permintaan', async () => {
  const started = Date.now();
  const timings = await Promise.all(Array.from({ length: 100 }, async (_, i) => {
    const t0 = Date.now();
    const r = i % 2 ? await api('GET', '/api/packages') : await api('GET', `/api/slots?date=${tomorrow()}`);
    assert.equal(r.status, 200);
    return Date.now() - t0;
  }));
  assert.ok(Math.max(...timings) < 2000, `respons terlama ${Math.max(...timings)} ms`);
  assert.ok(Date.now() - started < 5000);
});

test('rate limit login setelah 5 kali gagal', async () => {
  let last;
  for (let i = 0; i < 6; i++) last = await api('POST', '/api/admin/login', { username: 'admin', password: 'x' });
  assert.equal(last.status, 429);
});
