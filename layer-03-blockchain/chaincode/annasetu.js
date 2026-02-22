'use strict';

const { Contract } = require('fabric-contract-api');

/**
 * AnnaSetu Chaincode — Hyperledger Fabric
 * Records all food donation events on the private supply chain ledger
 */
class AnnaSetu extends Contract {

  async InitLedger(ctx) {
    const genesis = {
      type: 'GENESIS',
      platform: 'AnnaSetu',
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      description: 'AnnaSetu Food Bridge — Hyperledger Fabric Ledger Initialized'
    };
    await ctx.stub.putState('GENESIS', Buffer.from(JSON.stringify(genesis)));
    return JSON.stringify({ success: true, message: 'AnnaSetu ledger initialized' });
  }

  // ── SURPLUS LISTING ──────────────────────────────────────────
  async RecordSurplusListing(ctx, lotId, donorId, productName, quantity, expiryDate, ondcListingId) {
    const exists = await this._assetExists(ctx, `SURPLUS:${lotId}`);
    if (exists) throw new Error(`Surplus listing ${lotId} already exists`);

    const record = {
      type: 'SURPLUS_LISTING',
      lotId,
      donorId,
      productName,
      quantity: parseFloat(quantity),
      expiryDate,
      ondcListingId,
      status: 'LISTED',
      listedAt: new Date().toISOString(),
      events: [{
        event: 'SURPLUS_LISTED',
        timestamp: new Date().toISOString(),
        actor: donorId,
        data: { ondcListingId }
      }]
    };

    await ctx.stub.putState(`SURPLUS:${lotId}`, Buffer.from(JSON.stringify(record)));
    ctx.stub.setEvent('SurplusListed', Buffer.from(JSON.stringify({ lotId, donorId, ondcListingId })));
    return JSON.stringify(record);
  }

  // ── NGO MATCH ────────────────────────────────────────────────
  async RecordNGOMatch(ctx, lotId, ngoId, ngoName, matchedAt) {
    const record = await this._getAsset(ctx, `SURPLUS:${lotId}`);
    record.ngoId = ngoId;
    record.ngoName = ngoName;
    record.status = 'MATCHED';
    record.events.push({
      event: 'NGO_MATCHED',
      timestamp: matchedAt,
      actor: ngoId,
      data: { ngoName }
    });
    await ctx.stub.putState(`SURPLUS:${lotId}`, Buffer.from(JSON.stringify(record)));
    ctx.stub.setEvent('NGOMatched', Buffer.from(JSON.stringify({ lotId, ngoId })));
    return JSON.stringify(record);
  }

  // ── COLLECTION ───────────────────────────────────────────────
  async RecordCollection(ctx, lotId, sfdoId, collectedAt, qualityApproved) {
    const record = await this._getAsset(ctx, `SURPLUS:${lotId}`);
    record.sfdoId = sfdoId;
    record.qualityApproved = qualityApproved === 'true';
    record.status = qualityApproved === 'true' ? 'COLLECTED' : 'QUALITY_REJECTED';
    record.collectedAt = collectedAt;
    record.events.push({
      event: 'FOOD_COLLECTED',
      timestamp: collectedAt,
      actor: sfdoId,
      data: { qualityApproved: qualityApproved === 'true' }
    });
    await ctx.stub.putState(`SURPLUS:${lotId}`, Buffer.from(JSON.stringify(record)));
    ctx.stub.setEvent('FoodCollected', Buffer.from(JSON.stringify({ lotId, sfdoId, qualityApproved })));
    return JSON.stringify(record);
  }

  // ── FOOD CREDIT ISSUANCE ─────────────────────────────────────
  async RecordCreditIssuance(ctx, creditId, beneficiaryAadhaarHash, amount, issuedBy, expiryDate) {
    const exists = await this._assetExists(ctx, `CREDIT:${creditId}`);
    if (exists) throw new Error(`Credit ${creditId} already exists`);

    const credit = {
      type: 'FOOD_CREDIT',
      creditId,
      beneficiaryHash: beneficiaryAadhaarHash, // Only hash, never raw Aadhaar
      amount: parseFloat(amount),
      currency: 'INR',
      issuedBy,
      issuedAt: new Date().toISOString(),
      expiryDate,
      status: 'ISSUED',
      redemptions: []
    };
    await ctx.stub.putState(`CREDIT:${creditId}`, Buffer.from(JSON.stringify(credit)));
    ctx.stub.setEvent('CreditIssued', Buffer.from(JSON.stringify({ creditId, amount })));
    return JSON.stringify(credit);
  }

