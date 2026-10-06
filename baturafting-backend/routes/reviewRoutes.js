const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const reviewController = require('../controllers/reviewController');

// Publik
router.get('/approved', reviewController.getApprovedReviews);
router.post('/', reviewController.createReview);

// Admin
router.get('/all', requireAdmin, reviewController.getAllReviews);
router.patch('/:id/status', requireAdmin, reviewController.updateReviewStatus);

module.exports = router;
