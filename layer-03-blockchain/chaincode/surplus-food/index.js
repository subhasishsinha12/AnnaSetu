/**
 * AnnaSetu Hyperledger Fabric Chaincode
 * Chaincode: surplus-food-cc (Node.js)
 * Channel: annasetu-channel
 *
 * Smart contract manages the full food lot lifecycle on private ledger:
 * CREATE → LISTED → RESERVED → IN_TRANSIT → DELIVERED → REDEEMED
 */
'use strict';
const { Contract } = require('fabric-contract-api');

class SurplusFoodContract extends Contract {

  async initLedger(ctx) {
    console.info('AnnaSetu SurplusFood Chaincode initialized');
    return { success: true };
  }

  /**
   * CreateLot — called when supermarket detects near-expiry items
   */
  async CreateLot(ctx, lotId, donorId, storeId, itemsJSON, expiryDate, coldChainRequired) {
    const exists = await this._lotExists(ctx, lotId);
    if (exists) throw new Error(`Lot ${lotId} already exists`);

    const lot = {
      lotId,
      donorId,
      storeId,
      items: JSON.parse(itemsJSON),
      expiryDate,
      coldChainRequired: coldChainRequired === 'true',
      status: 'LISTED',
      ngoId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      events: [{ event: 'LOT_CREATED', timestamp: new Date().toISOString(), actor: donorId }]
    };

    await ctx.stub.putState(lotId, Buffer.from(JSON.stringify(lot)));
    ctx.stub.setEvent('LotCreated', Buffer.from(JSON.stringify({ lotId, donorId, storeId })));
    return JSON.stringify({ success: true, lotId });
  }

  /**
   * ReserveLot — NGO reserves a lot via ONDC confirm
   */
  async ReserveLot(ctx, lotId, ngoId, pickupTime) {
    const lot = await this._getLot(ctx, lotId);
    if (lot.status !== 'LISTED') throw new Error(`Lot ${lotId} cannot be reserved (status: ${lot.status})`);

    lot.ngoId = ngoId;
    lot.status = 'RESERVED';
    lot.pickupTime = pickupTime;
    lot.updatedAt = new Date().toISOString();
    lot.events.push({ event: 'LOT_RESERVED', timestamp: new Date().toISOString(), actor: ngoId });

    await ctx.stub.putState(lotId, Buffer.from(JSON.stringify(lot)));
    ctx.stub.setEvent('LotReserved', Buffer.from(JSON.stringify({ lotId, ngoId })));
    return JSON.stringify({ success: true, lotId, status: 'RESERVED' });
  }

  /**
   * ConfirmPickup — NGO confirms collection with QR scan
   */
  async ConfirmPickup(ctx, lotId, ngoId, temperature, quantityReceived) {
    const lot = await this._getLot(ctx, lotId);
    if (lot.status !== 'RESERVED') throw new Error(`Lot ${lotId} not in RESERVED state`);

    const coldChainBreached = lot.coldChainRequired && parseFloat(temperature) > 8;

    lot.status = 'IN_TRANSIT';
    lot.collectionData = { temperature: parseFloat(temperature), quantityReceived: parseFloat(quantityReceived), coldChainBreached };
    lot.updatedAt = new Date().toISOString();
    lot.events.push({ event: 'PICKUP_CONFIRMED', timestamp: new Date().toISOString(), actor: ngoId, data: lot.collectionData });

    await ctx.stub.putState(lotId, Buffer.from(JSON.stringify(lot)));

    if (coldChainBreached) {
      ctx.stub.setEvent('ColdChainBreach', Buffer.from(JSON.stringify({ lotId, temperature })));
    }
    ctx.stub.setEvent('PickupConfirmed', Buffer.from(JSON.stringify({ lotId, ngoId })));
    return JSON.stringify({ success: true, lotId, coldChainBreached });
  }

  /**
   * ConfirmDelivery — SFDO confirms food delivered to distribution point
   * Triggers: 80G certificate issuance + beneficiary credit release
   */
  async ConfirmDelivery(ctx, lotId, sfdoId, beneficiaryCount, polygonTxHash) {
    const lot = await this._getLot(ctx, lotId);
    if (lot.status !== 'IN_TRANSIT') throw new Error(`Lot ${lotId} not in IN_TRANSIT state`);

    lot.status = 'DELIVERED';
    lot.deliveryData = {
      sfdoId,
      beneficiaryCount: parseInt(beneficiaryCount),
      polygonTxHash,
      deliveredAt: new Date().toISOString()
    };
    lot.updatedAt = new Date().toISOString();
    lot.events.push({ event: 'DELIVERY_CONFIRMED', timestamp: new Date().toISOString(), actor: sfdoId });

    await ctx.stub.putState(lotId, Buffer.from(JSON.stringify(lot)));
    ctx.stub.setEvent('DeliveryConfirmed', Buffer.from(JSON.stringify({
      lotId,
      donorId: lot.donorId,
      beneficiaryCount: parseInt(beneficiaryCount),
      polygonTxHash
    })));
    return JSON.stringify({ success: true, lotId, status: 'DELIVERED', beneficiaryCount });
  }

  /**
   * GetLot — query lot state
   */
  async GetLot(ctx, lotId) {
    const lot = await this._getLot(ctx, lotId);
    return JSON.stringify(lot);
  }

  /**
   * GetLotsByDonor — query all lots for a donor (rich query, CouchDB)
   */
  async GetLotsByDonor(ctx, donorId) {
    const query = { selector: { donorId } };
    const iterator = await ctx.stub.getQueryResult(JSON.stringify(query));
    const results = [];
    let result = await iterator.next();
    while (!result.done) {
      results.push(JSON.parse(result.value.value.toString('utf8')));
      result = await iterator.next();
    }
    return JSON.stringify(results);
  }

  async _lotExists(ctx, lotId) {
    const data = await ctx.stub.getState(lotId);
    return data && data.length > 0;
  }

  async _getLot(ctx, lotId) {
    const data = await ctx.stub.getState(lotId);
    if (!data || data.length === 0) throw new Error(`Lot ${lotId} does not exist`);
    return JSON.parse(data.toString());
  }
}

module.exports = SurplusFoodContract;
