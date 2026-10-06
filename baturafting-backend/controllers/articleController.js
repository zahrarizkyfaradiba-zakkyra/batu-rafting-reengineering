const supabase = require('../config/db');
const { sendError } = require('../utils/helpers');
function slugify(title) {
  const base = title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-');
  return base || `artikel-${Date.now().toString(36)}`;
}

// GET /api/articles
const getAllArticles = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('articles')
      .select('*')
      .order('published_at', { ascending: false });
    if (error) throw error;
    res.status(200).json({ success: true, data });
  } catch (error) {
    sendError(res, 500, error.message);
  }
};

// GET /api/articles/:slug
const getArticleBySlug = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('articles')
      .select('*')
      .eq('slug', req.params.slug)
      .maybeSingle();
    if (error) throw error;
    if (!data) return sendError(res, 404, 'Artikel tidak ditemukan');
    res.status(200).json({ success: true, data });
  } catch (error) {
    sendError(res, 500, error.message);
  }
};

// POST /api/articles (admin)
const createArticle = async (req, res) => {
  try {
    const title = String((req.body || {}).title || '').trim();
    const content = String((req.body || {}).content || '').trim();
    const image_url = String((req.body || {}).image_url || '').trim() || null;
    const category = String((req.body || {}).category || '').trim() || null;

    if (!title || !content) return sendError(res, 400, 'Judul dan konten wajib diisi!');
    if (title.length > 150) return sendError(res, 400, 'Judul maksimal 150 karakter.');
    if (image_url && !/^https?:\/\//i.test(image_url)) return sendError(res, 400, 'URL gambar harus diawali http:// atau https://');

    // Slug harus unik
    let slug = slugify(title);
    const { data: dup, error: dupErr } = await supabase.from('articles').select('id').eq('slug', slug).maybeSingle();
    if (dupErr) throw dupErr;
    if (dup) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

    const { data, error } = await supabase
      .from('articles')
      .insert([{ title, slug, content, image_url, category }])
      .select()
      .single();
    if (error) throw error;

    res.status(201).json({ success: true, message: 'Artikel berhasil dibuat', data });
  } catch (error) {
    sendError(res, 500, error.message);
  }
};

// DELETE /api/articles/:id (admin)
const deleteArticle = async (req, res) => {
  try {
    const { data, error } = await supabase.from('articles').delete().eq('id', req.params.id).select();
    if (error) throw error;
    if (!data || data.length === 0) return sendError(res, 404, 'Artikel tidak ditemukan');
    res.status(200).json({ success: true, message: 'Artikel berhasil dihapus' });
  } catch (error) {
    sendError(res, 500, error.message);
  }
};

module.exports = { getAllArticles, getArticleBySlug, createArticle, deleteArticle };
