const express = require('express');
const SurplusListing = require('../models/SurplusListing');
const InventoryItem = require('../models/InventoryItem');
const { runExpiryDetection } = require('../services/expiryDetectionService');
const BlockchainService = require('../services/blockchainService');
const logger = require('../utils/logger');
const router = express.Router();

// GET /api/v1/surplus - List surplus food available
router.get('/', async (req, res) => {
  try {
    const { status = 'listed', city, coldChain } = req.query;
    const query = { status };
    const listings = await SurplusListing.find(query)
      .populate('donorId', 'name address type fssaiLicenseNo')
      .populate('inventoryItems', 'productName category quantity unit expiryDate coldChainRequired')
      .sort({ createdAt: -1 });
    res.json({ success: true, count: listings.length, data: listings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/surplus/trigger-detection - Manual trigger (webhook from POS)
router.post('/trigger-detection', async (req, res) => {
  try {
    const { donorId } = req.body;
    const result = await runExpiryDetection(donorId);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/v1/surplus/:lotId/collect - Mark as collected by SFDO
router.patch('/:lotId/collect', async (req, res) => {
  try {
    const { sfdoId, sfdoName, fssaiNo, qualityApproved, notes } = req.body;
    const listing = await SurplusListing.findOne({ lotId: req.params.lotId });
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    
    const txId = await BlockchainService.recordCollection({
      lotId: listing.lotId,
      sfdoId, collectedAt: new Date().toISOString(),
      qualityApproved: qualityApproved !== false
    });

    await listing.updateOne({
      status: 'collected',
      'collection.actualPickupTime': new Date(),
      'collection.sfdo': { id: sfdoId, name: sfdoName, fssaiNo, acceptedAt: new Date() },
      'blockchain.hyperledgerTxId': txId
    });

    await InventoryItem.updateMany(
      { _id: { $in: listing.inventoryItems } },
      { status: 'collected', collectedAt: new Date() }
    );

    logger.info(`Surplus collected: ${req.params.lotId} by SFDO: ${sfdoName}`);
    res.json({ success: true, message: 'Collection recorded', blockchainTxId: txId });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/surplus/:lotId/history - Blockchain provenance
router.get('/:lotId/history', async (req, res) => {
  try {
    const history = await BlockchainService.querySurplusHistory(req.params.lotId);
    res.json({ success: true, lotId: req.params.lotId, history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
