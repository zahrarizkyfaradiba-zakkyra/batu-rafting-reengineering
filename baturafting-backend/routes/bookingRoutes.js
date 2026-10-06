const express = require('express');
const router = express.Router();
const { createBooking, getBookingStatus } = require('../controllers/bookingController');

router.post('/', createBooking);          // POST /api/bookings
router.get('/:code', getBookingStatus);   // GET  /api/bookings/BR-20261001-1234

module.exports = router;
