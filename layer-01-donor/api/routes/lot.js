const express = require('express');
const router = express.Router();

// POST /api/v1/lots — create lot
router.post('/', async (req, res) => {
  const lot = { lotId: `LOT-${Date.now()}`, ...req.body, status: 'AVAILABLE', createdAt: new Date().toISOString() };
  res.status(201).json({ success: true, lot });
});

// PATCH /api/v1/lots/:lotId/status
router.patch('/:lotId/status', async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['AVAILABLE', 'RESERVED', 'COLLECTED', 'DELIVERED', 'EXPIRED'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
  res.json({ success: true, lotId: req.params.lotId, status, updatedAt: new Date().toISOString() });
});

module.exports = router;
