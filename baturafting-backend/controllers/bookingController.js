const supabase = require('../config/db');
const { SLOTS, PAYMENT_TYPES } = require('../config/constants');
const { reserveSlot, releaseSlot } = require('../utils/slots');
const { todayWIB, isValidDate, normalizePhone, toPositiveInt, sendError } = require('../utils/helpers');

function makeBookingCode(date) {
  return `BR-${date.replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
}

// Validasi input pemesanan. Mengembalikan { error } atau { value }.
function validateBookingInput(body) {
  const customerName = String(body.customer_name || '').trim();
  const phone = normalizePhone(body.customer_phone);
  const totalPax = toPositiveInt(body.total_pax);

  if (!body.package_id || !customerName || !body.customer_phone || !body.booking_date || !body.time_slot || !body.total_pax || !body.payment_type) {
    return { error: 'Semua field wajib diisi!' };
  }
  if (customerName.length < 2 || customerName.length > 100) return { error: 'Nama harus 2 sampai 100 karakter.' };
  if (!phone) return { error: 'Nomor WhatsApp tidak valid. Contoh: 081234567890.' };
  if (!isValidDate(body.booking_date)) return { error: 'Format tanggal harus YYYY-MM-DD.' };
  if (body.booking_date < todayWIB()) return { error: 'Tanggal wisata tidak boleh sebelum hari ini.' };
  if (!SLOTS.includes(body.time_slot)) return { error: 'Slot waktu tidak valid.' };
  if (!totalPax || totalPax > 1000) return { error: 'Jumlah peserta harus bilangan bulat lebih dari 0.' };
  if (!PAYMENT_TYPES.includes(body.payment_type)) return { error: 'Metode pembayaran tidak valid.' };

  return {
    value: {
      packageId: body.package_id, customerName, phone,
      bookingDate: body.booking_date, timeSlot: body.time_slot, totalPax, paymentType: body.payment_type
    }
  };
}

// Menyimpan pemesanan; mengulang bila kode booking kebetulan kembar
async function insertBooking(fields) {
  let lastError = null;
  for (let i = 0; i < 4; i++) {
    const { data, error } = await supabase
      .from('bookings')
      .insert([{ booking_code: makeBookingCode(fields.booking_date), ...fields }])
      .select()
      .single();
    if (!error) return data;
    lastError = error;
  }
  throw lastError || new Error('Gagal menyimpan pemesanan.');
}

// POST /api/bookings
const createBooking = async (req, res) => {
  let reserved = null; // { date, slot, pax } untuk rollback bila penyimpanan gagal
  try {
    const parsed = validateBookingInput(req.body || {});
    if (parsed.error) return sendError(res, 400, parsed.error);
    const v = parsed.value;

    // Ambil paket (harga selalu dihitung di server)
    const { data: pkg, error: pkgErr } = await supabase
      .from('packages').select('*').eq('id', v.packageId).eq('is_active', true).maybeSingle();
    if (pkgErr) throw pkgErr;
    if (!pkg) return sendError(res, 404, 'Paket wisata tidak ditemukan.');
    if (v.totalPax < pkg.min_pax) {
      return sendError(res, 400, `Minimal pemesanan untuk paket ini adalah ${pkg.min_pax} orang.`);
    }

    // Pesan kuota slot (aman untuk pemesanan bersamaan)
    const slot = await reserveSlot(v.bookingDate, v.timeSlot, v.totalPax);
    if (!slot.ok) {
      const msg = slot.reason === 'closed'
        ? 'Slot waktu ini telah ditutup oleh admin.'
        : `Kuota tidak mencukupi. Sisa kuota: ${slot.remaining} orang.`;
      return sendError(res, 400, msg);
    }
    reserved = { date: v.bookingDate, slot: v.timeSlot, pax: v.totalPax };

    const booking = await insertBooking({
      package_id: pkg.id,
      package_name: pkg.name,
      customer_name: v.customerName,
      customer_phone: v.phone,
      booking_date: v.bookingDate,
      time_slot: v.timeSlot,
      total_pax: v.totalPax,
      total_price: Number(pkg.price_per_pax) * v.totalPax,
      payment_type: v.paymentType,
      payment_status: 'PENDING'
    });

    reserved = null;
    res.status(201).json({ success: true, message: 'Pemesanan berhasil dibuat!', data: booking });
  } catch (error) {
    if (reserved) {
      try { await releaseSlot(reserved.date, reserved.slot, reserved.pax); } catch (e) { /* abaikan */ }
    }
    sendError(res, 500, error.message);
  }
};

// GET /api/bookings/:code  (publik, hanya data minimum)
const getBookingStatus = async (req, res) => {
  try {
    const code = String(req.params.code || '').trim().toUpperCase();
    if (!/^BR-\d{8}-\d{4}$/.test(code)) return sendError(res, 400, 'Format kode booking tidak valid.');

    const { data, error } = await supabase
      .from('bookings')
      .select('booking_code, package_name, customer_name, booking_date, time_slot, total_pax, total_price, payment_type, payment_status, created_at')
      .eq('booking_code', code)
      .maybeSingle();
    if (error) throw error;
    if (!data) return sendError(res, 404, 'Pemesanan tidak ditemukan.');

    const name = data.customer_name || '';
    res.status(200).json({
      success: true,
      data: { ...data, customer_name: name.slice(0, 1) + '***' } // samarkan nama
    });
  } catch (error) {
    sendError(res, 500, error.message);
  }
};

module.exports = { createBooking, getBookingStatus };
