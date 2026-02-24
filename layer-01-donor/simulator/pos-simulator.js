/**
 * AnnaSetu — POS Webhook Simulator
 * Simulates DMart, Reliance Smart, BigBasket POS near-expiry alerts
 * POST /simulate/:pos  →  triggers webhook to Donor API
 */

'use strict';

const express = require('express');
const crypto  = require('crypto');
const axios   = require('axios');

const app    = express();
const PORT   = process.env.SIMULATOR_PORT || 3099;
const TARGET = process.env.DONOR_API_URL  || 'http://localhost:3001';

app.use(express.json());

// ── POS Format Definitions ────────────────────────────────────────────────────

/**
 * DMart (Avenue Supermarts) webhook format
 * Real format based on their SAP-integrated POS system
 */
function buildDMartPayload(overrides = {}) {
  const sku = `DMRT-${Date.now().toString(36).toUpperCase()}`;
  return {
    event_type:       'NEAR_EXPIRY_ALERT',
    event_id:         `EVT-${Date.now()}`,
    store_code:       overrides.store_code    || 'DMRT-SRT-001',
    store_name:       overrides.store_name    || 'DMart Surat - Adajan',
    terminal_id:      overrides.terminal_id   || 'TRM-04',
    timestamp:        new Date().toISOString(),
    items: (overrides.items || [
      {
        sku,
        barcode:        `890${Math.floor(Math.random()*10000000000)}`,
        product_name:   'Britannia Whole Wheat Bread 400g',
        category:       'Bakery',
        sub_category:   'Bread & Buns',
        mrp:            45.00,
        sale_price:     36.00,
        quantity_units: 48,
        quantity_kg:    19.2,
        mfg_date:       '2025-02-15',
        expiry_date:    new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString().split('T')[0],
        batch_no:       `BT${Math.floor(Math.random()*99999)}`,
        fssai_no:       '10016011002253',
        is_vegetarian:  true,
        storage_type:   'DRY',
        shelf_location: 'A-12-3',
      },
    ]),
    store_contact: {
      manager_name:  'Rajesh Patel',
      phone:         '9876543000',
      email:         'adajan.mgr@dmart.in',
    },
    pickup_window: {
      start: new Date(Date.now() + 1 * 3600 * 1000).toISOString(),
      end:   new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
    },
    source_system: 'SAP_POS',
    api_version:   '2.1',
  };
}

/**
 * Reliance Smart (RJIL) webhook format
 * Uses their RetailConnect API structure
 */
function buildReliancePayload(overrides = {}) {
  return {
    messageType:    'SURPLUS_DONATION_ALERT',
    messageId:      `RJL-${Date.now()}`,
    retailerId:     overrides.retailerId    || 'RJIL-GJ-SRT-003',
    storeName:      overrides.storeName     || 'Reliance Smart Surat City Centre',
    storeGSTIN:     '24AAAAA0000A1Z5',
    generatedAt:    new Date().toISOString(),
    donationItems: (overrides.donationItems || [
      {
        itemCode:       `RLT${Date.now().toString().slice(-6)}`,
        itemName:       'Nandini Full Cream Milk 500ml (Pack of 12)',
        hsnCode:        '0401',
        foodCategory:   'DAIRY',
        mrpPerUnit:     28.00,
        totalUnits:     36,
        totalWeightKg:  21.6,
        manufactureDate:'2025-02-19',
        expiryDate:     new Date(Date.now() + 1 * 24 * 3600 * 1000).toISOString().split('T')[0],
        batchId:        `B${Math.floor(Math.random()*99999)}`,
        fssaiLicNo:     '10016011002253',
        isVeg:          true,
        storageReqTemp: '1-4°C',
        estimatedValue: 36 * 28,
        declaredForDonation: true,
      },
    ]),
    pickupAddress: {
      line1:   'Shop 1, Surat City Centre Mall',
      area:    'Ring Road',
      city:    'Surat',
      state:   'Gujarat',
      pincode: '395007',
      lat:     21.1702,
      lng:     72.8311,
    },
    contactPerson: {
      name:  'Amit Shah',
      phone: '9000000001',
      designation: 'Store Manager',
    },
    webhookVersion: '1.0',
    signature:      null,   // filled in below
  };
}

/**
 * BigBasket Dark Store format (REST webhook)
 */