  // ── FOOD CREDIT REDEMPTION ───────────────────────────────────
  async RecordRedemption(ctx, creditId, merchantId, amount, items, upiTxId) {
    const credit = await this._getAsset(ctx, `CREDIT:${creditId}`);
    if (credit.status === 'EXHAUSTED') throw new Error('Credit exhausted');
    if (new Date(credit.expiryDate) < new Date()) throw new Error('Credit expired');

    const redemptionAmount = parseFloat(amount);
    const usedAmount = credit.redemptions.reduce((sum, r) => sum + r.amount, 0);
    if (usedAmount + redemptionAmount > credit.amount) throw new Error('Insufficient credit balance');

    const redemption = {
      redemptionId: `RDM-${Date.now()}`,
      merchantId,
      amount: redemptionAmount,
      items: JSON.parse(items),
      upiTxId,
      timestamp: new Date().toISOString()
    };
    credit.redemptions.push(redemption);

    const newUsed = usedAmount + redemptionAmount;
    credit.status = newUsed >= credit.amount ? 'EXHAUSTED' : 'PARTIALLY_USED';
    credit.balance = credit.amount - newUsed;

    await ctx.stub.putState(`CREDIT:${creditId}`, Buffer.from(JSON.stringify(credit)));
    ctx.stub.setEvent('CreditRedeemed', Buffer.from(JSON.stringify({ creditId, merchantId, amount, upiTxId })));
    return JSON.stringify({ redemption, balance: credit.balance });
  }

  // ── QUERIES ──────────────────────────────────────────────────
  async GetSurplusHistory(ctx, lotId) {
    const record = await this._getAsset(ctx, `SURPLUS:${lotId}`);
    return JSON.stringify(record.events);
  }

  async GetListing(ctx, lotId) {
    return await ctx.stub.getState(`SURPLUS:${lotId}`);
  }

  async GetCredit(ctx, creditId) {
    return await ctx.stub.getState(`CREDIT:${creditId}`);
  }

  async QueryByDonor(ctx, donorId) {
    const query = { selector: { type: 'SURPLUS_LISTING', donorId } };
    const iterator = await ctx.stub.getQueryResult(JSON.stringify(query));
    return await this._getAllResults(iterator);
  }

  async GetImpactMetrics(ctx) {
    const surplusQuery = await ctx.stub.getQueryResult(JSON.stringify({ selector: { type: 'SURPLUS_LISTING' } }));
    const creditQuery = await ctx.stub.getQueryResult(JSON.stringify({ selector: { type: 'FOOD_CREDIT' } }));
    
    const surplusItems = JSON.parse(await this._getAllResults(surplusQuery));
    const creditItems = JSON.parse(await this._getAllResults(creditQuery));
    
    return JSON.stringify({
      totalListings: surplusItems.length,
      totalCollected: surplusItems.filter(i => i.status === 'COLLECTED').length,
      totalCreditsIssued: creditItems.length,
      totalValueINR: creditItems.reduce((s, c) => s + (c.amount || 0), 0),
      generatedAt: new Date().toISOString()
    });
  }

  // ── HELPERS ──────────────────────────────────────────────────
  async _assetExists(ctx, key) {
    const data = await ctx.stub.getState(key);
    return data && data.length > 0;
  }

  async _getAsset(ctx, key) {
    const data = await ctx.stub.getState(key);
    if (!data || data.length === 0) throw new Error(`Asset ${key} not found`);
    return JSON.parse(data.toString());
  }

  async _getAllResults(iterator) {
    const results = [];
    for await (const res of iterator) {
      results.push(JSON.parse(res.value.toString()));
    }
    return JSON.stringify(results);
  }
}

module.exports = AnnaSetu;
