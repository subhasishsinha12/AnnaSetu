const express = require('express');
const { body, validationResult } = require('express-validator');
const InventoryItem = require('../models/InventoryItem');
const logger = require('../utils/logger');
const router = express.Router();

// POST /api/v1/inventory - Add inventory item (from POS/ERP webhook)
router.post('/', [
  body('donorId').notEmpty(),
  body('productName').notEmpty().trim(),
  body('category').isIn(['perishable','packaged','fresh_produce','dairy','bakery','prepared']),
  body('quantity').isNumeric().isFloat({ gt: 0 }),
  body('unit').isIn(['kg','litres','units','packets']),
  body('expiryDate').isISO8601()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const item = await InventoryItem.create({
      ...req.body,
      lotId: `INV-${Date.now()}-${Math.random().toString(36).slice(2,8).toUpperCase()}`
    });
    res.status(201).json({ success: true, data: item });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/inventory/bulk - Bulk upload from ERP CSV/JSON
router.post('/bulk', async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items array required' });
    }
    const toInsert = items.map(item => ({
      ...item,
      lotId: `INV-${Date.now()}-${Math.random().toString(36).slice(2,8).toUpperCase()}`
    }));
    const result = await InventoryItem.insertMany(toInsert, { ordered: false });
    res.status(201).json({ success: true, inserted: result.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/inventory/iot-update - IoT sensor data push
router.post('/iot-update', async (req, res) => {
  try {
    const { lotId, temperature, humidity, sensorId } = req.body;
    const item = await InventoryItem.findOneAndUpdate(
      { lotId },
      { $push: { iotSensorData: { timestamp: new Date(), temperature, humidity, sensorId } } },
      { new: true }
    );
    if (!item) return res.status(404).json({ error: 'Item not found' });
    
    // Alert if temperature breach
    if (item.storageTemp && temperature > item.storageTemp.max) {
      logger.warn(`COLD CHAIN BREACH: ${lotId} | Temp: ${temperature}°C | Max: ${item.storageTemp.max}°C`);
    }
    res.json({ success: true, updated: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
