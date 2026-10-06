const supabase = require('../config/db');
const { DEFAULT_CAPACITY } = require('../config/constants');

const MAX_RETRIES = 6;

// Memesan kuota slot secara aman terhadap pemesanan bersamaan.
// Memakai pola compare-and-swap: update hanya berhasil bila booked_pax belum berubah
// sejak dibaca; jika berubah, baca ulang dan coba lagi.
// Hasil: { ok: true } atau { ok: false, reason: 'closed' | 'full', remaining }
async function reserveSlot(date, slot, pax) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const { data: row, error } = await supabase
      .from('slot_capacities')
      .select('*')
      .eq('slot_date', date)
      .eq('time_slot', slot)
      .maybeSingle();
    if (error) throw error;

    if (!row) {
      if (pax > DEFAULT_CAPACITY) return { ok: false, reason: 'full', remaining: DEFAULT_CAPACITY };
      const { error: insErr } = await supabase.from('slot_capacities').insert([{
        slot_date: date,
        time_slot: slot,
        max_capacity: DEFAULT_CAPACITY,
        booked_pax: pax,
        is_manual_full: false
      }]);
      if (!insErr) return { ok: true };
      continue; // kemungkinan baris baru saja dibuat pemesan lain -> baca ulang
    }

    if (row.is_manual_full) return { ok: false, reason: 'closed', remaining: 0 };

    const max = row.max_capacity || DEFAULT_CAPACITY;
    const booked = row.booked_pax || 0;
    if (booked + pax > max) return { ok: false, reason: 'full', remaining: Math.max(max - booked, 0) };

    const { data: updated, error: updErr } = await supabase
      .from('slot_capacities')
      .update({ booked_pax: booked + pax })
      .eq('id', row.id)
      .eq('booked_pax', booked)
      .select();
    if (updErr) throw updErr;
    if (updated && updated.length === 1) return { ok: true };
    // jika tidak ada baris terubah, ada pemesan lain yang lebih dulu -> ulangi
  }
  throw new Error('Server sedang sibuk, silakan coba lagi.');
}

// Mengembalikan kuota (misalnya saat pemesanan dibatalkan atau gagal disimpan)
async function releaseSlot(date, slot, pax) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const { data: row, error } = await supabase
      .from('slot_capacities')
      .select('*')
      .eq('slot_date', date)
      .eq('time_slot', slot)
      .maybeSingle();
    if (error) throw error;
    if (!row) return;

    const booked = row.booked_pax || 0;
    const { data: updated, error: updErr } = await supabase
      .from('slot_capacities')
      .update({ booked_pax: Math.max(booked - pax, 0) })
      .eq('id', row.id)
      .eq('booked_pax', booked)
      .select();
    if (updErr) throw updErr;
    if (updated && updated.length === 1) return;
  }
}

module.exports = { reserveSlot, releaseSlot };
