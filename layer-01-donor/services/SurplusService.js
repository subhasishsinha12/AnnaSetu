/**
 * SurplusService — Core business logic for surplus food detection
 * Integrates: Expiry check → ONDC broadcast → Hyperledger record
 */
const { v4: uuidv4 } = require('uuid');

const EXPIRY_THRESHOLDS = {
  perishable: 48,      // hours
  packaged: 7 * 24,    // hours
  frozen: 72,          // hours
  produce: 24          // hours
};

class SurplusService {
  /**
   * Detect near-expiry items and auto-list on ONDC
   */
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

    // Mock ONDC broadcast
    const ondc_broadcast = await this.broadcastToONDC({ lotId, donorId, storeId, items: surplusItems });

    // Mock Hyperledger record
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
    // In production: call ONDC Seller Node API with Beckn search/select flow
    console.log(`[ONDC] Broadcasting lot ${lotId} to surplus food domain`);
    return {
      success: true,
      listingId: `ONDC-${uuidv4().substring(0, 8).toUpperCase()}`,
      broadcastAt: new Date().toISOString(),
      ngosNotified: Math.floor(Math.random() * 5) + 1
    };
  }

  static async getActiveLots({ donorId, status, page, limit }) {
    // In production: query PostgreSQL with filters
    return { lots: [], total: 0, page: parseInt(page), limit: parseInt(limit) };
  }

  static async getLotWithProvenance(lotId) {
    // In production: join DB + Hyperledger ledger for provenance trail
    return {
      lotId,
      status: 'AVAILABLE',
      provenance: [
        { event: 'LOT_CREATED', timestamp: new Date().toISOString(), txId: `TX-MOCK-001` },
        { event: 'ONDC_BROADCAST', timestamp: new Date().toISOString(), txId: `TX-MOCK-002` }
      ]
    };
  }

  static async recordTelemetry({ lotId, sensorId, temperature, humidity, timestamp }) {
    // In production: write to Hyperledger + alert if cold chain breach
    const isBreach = temperature > 8; // >8°C for cold chain
    if (isBreach) console.warn(`[COLD CHAIN BREACH] Lot ${lotId}: ${temperature}°C`);
    return { id: uuidv4(), lotId, sensorId, temperature, humidity, breach: isBreach, recordedAt: timestamp || new Date().toISOString() };
  }
}

module.exports = SurplusService;
