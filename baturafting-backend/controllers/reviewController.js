const supabase = require('../config/db');
const { sendError } = require('../utils/helpers');

// GET /api/reviews/approved (publik)
exports.getApprovedReviews = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('reviews')
      .select('id, name, rating, comment, created_at')
      .eq('is_approved', true)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.status(200).json({ success: true, data });
  } catch (error) {
    sendError(res, 500, error.message);
  }
};

// POST /api/reviews (publik) -> menunggu moderasi
exports.createReview = async (req, res) => {
  try {
    const name = String((req.body || {}).name || '').trim();
    const comment = String((req.body || {}).comment || '').trim();
    const rating = Number((req.body || {}).rating);

    if (name.length < 2 || name.length > 60) return sendError(res, 400, 'Nama harus 2 sampai 60 karakter.');
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return sendError(res, 400, 'Rating harus bilangan bulat 1 sampai 5.');
    if (comment.length < 5 || comment.length > 500) return sendError(res, 400, 'Komentar harus 5 sampai 500 karakter.');

    const { error } = await supabase
      .from('reviews')
      .insert([{ name, rating, comment, is_approved: false }]);
    if (error) throw error;
    res.status(201).json({ success: true, message: 'Ulasan berhasil dikirim dan menunggu persetujuan admin.' });
  } catch (error) {
    sendError(res, 500, error.message);
  }
};

// GET /api/reviews/all (admin)
exports.getAllReviews = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('reviews')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.status(200).json({ success: true, data });
  } catch (error) {
    sendError(res, 500, error.message);
  }
};

// PATCH /api/reviews/:id/status (admin)
exports.updateReviewStatus = async (req, res) => {
  try {
    const { is_approved } = req.body || {};
    if (typeof is_approved !== 'boolean') return sendError(res, 400, 'is_approved harus true atau false.');

    const { data, error } = await supabase
      .from('reviews')
      .update({ is_approved })
      .eq('id', req.params.id)
      .select();
    if (error) throw error;
    if (!data || data.length === 0) return sendError(res, 404, 'Ulasan tidak ditemukan.');
    res.status(200).json({ success: true, message: 'Status ulasan berhasil diperbarui.', data: data[0] });
  } catch (error) {
    sendError(res, 500, error.message);
  }
};
