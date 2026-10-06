const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const { getAllPackages, getPackageById, createPackage, updatePackage, deletePackage } = require('../controllers/packageController');

router.get('/', getAllPackages);
router.get('/:id', getPackageById);
router.post('/', requireAdmin, createPackage);
router.put('/:id', requireAdmin, updatePackage);
router.delete('/:id', requireAdmin, deletePackage);

module.exports = router;
