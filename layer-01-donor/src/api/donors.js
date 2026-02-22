const express = require('express');
const { body, validationResult } = require('express-validator');
const Donor = require('../models/Donor');
const logger = require('../utils/logger');
const router = express.Router();

// GET /api/v1/donors - List all donors
router.get('/', async (req, res) => {
  try {
    const { type, city, isActive = true } = req.query;
    const query = { isActive };
    if (type) query.type = type;
    if (city) query['address.city'] = city;
    const donors = await Donor.find(query).select('-posSystem.apiKey -bankAccount.accountNo');
    res.json({ success: true, count: donors.length, data: donors });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/donors - Onboard new donor
router.post('/', [
  body('name').notEmpty().trim(),
  body('type').isIn(['supermarket', 'hotel', 'restaurant', 'cloud_kitchen', 'food_processor', 'caterer']),
  body('gstin').notEmpty().matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/),
  body('fssaiLicenseNo').notEmpty(),
  body('contact.email').isEmail(),
  body('contact.phone').isMobilePhone('en-IN')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const donor = await Donor.create(req.body);
    logger.info(`New donor onboarded: ${donor.name} (${donor._id})`);
    res.status(201).json({ success: true, data: donor });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Donor already registered' });
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/donors/:id/stats - Donor CSR impact stats
router.get('/:id/stats', async (req, res) => {
  try {
    const donor = await Donor.findById(req.params.id);
    if (!donor) return res.status(404).json({ error: 'Donor not found' });
    res.json({
      success: true,
      stats: {
        totalFoodDonated_kg: donor.csr.totalFoodDonated_kg,
        totalDonations: donor.csr.totalDonations,
        estimatedTaxBenefit: donor.csr.estimatedTaxBenefit,
        taxCertificates: donor.taxCertificates.length
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