function buildBigBasketPayload(overrides = {}) {
  return {
    event:          'stock.near_expiry',
    version:        '3',
    facility_id:    overrides.facility_id  || 'BB-DARK-SRT-01',
    facility_name:  'BigBasket Dark Store Surat',
    triggered_at:   Date.now(),
    payload: {
      products: (overrides.products || [
        {
          bb_product_id: `BB${Math.floor(Math.random()*9999999)}`,
          product_name:  'Fortune Sunflower Oil 5L',
          brand:         'Fortune',
          category_path: 'Groceries > Edible Oils > Sunflower Oil',
          unit_price:    625,
          available_qty: 15,
          weight_per_unit: 5.0,
          total_weight_kg: 75.0,
          mfg_date:      '2025-01-01',
          best_before:   new Date(Date.now() + 72 * 3600 * 1000).toISOString().split('T')[0],
          barcode:       '8901030783104',
          is_veg:        true,
          fssai:         '10016011002253',
        },
      ]),
      action_recommended: 'DONATE',
      urgency_level:      'MEDIUM',
    },
    metadata: {
      sender:       'bb-inventory-service',
      environment:  process.env.NODE_ENV || 'development',
    },
  };
}

// ── HMAC Signing ──────────────────────────────────────────────────────────────

function signPayload(payload, secret) {
  const body = JSON.stringify(payload);
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

// ── Simulator Endpoints ───────────────────────────────────────────────────────

const SECRETS = {
  dmart:     process.env.DMART_WEBHOOK_SECRET     || 'dmart_dev_secret_2025',
  reliance:  process.env.RELIANCE_WEBHOOK_SECRET  || 'reliance_dev_secret_2025',
  bigbasket: process.env.BIGBASKET_WEBHOOK_SECRET || 'bb_dev_secret_2025',
};

app.post('/simulate/:pos', async (req, res) => {
  const pos = req.params.pos.toLowerCase();
  const overrides = req.body || {};

  let payload;
  let headerKey;

  if (pos === 'dmart') {
    payload   = buildDMartPayload(overrides);
    headerKey = 'X-DMart-Signature';
  } else if (pos === 'reliance') {
    payload   = buildReliancePayload(overrides);
    headerKey = 'X-Reliance-Signature';
  } else if (pos === 'bigbasket') {
    payload   = buildBigBasketPayload(overrides);
    headerKey = 'X-BB-Signature';
  } else {
    return res.status(400).json({ error: `Unknown POS: ${pos}. Use dmart|reliance|bigbasket` });
  }

  const secret    = SECRETS[pos];
  const signature = signPayload(payload, secret);

  console.log(`[SIMULATOR] Sending ${pos.toUpperCase()} webhook to ${TARGET}/api/webhooks/${pos}`);
  console.log('[SIMULATOR] Payload:', JSON.stringify(payload, null, 2));

  try {
    const response = await axios.post(
      `${TARGET}/api/webhooks/${pos}`,
      payload,
      {
        headers: {
          'Content-Type':  'application/json',
          [headerKey]:     signature,
          'X-POS-Source':  pos.toUpperCase(),
          'User-Agent':    `${pos}-pos-system/1.0`,
        },
        timeout: 10000,
      }
    );

    res.json({
      simulated:     true,
      pos:           pos.toUpperCase(),
      payload_sent:  payload,
      signature,
      response: {
        status:  response.status,
        data:    response.data,
      },
    });
  } catch (err) {
    res.status(502).json({
      simulated:    true,
      pos:          pos.toUpperCase(),
      payload_sent: payload,
      error:        err.message,
      response:     err.response?.data,
    });
  }
});

// List available simulators
app.get('/simulate', (req, res) => {
  res.json({
    simulators: ['dmart', 'reliance', 'bigbasket'],
    usage:      'POST /simulate/:pos  with optional override body',
    examples: {
      dmart:     `POST ${req.hostname}/simulate/dmart`,
      reliance:  `POST ${req.hostname}/simulate/reliance`,
      bigbasket: `POST ${req.hostname}/simulate/bigbasket`,
    },
    formats: {
      dmart:     buildDMartPayload(),
      reliance:  buildReliancePayload(),
      bigbasket: buildBigBasketPayload(),
    },
  });
});

// ── Webhook Receiver (in Donor API — for reference) ───────────────────────────

function createWebhookRouter(db) {
  const router = require('express').Router();

  router.post('/dmart', async (req, res) => {
    const raw  = req.body;
    const sig  = req.headers['x-dmart-signature'];
    const body = typeof raw === 'string' ? raw : JSON.stringify(raw);

    // Verify HMAC
    const expected = signPayload(JSON.parse(body), SECRETS.dmart);
    if (sig !== expected) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const payload = JSON.parse(body);
    await processWebhookPayload(db, 'DMART', payload.store_code, payload);
    res.json({ received: true, event_id: payload.event_id });
  });

  router.post('/reliance', async (req, res) => {
    const raw  = req.body;
    const sig  = req.headers['x-reliance-signature'];
    const body = typeof raw === 'string' ? raw : JSON.stringify(raw);

    const expected = signPayload(JSON.parse(body), SECRETS.reliance);
    if (sig !== expected) return res.status(401).json({ error: 'Invalid signature' });

    const payload = JSON.parse(body);
    await processWebhookPayload(db, 'RELIANCE', payload.retailerId, payload);
    res.json({ received: true, message_id: payload.messageId });
  });

  router.post('/bigbasket', async (req, res) => {
    const raw  = req.body;
    const sig  = req.headers['x-bb-signature'];
    const body = typeof raw === 'string' ? raw : JSON.stringify(raw);

    const expected = signPayload(JSON.parse(body), SECRETS.bigbasket);
    if (sig !== expected) return res.status(401).json({ error: 'Invalid signature' });

    const payload = JSON.parse(body);
    await processWebhookPayload(db, 'BIGBASKET', payload.facility_id, payload);
    res.json({ received: true, event: payload.event });
  });

  return router;
}

async function processWebhookPayload(db, source, storeId, payload) {
  // Log the webhook
  const logResult = await db.query(
    `INSERT INTO pos_webhook_logs (source, store_id, payload, verified, processed)
     VALUES ($1, $2, $3, true, false) RETURNING id`,
    [source, storeId, payload]
  );
  const logId = logResult.rows[0].id;

  // Find matching donor by store_id or create lot from webhook data
  // (simplified — production would match against donors table)
  try {
    const items = extractItems(source, payload);
    for (const item of items) {
      // Upsert donation lot
      const lotResult = await db.query(
        `INSERT INTO donation_lots
           (donor_id, category, description, quantity, unit, weight_kg,
            estimated_value, expiry_date, is_vegetarian, pos_transaction_id, pos_store_id, status)
         SELECT d.id, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending'
         FROM   donors d
         WHERE  d.pos_system = $11
         LIMIT  1
         RETURNING id`,
        [
          mapCategory(item.category),
          item.name,
          item.quantity,
          'units',
          item.weight_kg,
          item.estimated_value,
          item.expiry_date,
          item.is_veg,
          logId,
          storeId,
          source,
        ]
      );
      if (lotResult.rowCount > 0) {
        await db.query(
          `UPDATE pos_webhook_logs SET processed = true, lot_id_created = $1 WHERE id = $2`,
          [lotResult.rows[0].id, logId]
        );
      }
    }
  } catch (err) {
    await db.query(
      `UPDATE pos_webhook_logs SET error = $1 WHERE id = $2`,
      [err.message, logId]
    );
  }
}

function extractItems(source, payload) {
  if (source === 'DMART')    return payload.items.map(i => ({ name: i.product_name, category: i.category, quantity: i.quantity_units, weight_kg: i.quantity_kg, estimated_value: i.sale_price * i.quantity_units, expiry_date: i.expiry_date, is_veg: i.is_vegetarian }));
  if (source === 'RELIANCE') return payload.donationItems.map(i => ({ name: i.itemName, category: i.foodCategory, quantity: i.totalUnits, weight_kg: i.totalWeightKg, estimated_value: i.estimatedValue, expiry_date: i.expiryDate, is_veg: i.isVeg }));
  if (source === 'BIGBASKET')return payload.payload.products.map(i => ({ name: i.product_name, category: i.category_path.split(' > ')[1] || 'OTHER', quantity: i.available_qty, weight_kg: i.total_weight_kg, estimated_value: i.unit_price * i.available_qty, expiry_date: i.best_before, is_veg: i.is_veg }));
  return [];
}

function mapCategory(raw) {
  const map = { Bakery: 'packaged', DAIRY: 'dairy', 'Edible Oils': 'oil', Groceries: 'packaged', Vegetables: 'vegetables', Fruits: 'fruits', Grains: 'grains' };
  for (const [k, v] of Object.entries(map)) {
    if (raw && raw.includes(k)) return v;
  }
  return 'other';
}

app.listen(PORT, () => console.log(`🛒 POS Simulator running on :${PORT}`));

module.exports = { createWebhookRouter, buildDMartPayload, buildReliancePayload, buildBigBasketPayload };
