const InventoryItem = require('../models/InventoryItem');
const SurplusListing = require('../models/SurplusListing');
const OndcService = require('./ondcBroadcastService');
const BlockchainService = require('./blockchainService');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

/**
 * Core expiry detection engine
 * Runs on cron schedule and on-demand from POS webhook
 */
async function runExpiryDetection(donorId = null) {
  try {
    const now = new Date();
    const query = { status: 'available' };
    if (donorId) query.donorId = donorId;

    const items = await InventoryItem.find(query).populate('donorId');
    let flaggedCount = 0;

    for (const item of items) {
      const hoursToExpiry = Math.floor((item.expiryDate - now) / (1000 * 60 * 60));
      const threshold = item.category === 'perishable'
        ? parseInt(process.env.EXPIRY_THRESHOLD_HOURS_PERISHABLE || 48)
        : parseInt(process.env.EXPIRY_THRESHOLD_DAYS_PACKAGED || 7) * 24;

      if (hoursToExpiry <= threshold && hoursToExpiry > 0) {
        await flagItemForDonation(item, hoursToExpiry);
        flaggedCount++;
      } else if (hoursToExpiry <= 0) {
        await item.updateOne({ status: 'expired' });
      }
    }

    logger.info(`Expiry detection complete: ${flaggedCount} items flagged for donation`);
    return { flaggedCount, timestamp: now.toISOString() };
  } catch (error) {
    logger.error('Expiry detection error:', error);
    throw error;
  }
}

async function flagItemForDonation(item, hoursToExpiry) {
  const lotId = `LOT-${Date.now()}-${uuidv4().slice(0, 8).toUpperCase()}`;
  
  await item.updateOne({ 
    status: 'flagged', 
    flaggedAt: new Date(),
    lotId 
  });

  // Create surplus listing
  const listing = await SurplusListing.create({
    lotId,
    donorId: item.donorId._id,
    inventoryItems: [item._id],
    summary: {
      totalItems: 1,
      totalWeight_kg: item.unit === 'kg' ? item.quantity : null,
      categories: [item.category],
      coldChainRequired: item.coldChainRequired
    },
    status: 'pending'
  });

  logger.info(`Item flagged: ${item.productName} | Lot: ${lotId} | Expires in ${hoursToExpiry}hrs`);

  // Broadcast to ONDC asynchronously
  broadcastToOndc(listing, item).catch(err => 
    logger.error(`ONDC broadcast failed for ${lotId}:`, err)
  );

  return listing;
}

async function broadcastToOndc(listing, item) {
  try {
    const ondcResponse = await OndcService.broadcastSurplusFood({
      listingId: listing.lotId,
      donorInfo: {
        id: item.donorId._id.toString(),
        name: item.donorId.name,
        fssaiNo: item.donorId.fssaiLicenseNo,
        location: item.donorId.address?.coordinates
      },
      foodDetails: {
        name: item.productName,
        category: item.category,
        quantity: item.quantity,
        unit: item.unit,
        expiryDate: item.expiryDate,
        coldChainRequired: item.coldChainRequired,
        nutritionInfo: item.nutritionInfo
      }
    });

    await SurplusListing.findByIdAndUpdate(listing._id, {
      'ondcListing.listingId': ondcResponse.listingId,
      'ondcListing.status': 'broadcast',
      'ondcListing.broadcastAt': new Date(),
      status: 'listed'
    });

    await InventoryItem.findByIdAndUpdate(item._id, { 
      status: 'listed_ondc',
      ondcListingId: ondcResponse.listingId 
    });

    // Record on blockchain
    const txId = await BlockchainService.recordSurplusListing({
      lotId: listing.lotId,
      donorId: item.donorId._id.toString(),
      productName: item.productName,
      quantity: item.quantity,
      expiryDate: item.expiryDate.toISOString(),
      ondcListingId: ondcResponse.listingId
    });

    await SurplusListing.findByIdAndUpdate(listing._id, {
      'blockchain.hyperledgerTxId': txId,
      'blockchain.recordedAt': new Date()
    });

    logger.info(`ONDC broadcast + blockchain record: ${listing.lotId} | TxID: ${txId}`);
  } catch (error) {
    logger.error(`Broadcast pipeline error for ${listing.lotId}:`, error);
  }
}

module.exports = { runExpiryDetection, flagItemForDonation };
