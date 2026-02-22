const express = require('express');
const router = express.Router();
const SurplusService = require('../../services/SurplusService');

// POST /api/v1/surplus/detect
router.post('/detect', async (req, res, next) => {
  try {
    const { donorId, storeId, items } = req.body;
    if (!donorId || !storeId || !items?.length) {
      return res.status(400).json({ error: 'donorId, storeId and items required' });
    }
    const result = await SurplusService.detectAndList({ donorId, storeId, items });
    res.status(201).json({ success: true, ...result, message: 'Surplus items processed' });
  } catch (err) { next(err); }
});

// GET /api/v1/surplus/lots
router.get('/lots', async (req, res, next) => {
  try {
    const { donorId, status, page = 1, limit = 20 } = req.query;
    const lots = await SurplusService.getActiveLots({ donorId, status, page, limit });
    res.json({ success: true, ...lots });
  } catch (err) { next(err); }
});

// GET /api/v1/surplus/lots/:lotId
router.get('/lots/:lotId', async (req, res, next) => {
  try {
    const lot = await SurplusService.getLotWithProvenance(req.params.lotId);
    res.json({ success: true, lot });
  } catch (err) { next(err); }
});

// POST /api/v1/surplus/webhook/iot
router.post('/webhook/iot', async (req, res, next) => {
  try {
    const { lotId, sensorId, temperature, humidity, timestamp } = req.body;
    const record = await SurplusService.recordTelemetry({ lotId, sensorId, temperature, humidity, timestamp });
    res.json({ success: true, telemetryId: record.id });
  } catch (err) { next(err); }
});

module.exports = router;
