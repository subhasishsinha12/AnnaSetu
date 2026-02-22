/**
 * AnnaSetu Hyperledger Fabric Chaincode
 * surplus-food-cc — Node.js chaincode for Fabric 2.5
 *
 * Manages the full food lot lifecycle on the private ledger:
 * LISTED → RESERVED → IN_TRANSIT → DELIVERED
 *
 * In production: deployed to Hyperledger Fabric channel 'annasetu-channel'
 * For local dev/CI: logic is exported as plain class (no fabric-contract-api required)
 */
'use strict';

// Try to load fabric-contract-api; fall back to base class for CI/testing
let Contract;
try {
  Contract = require('fabric-contract-api').Contract;
} catch (e) {
  // Fabric SDK not installed — use stub base class for CI validation
  Contract = class {
    constructor(name) { this.name = name; }
  };
}

class SurplusFoodContract extends Contract {

  constructor() {
    super('SurplusFoodContract');
  }

  async initLedger(ctx) {
    console.info('AnnaSetu SurplusFood Chaincode initialized');
    return { success: true };
  }

  /**
   * CreateLot — supermarket creates a new surplus lot on the ledger
   */
  async CreateLot(ctx, lotId, donorId, storeId, itemsJSON, expiryDate, coldChainRequired) {
    if (!lotId || !donorId || !storeId) {
      throw new Error('lotId, donorId and storeId are required');
    }

    const lot = {
      lotId,
      donorId,
      storeId,
      items: JSON.parse(itemsJSON || '[]'),
      expiryDate,
      coldChainRequired: coldChainRequired === 'true',
      status: 'LISTED',
      ngoId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      events: [
        { event: 'LOT_CREATED', timestamp: new Date().toISOString(), actor: donorId }
      ]
    };

    if (ctx && ctx.stub) {
      await ctx.stub.putState(lotId, Buffer.from(JSON.stringify(lot)));
      ctx.stub.setEvent('LotCreated', Buffer.from(JSON.stringify({ lotId, donorId, storeId })));
    }

    return JSON.stringify({ success: true, lotId });
  }

  /**
   * ReserveLot — NGO reserves via ONDC confirm
   */
  async ReserveLot(ctx, lotId, ngoId, pickupTime) {
    if (!lotId || !ngoId) throw new Error('lotId and ngoId required');

    const updatedLot = {
      lotId, ngoId,
      status: 'RESERVED',
      pickupTime,
      updatedAt: new Date().toISOString()
    };

    if (ctx && ctx.stub) {
      const data = await ctx.stub.getState(lotId);
      if (!data || data.length === 0) throw new Error(`Lot ${lotId} does not exist`);
      const lot = { ...JSON.parse(data.toString()), ...updatedLot };
      lot.events.push({ event: 'LOT_RESERVED', timestamp: new Date().toISOString(), actor: ngoId });
      await ctx.stub.putState(lotId, Buffer.from(JSON.stringify(lot)));
      ctx.stub.setEvent('LotReserved', Buffer.from(JSON.stringify({ lotId, ngoId })));
    }

    return JSON.stringify({ success: true, lotId, status: 'RESERVED' });
  }

  /**
   * ConfirmPickup — NGO confirms collection with QR scan + IoT temperature
   */
  async ConfirmPickup(ctx, lotId, ngoId, temperature, quantityReceived) {
    const coldChainBreached = parseFloat(temperature) > 8;

    if (ctx && ctx.stub) {
      const data = await ctx.stub.getState(lotId);
      if (!data || data.length === 0) throw new Error(`Lot ${lotId} does not exist`);
      const lot = JSON.parse(data.toString());
      lot.status = 'IN_TRANSIT';
      lot.collectionData = { temperature: parseFloat(temperature), quantityReceived: parseFloat(quantityReceived), coldChainBreached };
      lot.updatedAt = new Date().toISOString();
      lot.events.push({ event: 'PICKUP_CONFIRMED', timestamp: new Date().toISOString(), actor: ngoId });
      await ctx.stub.putState(lotId, Buffer.from(JSON.stringify(lot)));
      if (coldChainBreached) {
        ctx.stub.setEvent('ColdChainBreach', Buffer.from(JSON.stringify({ lotId, temperature })));
      }
    }

    return JSON.stringify({ success: true, lotId, status: 'IN_TRANSIT', coldChainBreached });
  }

  /**
   * ConfirmDelivery — triggers 80G cert + beneficiary credit release
   */
  async ConfirmDelivery(ctx, lotId, sfdoId, beneficiaryCount, polygonTxHash) {
    if (!lotId || !sfdoId) throw new Error('lotId and sfdoId required');

    if (ctx && ctx.stub) {
      const data = await ctx.stub.getState(lotId);
      if (!data || data.length === 0) throw new Error(`Lot ${lotId} does not exist`);
      const lot = JSON.parse(data.toString());
      lot.status = 'DELIVERED';
      lot.deliveryData = { sfdoId, beneficiaryCount: parseInt(beneficiaryCount), polygonTxHash, deliveredAt: new Date().toISOString() };
      lot.updatedAt = new Date().toISOString();
      lot.events.push({ event: 'DELIVERY_CONFIRMED', timestamp: new Date().toISOString(), actor: sfdoId });
      await ctx.stub.putState(lotId, Buffer.from(JSON.stringify(lot)));
      ctx.stub.setEvent('DeliveryConfirmed', Buffer.from(JSON.stringify({ lotId, donorId: lot.donorId, beneficiaryCount, polygonTxHash })));
    }

    return JSON.stringify({ success: true, lotId, status: 'DELIVERED', beneficiaryCount });
  }

  /**
   * GetLot — query lot by ID
   */
  async GetLot(ctx, lotId) {
    if (ctx && ctx.stub) {
      const data = await ctx.stub.getState(lotId);
      if (!data || data.length === 0) throw new Error(`Lot ${lotId} does not exist`);
      return data.toString();
    }
    return JSON.stringify({ lotId, status: 'MOCK' });
  }
}

module.exports = SurplusFoodContract;
