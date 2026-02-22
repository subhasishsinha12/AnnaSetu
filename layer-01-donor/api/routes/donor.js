const express = require('express');
const router = express.Router();

// GET /api/v1/donors — list registered donors
router.get('/', async (req, res) => {
  res.json({ success: true, donors: [], message: 'Donor registry endpoint' });
});

// POST /api/v1/donors/register
router.post('/register', async (req, res) => {
  const { name, gstin, address, contactEmail, storeCount } = req.body;
  if (!name || !gstin) return res.status(400).json({ error: 'name and gstin required' });
  const donor = {
    donorId: `DONOR-${Date.now()}`,
    name, gstin, address, contactEmail, storeCount,
    status: 'PENDING_VERIFICATION',
    registeredAt: new Date().toISOString()
  };
  res.status(201).json({ success: true, donor });
});

// GET /api/v1/donors/:donorId/impact
router.get('/:donorId/impact', async (req, res) => {
  res.json({
    success: true,
    donorId: req.params.donorId,
    impact: {
      totalLotsListed: 0,
      totalKgDonated: 0,
      totalBeneficiariesServed: 0,
      taxCertificatesIssued: 0,
      estimatedTaxSavingINR: 0
    }
  });
});

module.exports = router;
