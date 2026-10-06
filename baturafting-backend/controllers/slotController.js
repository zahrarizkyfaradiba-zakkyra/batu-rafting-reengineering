const supabase = require('../config/db');
const { SLOTS, DEFAULT_CAPACITY } = require('../config/constants');
const { todayWIB, isValidDate, sendError } = require('../utils/helpers');

// GET /api/slots?date=YYYY-MM-DD
const checkSlotAvailability = async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return sendError(res, 400, 'Parameter tanggal (date) wajib diisi!');
    if (!isValidDate(date)) return sendError(res, 400, 'Format tanggal harus YYYY-MM-DD.');
    if (date < todayWIB()) return sendError(res, 400, 'Tanggal tidak boleh sebelum hari ini.');

    const { data, error } = await supabase
      .from('slot_capacities')
      .select('*')
      .eq('slot_date', date);
    if (error) throw error;

    const slots = SLOTS.map((time) => {
      const row = (data || []).find((item) => item.time_slot === time);
      const max = row && row.max_capacity ? row.max_capacity : DEFAULT_CAPACITY;
      const booked = row ? row.booked_pax : 0;
      const isManualFull = row ? !!row.is_manual_full : false;
      const remaining = Math.max(max - booked, 0);
      const available = remaining > 0 && !isManualFull;

      return {
        time_slot: time,
        max_capacity: max,
        booked_pax: booked,
        remaining_pax: remaining,
        is_available: available,
        reason: available ? null : (isManualFull ? 'Ditutup admin' : 'Kuota penuh')
      };
    });

    res.status(200).json({ success: true, date, slots });
  } catch (error) {
    sendError(res, 500, error.message);
  }
};

module.exports = { checkSlotAvailability };
