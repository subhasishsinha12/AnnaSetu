const express = require('express');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const router = express.Router();
const ngoRegistry = new Map(); // In-memory NGO registry for dev; use Redis in prod

// POST /ondc/v1/search - Receive surplus food search from seller node
router.post('/search', async (req, res) => {
  const { context, message } = req.body;
  logger.info('ONDC search received: ' + context.transaction_id);

  // Broadcast to all registered NGO buyer apps
  const ngos = Array.from(ngoRegistry.values());
  const notified = [];

  for (const ngo of ngos) {
    try {
      const axios = require('axios');
      await axios.post(ngo.callbackUrl + '/on_search', {
        context: { ...context, action: 'on_search' },
        message
      }, { timeout: 5000 });
      notified.push(ngo.id);
    } catch (err) {
      logger.warn('NGO notify failed: ' + ngo.id + ' - ' + err.message);
    }
  }

  res.json({
    context: { ...context, action: 'ack' },
    message: { ack: { status: 'ACK' } },
    notifiedNgos: notified.length
  });
});

// POST /ondc/v1/confirm - NGO confirms pickup
router.post('/confirm', async (req, res) => {
  const { context, message } = req.body;
  logger.info('ONDC confirm: ' + context.transaction_id + ' | NGO: ' + context.bap_id);

  // Notify donor seller node
  try {
    const axios = require('axios');
    const donorApiUrl = process.env.DONOR_API_URL || 'http://donor-api:3001';
    await axios.patch(donorApiUrl + '/api/v1/surplus/' + message.order.id + '/match', {
      ngoId: context.bap_id,
      confirmedAt: new Date().toISOString()
    });
  } catch (err) {
    logger.error('Donor notify error: ' + err.message);
  }

  res.json({ context: { ...context, action: 'ack' }, message: { ack: { status: 'ACK' } } });
});

// POST /ondc/v1/track - Logistics tracking update
router.post('/track', async (req, res) => {
  const { context, message } = req.body;
  logger.info('ONDC track: ' + context.transaction_id + ' | Status: ' + message?.order?.fulfillment?.state?.descriptor?.code);
  res.json({ context: { ...context, action: 'ack' }, message: { ack: { status: 'ACK' } } });
});

// GET /ondc/v1/registry - List registered NGOs
router.get('/registry', (req, res) => {
  res.json({ ngos: Array.from(ngoRegistry.values()), count: ngoRegistry.size });
});

// POST /ondc/v1/registry - Register NGO
router.post('/registry', (req, res) => {
  const { id, name, callbackUrl, fssaiNo, city, coldChainCapacity } = req.body;
  ngoRegistry.set(id, { id, name, callbackUrl, fssaiNo, city, coldChainCapacity, registeredAt: new Date().toISOString() });
  logger.info('NGO registered: ' + name + ' (' + id + ')');
  res.status(201).json({ success: true, message: 'NGO registered on ONDC network', ngoId: id });
});

module.exports = router;
