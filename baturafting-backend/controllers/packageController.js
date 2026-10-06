const supabase = require('../config/db');
const { PACKAGE_CATEGORIES } = require('../config/constants');
const { sendError, toPositiveInt } = require('../utils/helpers');

// Validasi & pemetaan payload admin -> kolom tabel packages
function parsePackage(body) {
  const name = String(body.name || '').trim();
  const category = String(body.category || '').trim().toLowerCase();
  const price = Number(body.price);
  const priceStrikeRaw = body.price_strike;
  const priceStrike = priceStrikeRaw === '' || priceStrikeRaw === null || priceStrikeRaw === undefined
    ? null : Number(priceStrikeRaw);
  const minPax = toPositiveInt(body.min_pax);
  const features = String(body.features || '').trim();

  if (name.length < 3 || name.length > 100) return { error: 'Nama paket harus 3 sampai 100 karakter.' };
  if (!PACKAGE_CATEGORIES.includes(category)) return { error: 'Kategori paket tidak valid.' };
  if (!Number.isFinite(price) || price <= 0) return { error: 'Harga paket harus lebih dari 0.' };
  if (priceStrike !== null && (!Number.isFinite(priceStrike) || priceStrike < price)) {
    return { error: 'Harga normal tidak boleh lebih rendah dari harga promo.' };
  }
  if (!minPax) return { error: 'Minimal peserta harus bilangan bulat lebih dari 0.' };
  if (!features) return { error: 'Fasilitas wajib diisi.' };

  return {
    value: { name, category, price_per_pax: price, price_strike: priceStrike, min_pax: minPax, features }
  };
}

// GET /api/packages  (hanya paket aktif)
const getAllPackages = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('packages')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });
    if (error) throw error;
    res.status(200).json({ success: true, message: 'Berhasil mengambil data paket', data });
  } catch (error) {
    sendError(res, 500, error.message);
  }
};

// GET /api/packages/:id
const getPackageById = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('packages')
      .select('*')
      .eq('id', req.params.id)
      .eq('is_active', true)
      .maybeSingle();
    if (error) throw error;
    if (!data) return sendError(res, 404, 'Paket tidak ditemukan.');
    res.status(200).json({ success: true, data });
  } catch (error) {
    sendError(res, 500, error.message);
  }
};

// POST /api/packages (admin)
const createPackage = async (req, res) => {
  try {
    const parsed = parsePackage(req.body || {});
    if (parsed.error) return sendError(res, 400, parsed.error);

    const { data, error } = await supabase
      .from('packages')
      .insert([{ ...parsed.value, is_active: true }])
      .select()
      .single();
    if (error) throw error;
    res.status(201).json({ success: true, message: 'Paket berhasil ditambahkan.', data });
  } catch (error) {
    sendError(res, 500, error.message);
  }
};

// PUT /api/packages/:id (admin)
const updatePackage = async (req, res) => {
  try {
    const parsed = parsePackage(req.body || {});
    if (parsed.error) return sendError(res, 400, parsed.error);

    const { data, error } = await supabase
      .from('packages')
      .update(parsed.value)
      .eq('id', req.params.id)
      .select();
    if (error) throw error;
    if (!data || data.length === 0) return sendError(res, 404, 'Paket tidak ditemukan.');
    res.status(200).json({ success: true, message: 'Paket berhasil diperbarui.', data: data[0] });
  } catch (error) {
    sendError(res, 500, error.message);
  }
};

// DELETE /api/packages/:id (admin) -> nonaktifkan agar riwayat booking tetap utuh
const deletePackage = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('packages')
      .update({ is_active: false })
      .eq('id', req.params.id)
      .select();
    if (error) throw error;
    if (!data || data.length === 0) return sendError(res, 404, 'Paket tidak ditemukan.');
    res.status(200).json({ success: true, message: 'Paket berhasil dihapus.' });
  } catch (error) {
    sendError(res, 500, error.message);
  }
};

module.exports = { getAllPackages, getPackageById, createPackage, updatePackage, deletePackage };
