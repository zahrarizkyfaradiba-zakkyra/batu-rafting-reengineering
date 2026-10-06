// Pemeriksaan kualitas statis: maintainability, konfigurasi, keamanan rahasia, SEO/aksesibilitas, responsivitas.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FRONT = path.join(ROOT, '..', 'baturafting-frontend');
const read = (p) => fs.readFileSync(p, 'utf8');
const jsFiles = (dir) => fs.readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => path.join(dir, f));
const sourceFiles = () => ['controllers', 'routes', 'middleware', 'utils', 'config'].flatMap((d) => jsFiles(path.join(ROOT, d))).concat(path.join(ROOT, 'server.js'));
const htmlFiles = () => fs.readdirSync(FRONT).filter((f) => f.endsWith('.html'));

// ---------- Maintainability ----------
test('maintainability: arsitektur berlapis - routes tidak mengakses database langsung', () => {
  for (const f of jsFiles(path.join(ROOT, 'routes'))) {
    const src = read(f);
    assert.ok(!/config\/db|supabase/i.test(src), `${path.basename(f)} tidak boleh memakai database langsung`);
    assert.ok(/controllers\/|middleware\//.test(src), `${path.basename(f)} harus meneruskan ke controller`);
  }
  for (const f of jsFiles(path.join(ROOT, 'controllers'))) {
    assert.ok(!/require\(['"]express['"]\)/.test(read(f)), `${path.basename(f)} (controller) tidak boleh membuat router`);
  }
});

test('maintainability: konfigurasi bisnis terpusat di config/constants.js', () => {
  const constants = require('../config/constants');
  assert.deepEqual(constants.SLOTS, ['08:00', '10:00', '13:00']);
  assert.equal(constants.DEFAULT_CAPACITY, 50);
  for (const f of jsFiles(path.join(ROOT, 'controllers')).concat(jsFiles(path.join(ROOT, 'utils')))) {
    const src = read(f);
    assert.ok(!/['"]08:00['"]|['"]10:00['"]|['"]13:00['"]/.test(src), `${path.basename(f)} tidak boleh meng-hardcode jam slot`);
    assert.ok(!/=\s*50\b/.test(src.replace(/DEFAULT_CAPACITY/g, '')), `${path.basename(f)} tidak boleh meng-hardcode kapasitas 50`);
  }
});

test('maintainability: ukuran berkas dan fungsi terkendali (berkas <= 250 baris, fungsi <= 80 baris)', () => {
  for (const f of sourceFiles()) {
    const lines = read(f).split('\n');
    assert.ok(lines.length <= 250, `${path.basename(f)} ${lines.length} baris`);
  }
  // fungsi controller: hitung jarak antar deklarasi "const x = async (" / "exports.x = async ("
  for (const f of jsFiles(path.join(ROOT, 'controllers'))) {
    const lines = read(f).split('\n');
    const starts = lines.map((l, i) => (/^(const \w+ = (async )?\(|exports\.\w+ = async|async function|function )/.test(l) ? i : -1)).filter((i) => i >= 0);
    starts.forEach((s, i) => {
      const end = i + 1 < starts.length ? starts[i + 1] : lines.length;
      assert.ok(end - s <= 80, `${path.basename(f)} fungsi di baris ${s + 1} terlalu panjang (${end - s} baris)`);
    });
  }
});

test('maintainability: seluruh berkas JavaScript lolos pemeriksaan sintaks', () => {
  for (const f of sourceFiles()) execFileSync(process.execPath, ['--check', f]);
});

test('maintainability: dokumentasi dan template konfigurasi tersedia', () => {
  for (const f of ['.env.example', 'schema.sql', 'README.md', 'package.json']) {
    assert.ok(fs.existsSync(path.join(ROOT, f)), `${f} harus ada`);
  }
  const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));
  assert.ok(pkg.scripts.start && pkg.scripts.test, 'script start dan test harus ada');
});

// ---------- Security: manajemen rahasia ----------
test('keamanan: tidak ada rahasia yang ditulis langsung di kode sumber', () => {
  const patterns = [/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, /sb_secret_[A-Za-z0-9]+/, /service_role/i, /password\s*[:=]\s*['"][^'"]{3,}['"]/i];
  for (const f of sourceFiles().concat(htmlFiles().map((h) => path.join(FRONT, h)))) {
    const src = read(f);
    for (const re of patterns) {
      if (re.test(src)) assert.fail(`Kemungkinan rahasia di ${path.basename(f)} (pola ${re})`);
    }
  }
});

test('keamanan: .env tidak ikut repositori dan template tidak berisi nilai asli', () => {
  const ignore = read(path.join(ROOT, '.gitignore'));
  assert.ok(/^\.env$/m.test(ignore) && /^node_modules\/$/m.test(ignore));
  const example = read(path.join(ROOT, '.env.example'));
  assert.ok(!/eyJ[A-Za-z0-9_-]{20,}/.test(example));
});

test('keamanan: halaman frontend tidak memakai innerHTML dengan data mentah dari API (wajib esc())', () => {
  for (const f of ['admin.html', 'booking.html', 'cek-status.html', 'artikel.html', 'artikel-detail.html', 'index.html']) {
    const src = read(path.join(FRONT, f));
    assert.ok(/function esc\(|config\.js/.test(src), `${f} harus memuat helper esc()`);
  }
  const admin = read(path.join(FRONT, 'admin.html'));
  // setiap field teks pengguna di admin harus lewat esc()
  for (const field of ['b.customer_name', 'r.name', 'r.comment', 'p.name', 'a.title']) {
    const raw = new RegExp(`\\+\\s*${field.replace('.', '\\.')}\\s*\\+`);
    assert.ok(!raw.test(admin), `${field} di admin.html belum di-escape`);
  }
});

// ---------- Usability / Compatibility / SEO ----------
test('responsif: semua halaman punya viewport dan stylesheet memiliki media query', () => {
  for (const f of htmlFiles()) assert.ok(/name="viewport"/.test(read(path.join(FRONT, f))), `${f} tanpa viewport`);
  assert.ok((read(path.join(FRONT, 'style.css')).match(/@media/g) || []).length >= 2);
});

test('SEO & aksesibilitas: judul, meta deskripsi, bahasa, dan alt gambar', () => {
  for (const f of htmlFiles()) {
    const s = read(path.join(FRONT, f));
    assert.ok(/<title>[^<]+<\/title>/.test(s), `${f} tanpa <title>`);
    assert.ok(/name="description"\s+content="[^"]{20,}"/.test(s), `${f} tanpa meta description`);
    assert.ok(/<html[^>]*lang="id"/.test(s), `${f} tanpa lang="id"`);
    for (const img of s.match(/<img\b[^>]*>/g) || []) assert.ok(/\balt=/.test(img), `${f}: gambar tanpa alt -> ${img.slice(0, 60)}`);
  }
});

test('konsistensi data: halaman statis tidak lagi menulis harga/minimal pax berbeda untuk paket yang sama', () => {
  // Sumber kebenaran adalah basis data; kartu statis hanya cadangan. Pastikan paket.html memuat dari API.
  const paket = read(path.join(FRONT, 'paket.html'));
  assert.ok(/API_URL \+ '\/packages'/.test(paket), 'paket.html harus memuat paket dari API');
  const booking = read(path.join(FRONT, 'booking.html'));
  assert.ok(/API_URL \+ '\/packages'/.test(booking), 'booking.html harus memuat paket dari API');
  assert.ok(!/localhost:5000/.test(booking + paket), 'alamat API tidak boleh di-hardcode di halaman');
});
