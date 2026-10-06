// Konfigurasi bersama untuk semua halaman frontend
(function () {
  var host = location.hostname;
  var isLocalDev = (host === 'localhost' || host === '127.0.0.1' || host === '');
  // Dibuka dari server backend (port 5000) atau domain produksi -> pakai path relatif.
  // Dibuka lewat Live Server/file lokal -> arahkan ke backend lokal.
  window.API_URL = (isLocalDev && location.port !== '5000') ? 'http://localhost:5000/api' : '/api';
})();

// Mencegah XSS: escape teks sebelum dimasukkan ke innerHTML
function esc(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function rupiah(n) {
  return 'Rp ' + Number(n || 0).toLocaleString('id-ID');
}

function todayWIB() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
}
