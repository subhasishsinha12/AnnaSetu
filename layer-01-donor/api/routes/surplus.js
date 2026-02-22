/**
 * @file surplus.js
 * Surplus food detection and ONDC listing routes
 */
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const SurplusService = require('../../services/SurplusService');

/**
 * @swagger
 * /api/v1/surplus/detect:
 *   post:
 *     tags: [Surplus]
 *     summary: Detect near-expiry items from POS/ERP
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               donorId: { type: string }
 *               storeId: { type: string }
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     productId: { type: string }
 *                     productName: { type: string }
 *                     quantity: { type: number }
 *                     unit: { type: string }
 *                     expiryDate: { type: string, format: date }
 *                     batchNo: { type: string }
 *                     coldChainRequired: { type: boolean }
 *                     category: { type: string }
 */
router.post('/detect', async (req, res, next) => {
  try {
    const { donorId, storeId, items } = req.body;

    if (!donorId || !storeId || !items?.length) {
      return res.status(400).json({ error: 'donorId, storeId and items required' });
    }

    const result = await SurplusService.detectAndList({ donorId, storeId, items });
    res.status(201).json({
      success: true,
      lotId: result.lotId,
      itemsDetected: result.itemsDetected,
      ondc_broadcast: result.ondc_broadcast,
      hyperledger_txId: result.hyperledger_txId,
      message: 'Surplus items detected and broadcast to ONDC network'
    });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/v1/surplus/lots:
 *   get:
 *     tags: [Surplus]
 *     summary: List all active surplus lots
 */
router.get('/lots', async (req, res, next) => {
  try {
    const { donorId, status, page = 1, limit = 20 } = req.query;
    const lots = await SurplusService.getActiveLots({ donorId, status, page, limit });
    res.json({ success: true, ...lots });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/v1/surplus/lots/{lotId}:
 *   get:
 *     tags: [Surplus]
 *     summary: Get lot details with blockchain provenance
 */
router.get('/lots/:lotId', async (req, res, next) => {
  try {
    const lot = await SurplusService.getLotWithProvenance(req.params.lotId);
    if (!lot) return res.status(404).json({ error: 'Lot not found' });
    res.json({ success: true, lot });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/v1/surplus/webhook/iot:
 *   post:
 *     tags: [Surplus]
 *     summary: IoT sensor temperature telemetry for cold chain
 */
router.post('/webhook/iot', async (req, res, next) => {
  try {
    const { lotId, sensorId, temperature, humidity, timestamp } = req.body;
    const record = await SurplusService.recordTelemetry({ lotId, sensorId, temperature, humidity, timestamp });
    res.json({ success: true, telemetryId: record.id });
  } catch (err) { next(err); }
});

module.exports = router;
