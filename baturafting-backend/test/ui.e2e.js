// Tes UI end-to-end: menjalankan server demo (database memori) lalu menguji halaman dengan jsdom.
const { JSDOM, ResourceLoader } = require('jsdom');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 5055;
const BASE = 'http://localhost:' + PORT;
const server = spawn(process.execPath, [path.join(__dirname, 'dev-mock-server.js')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
process.on('exit', () => server.kill());
// Hanya muat sumber daya dari server lokal; iframe/skrip eksternal (mis. Google Maps) dilewati agar tes deterministik dan tanpa internet.
class LocalOnlyLoader extends ResourceLoader {
  fetch(url, options) { return url.startsWith(BASE) ? super.fetch(url, options) : null; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
let total = 0;
const check = (name, cond, extra) => { total++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  -> ' + (extra || ''))); if (!cond) failures++; };

async function open(path, opts = {}) {
  const dom = await JSDOM.fromURL(BASE + path, {
    runScripts: 'dangerously', resources: new LocalOnlyLoader(), pretendToBeVisual: true,
    beforeParse(window) {
      window.fetch = (u, o) => fetch(new URL(String(u).replace('http://localhost:5000', BASE), BASE), o);
      window.alert = (m) => { (window.__alerts = window.__alerts || []).push(m); };
      window.confirm = () => true;
      window.scrollTo = () => {}; window.HTMLElement.prototype.scrollIntoView = () => {};
      if (opts.token) window.sessionStorage.setItem('br_admin_token', opts.token);
    }
  });
  await sleep(opts.wait || 700);
  return dom;
}
const tomorrow = () => new Date(Date.now() + 36 * 3600 * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
const setVal = (w, id, v, ev = 'input') => { const e = w.document.getElementById(id); e.value = v; e.dispatchEvent(new w.Event(ev, { bubbles: true })); };

(async () => {
  await sleep(1500);
  // --- paket.html dinamis ---
  let d = await open('/paket.html');
  const cards = d.window.document.querySelectorAll('.pkg-card');
  check('paket.html: 4 kartu dari API', cards.length === 4, cards.length);
  check('paket.html: tautan pesan memakai ?id=', /booking\.html\?id=pkg-1/.test(d.window.document.body.innerHTML));
  check('paket.html: harga promo tampil', /Rp 200\.000/.test(d.window.document.body.textContent));

  // --- booking.html alur lengkap ---
  d = await open('/booking.html?id=pkg-1');
  let w = d.window;
  check('booking: paket terpilih dari ?id', w.document.getElementById('package-select').value === 'pkg-1');
  check('booking: hint min pax', /Minimal 4 peserta/.test(w.document.getElementById('package-hint').textContent));
  check('booking: pax otomatis = min pax', w.document.getElementById('total-pax').value === '4');
  setVal(w, 'booking-date', tomorrow(), 'change'); await sleep(700);
  const slotSel = w.document.getElementById('time-slot');
  check('booking: slot terisi & aktif', !slotSel.disabled && /08:00 WIB \(sisa kuota: 50/.test(slotSel.innerHTML), slotSel.innerHTML);
  slotSel.value = '08:00';
  setVal(w, 'customer-name', 'Budi <b>Santoso</b>'); setVal(w, 'customer-phone', '081234567890'); setVal(w, 'total-pax', '5');
  check('booking: estimasi total Rp 1.000.000', /1\.000\.000/.test(w.document.getElementById('display-total').textContent));
  w.document.getElementById('booking-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await sleep(900);
  const code = w.document.getElementById('success-code').textContent;
  check('booking: sukses & kode booking tampil', /^BR-\d{8}-\d{4}$/.test(code), code);
  check('booking: tautan WA memuat kode', decodeURIComponent(w.document.getElementById('wa-link').href).includes(code));
  check('booking: nama di-escape di tabel sukses', !/<b>/.test(w.document.getElementById('success-detail').innerHTML));

  // pemesanan di bawah minimal ditolak (klien)
  d = await open('/booking.html?package=Paket%20Batu%20Rafting'); w = d.window;
  check('booking: tautan lama ?package= tetap memilih paket', w.document.getElementById('package-select').value === 'pkg-1');

  // --- cek-status ---
  d = await open('/cek-status.html?code=' + code); w = d.window;
  const res = w.document.getElementById('result').textContent;
  check('cek-status: menampilkan status & paket', /Menunggu Konfirmasi/.test(res) && /Paket Batu Rafting/.test(res), res);
  check('cek-status: nama disamarkan', /B\*\*\*/.test(res) && !/Budi/.test(res), res);

  // --- artikel ---
  d = await open('/artikel.html'); w = d.window;
  check('artikel: daftar dari API', /Tips Rafting Aman/.test(w.document.getElementById('article-grid').textContent));
  d = await open('/artikel-detail.html?slug=tips-rafting-aman'); w = d.window;
  check('artikel-detail: isi tampil', /pelampung dan helm/.test(w.document.getElementById('article').textContent));

  // --- ulasan: kirim XSS, moderasi di admin ---
  d = await open('/index.html'); w = d.window;
  check('index: ulasan kosong tidak error', /Belum ada ulasan/.test(w.document.getElementById('review-list').textContent));
  setVal(w, 'rv-name', 'Hacker'); setVal(w, 'rv-comment', '<img src=x onerror=alert(1)> seru banget');
  w.document.getElementById('review-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await sleep(700);
  check('index: ulasan terkirim menunggu moderasi', /menunggu persetujuan/.test(w.document.getElementById('rv-msg').textContent));

  // --- admin: login salah, login benar ---
  d = await open('/admin.html'); w = d.window;
  check('admin: overlay login tampil tanpa token', w.document.getElementById('login-overlay').style.display !== 'none');
  setVal(w, 'login-username', 'admin'); setVal(w, 'login-password', 'salah');
  w.document.getElementById('login-box').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await sleep(600);
  check('admin: login salah ditolak', /salah/i.test(w.document.getElementById('login-error').textContent));
  setVal(w, 'login-password', 'admin123');
  w.document.getElementById('login-box').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await sleep(1000);
  check('admin: login benar menutup overlay', w.document.getElementById('login-overlay').style.display === 'none');
  const rows = w.document.getElementById('booking-list').textContent;
  check('admin: daftar booking tampil', rows.includes(code), rows.slice(0, 120));
  check('admin: total pemasukan 0 (belum ada PAID)', /Rp 0/.test(w.document.getElementById('total-revenue').textContent));

  // konfirmasi lunas
  w.changeStatus(0, 'PAID'); await sleep(900);
  check('admin: konfirmasi lunas -> pemasukan Rp 1.000.000', /1\.000\.000/.test(w.document.getElementById('total-revenue').textContent), w.document.getElementById('total-revenue').textContent);

  // paket: CRUD
  w.showSection('kelola-paket'); await sleep(600);
  check('admin: daftar paket tampil (bug lama diperbaiki)', w.document.getElementById('package-list').querySelectorAll('tr').length === 4);
  setVal(w, 'pkg-name', 'Paket Uji Baru'); w.document.getElementById('pkg-category').value = 'offroad';
  setVal(w, 'pkg-price', '300000'); setVal(w, 'pkg-price-strike', '350000'); setVal(w, 'pkg-min-pax', '2'); setVal(w, 'pkg-features', 'Jeep, Driver');
  w.document.getElementById('form-package').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await sleep(900);
  check('admin: tambah paket berhasil', w.document.getElementById('package-list').querySelectorAll('tr').length === 5, (w.__alerts || []).join('|'));
  w.editPackage(4);
  check('admin: edit mengisi form', w.document.getElementById('pkg-name').value === 'Paket Uji Baru' && w.document.getElementById('pkg-price').value === '300000');
  w.deletePackage(4); await sleep(900);
  check('admin: hapus paket', w.document.getElementById('package-list').querySelectorAll('tr').length === 4);

  // ulasan: XSS ter-escape, setujui
  w.showSection('moderasi-ulasan'); await sleep(700);
  const rv = w.document.getElementById('reviews-table-body');
  check('admin: komentar XSS tampil sebagai teks, bukan elemen', rv.querySelectorAll('img').length === 0 && /onerror/.test(rv.textContent));
  w.toggleApproval(0); await sleep(800);
  check('admin: ulasan disetujui', /Disetujui/.test(rv.textContent));

  // artikel CMS
  w.showSection('cms-artikel'); await sleep(600);
  setVal(w, 'article-title', 'Artikel Baru Dari Admin'); setVal(w, 'article-content', 'Isi artikel baru');
  w.document.getElementById('form-article').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await sleep(900);
  check('admin: artikel baru masuk daftar', /Artikel Baru Dari Admin/.test(w.document.getElementById('article-list').textContent));

  // batalkan booking -> kuota kembali
  w.showSection('dashboard'); await sleep(600);
  w.changeStatus(0, 'CANCELLED'); await sleep(900);
  const slots = await (await fetch(`${BASE}/api/slots?date=${tomorrow()}`)).json();
  check('admin: pembatalan mengembalikan kuota (sisa 50)', slots.slots[0].remaining_pax === 50, JSON.stringify(slots.slots[0]));

  // ulasan tampil di beranda (escape)
  d = await open('/index.html'); w = d.window;
  const rl = w.document.getElementById('review-list');
  check('index: ulasan disetujui tampil & aman', rl.querySelectorAll('img').length === 0 && /seru banget/.test(rl.textContent));

  console.log(`\nHasil UI: ${total - failures}/${total} pengecekan berhasil`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('E2E ERROR', e); process.exit(2); });
