const express = require('express');
const router = express.Router();
const { requireAdmin, loginRateLimit } = require('../middleware/auth');
const { login, getDashboardStats, overrideSlotCapacity, updateBookingStatus } = require('../controllers/adminController');

router.post('/login', loginRateLimit, login);

router.get('/stats', requireAdmin, getDashboardStats);
router.post('/override-slot', requireAdmin, overrideSlotCapacity);
router.patch('/booking-status/:id', requireAdmin, updateBookingStatus);

module.exports = router;
