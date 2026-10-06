// Supabase tiruan berbasis memori, hanya untuk pengujian otomatis (tanpa koneksi internet).
// Mendukung subset query builder yang dipakai backend.
const UNIQUE = {
  slot_capacities: [['slot_date', 'time_slot']],
  bookings: [['booking_code']],
  articles: [['slug']]
};

function createMock() {
  const tables = { packages: [], slot_capacities: [], bookings: [], articles: [], reviews: [] };
  let seq = 0;
  const tick = () => new Promise((r) => setImmediate(r)); // beri kesempatan interleaving antar request

  class Query {
    constructor(table) {
      this.table = table; this.op = 'select'; this.filters = []; this.payload = null;
      this.sel = false; this.mode = 'many'; this.orderBy = null;
    }
    select(cols) { this.sel = true; this.cols = cols && cols !== '*' ? cols.split(',').map((c) => c.trim()) : null; return this; }
    insert(rows) { this.op = 'insert'; this.payload = rows; return this; }
    update(obj) { this.op = 'update'; this.payload = obj; return this; }
    delete() { this.op = 'delete'; return this; }
    eq(c, v) { this.filters.push((r) => r[c] === v); return this; }
    neq(c, v) { this.filters.push((r) => r[c] !== v); return this; }
    order(c, o) { this.orderBy = { c, asc: !(o && o.ascending === false) }; return this; }
    single() { this.mode = 'single'; return this; }
    maybeSingle() { this.mode = 'maybe'; return this; }
    then(resolve, reject) { return this.run().then(resolve, reject); }

    async run() {
      await tick();
      const rows = tables[this.table];
      const match = (r) => this.filters.every((f) => f(r));
      let out = [];

      if (this.op === 'insert') {
        for (const item of this.payload) {
          for (const cols of UNIQUE[this.table] || []) {
            if (rows.some((r) => cols.every((c) => r[c] === item[c]))) {
              return { data: null, error: { code: '23505', message: 'duplicate key value' } };
            }
          }
          const row = { id: `id-${++seq}`, created_at: new Date().toISOString(), published_at: new Date().toISOString(), ...item };
          rows.push(row); out.push(row);
        }
      } else if (this.op === 'update') {
        rows.filter(match).forEach((r) => { Object.assign(r, this.payload); out.push(r); });
      } else if (this.op === 'delete') {
        for (let i = rows.length - 1; i >= 0; i--) if (match(rows[i])) out.push(rows.splice(i, 1)[0]);
      } else {
        out = rows.filter(match);
        if (this.orderBy) {
          const { c, asc } = this.orderBy;
          out = [...out].sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1));
        }
      }
      out = out.map((r) => {
        if (!this.cols) return { ...r };
        const o = {}; this.cols.forEach((c) => { o[c] = r[c]; }); return o; // hormati daftar kolom seperti Supabase asli
      });

      if (this.mode === 'single') {
        if (out.length !== 1) return { data: null, error: { code: 'PGRST116', message: 'Row not found' } };
        return { data: out[0], error: null };
      }
      if (this.mode === 'maybe') return { data: out[0] || null, error: null };
      return { data: out, error: null };
    }
  }
  return { tables, client: { from: (t) => new Query(t) } };
}

module.exports = { createMock };
