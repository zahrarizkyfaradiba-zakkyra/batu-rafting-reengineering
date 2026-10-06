const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const { getAllArticles, getArticleBySlug, createArticle, deleteArticle } = require('../controllers/articleController');

router.get('/', getAllArticles);
router.get('/:slug', getArticleBySlug);
router.post('/', requireAdmin, createArticle);
router.delete('/:id', requireAdmin, deleteArticle);

module.exports = router;
