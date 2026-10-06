const express = require('express');
const router = express.Router();
const { checkSlotAvailability } = require('../controllers/slotController');

// URL: GET /api/slots?date=2026-10-01
router.get('/', checkSlotAvailability);

module.exports = router;
