/**
 * SurplusService — Core logic for surplus food detection
 */

let uuidv4;
try {
  uuidv4 = require('uuid').v4;
} catch(e) {
  // fallback if uuid not installed yet
  uuidv4 = () => Math.random().toString(36).substring(2) + Date.now().toString(36);
}

const EXPIRY_THRESHOLDS = {
  perishable: 48,
  packaged: 7 * 24,
  frozen: 72,
  produce: 24
};

class SurplusService {
  static async detectAndList({ donorId, storeId, items }) {
    const lotId = `LOT-${uuidv4().substring(0, 8).toUpperCase()}`;
    const now = new Date();

    const surplusItems = items.filter(item => {
      const expiry = new Date(item.expiryDate);
      const hoursToExpiry = (expiry - now) / (1000 * 60 * 60);
      const threshold = EXPIRY_THRESHOLDS[item.category] || EXPIRY_THRESHOLDS.packaged;
      return hoursToExpiry <= threshold && hoursToExpiry > 0;
    });

    if (!surplusItems.length) {
      return { lotId, itemsDetected: 0, ondc_broadcast: false, hyperledger_txId: null };
    }

    const ondc_broadcast = await this.broadcastToONDC({ lotId, donorId, storeId, items: surplusItems });
    const hyperledger_txId = `TX-${uuidv4().replace(/-/g, '').substring(0, 24).toUpperCase()}`;

    return {
      lotId,
      itemsDetected: surplusItems.length,
      surplusItems,
      ondc_broadcast: ondc_broadcast.success,
      ondc_listingId: ondc_broadcast.listingId,
      hyperledger_txId
    };
  }

  static async broadcastToONDC({ lotId, donorId, storeId, items }) {
    console.log(`[ONDC] Broadcasting lot ${lotId} with ${items.length} items`);
    return {
      success: true,
      listingId: `ONDC-${uuidv4().substring(0, 8).toUpperCase()}`,
      broadcastAt: new Date().toISOString(),
      ngosNotified: Math.floor(Math.random() * 5) + 1
    };
  }

  static async getActiveLots({ donorId, status, page, limit }) {
    return { lots: [], total: 0, page: parseInt(page), limit: parseInt(limit) };
  }

  static async getLotWithProvenance(lotId) {
    return {
      lotId,
      status: 'AVAILABLE',
      provenance: [
        { event: 'LOT_CREATED', timestamp: new Date().toISOString(), txId: `TX-MOCK-001` }
      ]
    };
  }

  static async recordTelemetry({ lotId, sensorId, temperature, humidity, timestamp }) {
    const isBreach = temperature > 8;
    if (isBreach) console.warn(`[COLD CHAIN BREACH] Lot ${lotId}: ${temperature}°C`);
    return { id: uuidv4(), lotId, sensorId, temperature, humidity, breach: isBreach };
  }
}

module.exports = SurplusService;
