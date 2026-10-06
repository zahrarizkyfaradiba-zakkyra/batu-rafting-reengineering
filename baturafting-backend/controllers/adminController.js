const crypto = require('crypto');
const supabase = require('../config/db');
const { SLOTS, DEFAULT_CAPACITY } = require('../config/constants');
const { signToken } = require('../middleware/auth');
const { releaseSlot } = require('../utils/slots');
const { isValidDate, toPositiveInt, sendError } = require('../utils/helpers');

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();

// POST /api/admin/login
const login = (req, res) => {
  const { ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_TOKEN_SECRET } = process.env;
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD || !ADMIN_TOKEN_SECRET) {
    return sendError(res, 500, 'Kredensial admin belum dikonfigurasi di file .env.');
  }
  const { username, password } = req.body || {};
  const okUser = crypto.timingSafeEqual(sha(username || ''), sha(ADMIN_USERNAME));
  const okPass = crypto.timingSafeEqual(sha(password || ''), sha(ADMIN_PASSWORD));

  if (!(okUser && okPass)) {
    req.recordLoginFailure();
    return sendError(res, 401, 'Username atau password salah.');
  }
  req.clearLoginFailures();
  res.status(200).json({ success: true, token: signToken({ sub: 'admin' }), expires_in: 8 * 60 * 60 });
};

// GET /api/admin/stats
const getDashboardStats = async (req, res) => {
  try {
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;

    const list = bookings || [];
    const byStatus = { PENDING: 0, PAID: 0, CANCELLED: 0 };
    let totalRevenue = 0;
    const chartMap = {};

    list.forEach((b) => {
      byStatus[b.payment_status] = (byStatus[b.payment_status] || 0) + 1;
      if (b.payment_status === 'PAID') totalRevenue += Number(b.total_price) || 0;
      if (b.payment_status !== 'CANCELLED') {
        chartMap[b.booking_date] = (chartMap[b.booking_date] || 0) + (Number(b.total_pax) || 0);
      }
    });

    const labels = Object.keys(chartMap).sort();
    res.status(200).json({
      success: true,
      stats: { total_bookings: list.length, total_revenue: totalRevenue, by_status: byStatus },
      chart: { labels, data: labels.map((d) => chartMap[d]) },
      recent_bookings: list
    });
  } catch (error) {
    sendError(res, 500, error.message);
  }
};

// POST /api/admin/override-slot
const overrideSlotCapacity = async (req, res) => {
  try {
    const { slot_date, time_slot, is_manual_full, custom_capacity } = req.body || {};
    if (!isValidDate(slot_date)) return sendError(res, 400, 'Format tanggal harus YYYY-MM-DD.');
    if (!SLOTS.includes(time_slot)) return sendError(res, 400, 'Slot waktu tidak valid.');

    const capacity = custom_capacity === undefined || custom_capacity === '' ? undefined : toPositiveInt(custom_capacity);
    if (custom_capacity !== undefined && custom_capacity !== '' && !capacity) {
      return sendError(res, 400, 'Kapasitas harus bilangan bulat lebih dari 0.');
    }

    const { data: existing, error } = await supabase
      .from('slot_capacities')
      .select('*')
      .eq('slot_date', slot_date)
      .eq('time_slot', time_slot)
      .maybeSingle();
    if (error) throw error;

    if (existing) {
      const updateData = {};
      if (is_manual_full !== undefined) updateData.is_manual_full = !!is_manual_full;
      if (capacity !== undefined) updateData.max_capacity = capacity;
      const { error: updErr } = await supabase.from('slot_capacities').update(updateData).eq('id', existing.id);
      if (updErr) throw updErr;
    } else {
      const { error: insErr } = await supabase.from('slot_capacities').insert([{
        slot_date,
        time_slot,
        max_capacity: capacity || DEFAULT_CAPACITY,
        booked_pax: 0,
        is_manual_full: !!is_manual_full
      }]);
      if (insErr) throw insErr;
    }

    res.status(200).json({ success: true, message: 'Status kuota slot berhasil diperbarui!' });
  } catch (error) {
    sendError(res, 500, error.message);
  }
};

// PATCH /api/admin/booking-status/:id   body: { payment_status: 'PAID' | 'CANCELLED' }
const updateBookingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_status } = req.body || {};
    if (!['PAID', 'CANCELLED'].includes(payment_status)) {
      return sendError(res, 400, "Status harus 'PAID' atau 'CANCELLED'.");
    }

    const { data: current, error: findErr } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!current) return sendError(res, 404, 'Pemesanan tidak ditemukan.');
    if (current.payment_status === 'CANCELLED') {
      return sendError(res, 409, 'Pemesanan yang sudah dibatalkan tidak dapat diubah lagi.');
    }
    if (current.payment_status === payment_status) {
      return res.status(200).json({ success: true, message: `Status sudah ${payment_status}.`, data: current });
    }

    // Update hanya jika belum CANCELLED (mencegah pengembalian kuota ganda)
    const { data: updated, error } = await supabase
      .from('bookings')
      .update({ payment_status })
      .eq('id', id)
      .neq('payment_status', 'CANCELLED')
      .select();
    if (error) throw error;
    if (!updated || updated.length === 0) {
      return sendError(res, 409, 'Pemesanan yang sudah dibatalkan tidak dapat diubah lagi.');
    }

    if (payment_status === 'CANCELLED') {
      await releaseSlot(current.booking_date, current.time_slot, Number(current.total_pax));
    }

    res.status(200).json({
      success: true,
      message: `Status pemesanan berhasil diperbarui menjadi ${payment_status}`,
      data: updated[0]
    });
  } catch (error) {
    sendError(res, 500, error.message);
  }
};

module.exports = { login, getDashboardStats, overrideSlotCapacity, updateBookingStatus };
