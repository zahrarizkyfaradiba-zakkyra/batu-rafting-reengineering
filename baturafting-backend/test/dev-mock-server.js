// Menjalankan backend dengan database memori (data contoh) tanpa Supabase.
// Berguna untuk demo/uji coba UI: npm run dev:mock  -> http://localhost:5000
process.env.ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
process.env.ADMIN_TOKEN_SECRET = process.env.ADMIN_TOKEN_SECRET || 'dev-secret-hanya-untuk-demo';

const { createMock } = require('./mockSupabase');
const mock = createMock();
const dbPath = require.resolve('../config/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: mock.client };

const seed = [
  ['Paket Batu Rafting', 'rafting', 215000, 200000, 4, 'Makan Siang Prasmanan, Rafting 12 KM (Grade 3), Safety Set, Guide & Rescue Team'],
  ['Paket Outbound & Rafting', 'rafting', 330000, 285000, 25, 'Instruktur Outbound, Safety Set Rafting, Makan Siang & 2x Snack'],
  ['Paket Training Outbound', 'outbound', 155000, 95000, 30, 'Instruktur & Fasilitator, Ice Breaking, Fun Games, Makan Siang'],
  ['Paket Paintball', 'paintball', 150000, 135000, 10, 'Marker Semi Otomatis, Peluru Gelatin 50 Butir, Goggle, Body Protector']
];
seed.forEach(([name, category, price_strike, price_per_pax, min_pax, features], i) => {
  mock.tables.packages.push({ id: `pkg-${i + 1}`, name, category, price_strike, price_per_pax, min_pax, features, is_active: true });
});
mock.tables.articles.push({ id: 'art-1', title: 'Tips Rafting Aman', slug: 'tips-rafting-aman', content: 'Gunakan pelampung dan helm.\n\nDengarkan arahan guide.', image_url: null, category: 'Tips', published_at: new Date().toISOString() });

require('../server');
const app = require('../server');
app.listen(process.env.PORT || 5000, () => console.log('Mode DEMO (database memori): http://localhost:' + (process.env.PORT || 5000) + '  | admin / admin123'));
