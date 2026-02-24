/**
 * AnnaSetu — Layer 02: ONDC Beckn Protocol Server
 * Food domain taxonomy + geo-radius NGO matching + capacity-aware lot selection
 * Implements Beckn Core Spec v1.2.5 with Food & Beverage domain extensions
 */

'use strict';

const express     = require('express');
const crypto      = require('crypto');
const axios       = require('axios');
const { Pool }    = require('pg');
const geolib      = require('geolib');

const app  = express();
app.use(express.json({ limit: '5mb' }));

const db   = new Pool({ connectionString: process.env.DATABASE_URL });

// ── Beckn Domain Constants ────────────────────────────────────────────────────

const DOMAIN         = 'nic2004:52110';   // Food & Grocery
const COUNTRY        = 'IND';
const CITY           = 'Surat';
const CORE_VERSION   = '1.2.5';
const BAPP_URI       = process.env.BAPP_URI || 'https://bap.annasetu.in';
const BPP_URI        = process.env.BPP_URI  || 'https://bpp.annasetu.in';
const BPP_ID         = 'annasetu-bpp';
const BAP_ID         = 'annasetu-bap';
const REGISTRY_URI   = process.env.BECKN_REGISTRY || 'https://registry.beckn.org';

// ── Food Domain Taxonomy (ONDC Category Taxonomy v2) ─────────────────────────

const FOOD_TAXONOMY = {
  'F001': { name: 'Cereals & Grains',      sub: { 'F001.01': 'Rice', 'F001.02': 'Wheat & Atta', 'F001.03': 'Pulses & Lentils', 'F001.04': 'Maize & Corn', 'F001.05': 'Other Grains' } },
  'F002': { name: 'Fruits & Vegetables',   sub: { 'F002.01': 'Fresh Vegetables', 'F002.02': 'Fresh Fruits', 'F002.03': 'Leafy Greens', 'F002.04': 'Root Vegetables', 'F002.05': 'Gourds & Squash' } },
  'F003': { name: 'Dairy & Eggs',          sub: { 'F003.01': 'Milk', 'F003.02': 'Curd & Yogurt', 'F003.03': 'Paneer', 'F003.04': 'Butter & Ghee', 'F003.05': 'Cheese', 'F003.06': 'Eggs' } },
  'F004': { name: 'Cooked & Prepared',     sub: { 'F004.01': 'Cooked Meals', 'F004.02': 'Bakery Items', 'F004.03': 'Sweets & Mithai', 'F004.04': 'Snacks', 'F004.05': 'Ready-to-Eat' } },
  'F005': { name: 'Packaged & Processed',  sub: { 'F005.01': 'Biscuits & Cookies', 'F005.02': 'Noodles & Pasta', 'F005.03': 'Canned Goods', 'F005.04': 'Breakfast Cereals', 'F005.05': 'Confectionery' } },
  'F006': { name: 'Oils & Condiments',     sub: { 'F006.01': 'Edible Oils', 'F006.02': 'Spices & Masalas', 'F006.03': 'Salt & Sugar', 'F006.04': 'Sauces & Pickles', 'F006.05': 'Vinegar & Dressings' } },
  'F007': { name: 'Beverages',             sub: { 'F007.01': 'Juices', 'F007.02': 'Tea & Coffee', 'F007.03': 'Water', 'F007.04': 'Soft Drinks', 'F007.05': 'Health Drinks' } },
};

// ── Beckn Message Helpers ─────────────────────────────────────────────────────

function makeContext(action, messageId = null) {
  return {
    domain:       DOMAIN,
    country:      COUNTRY,
    city:         CITY,
    action,
    core_version: CORE_VERSION,
    bap_id:       BAP_ID,
    bap_uri:      BAPP_URI,
    bpp_id:       BPP_ID,
    bpp_uri:      BPP_URI,
    message_id:   messageId || crypto.randomUUID(),
    transaction_id: crypto.randomUUID(),
    timestamp:    new Date().toISOString(),
    ttl:          'PT30S',
  };
}

function lotToBecknItem(lot) {
  const categoryCode = mapDbCategoryToTaxonomy(lot.category);
  const urgency      = isUrgent(lot.expiry_date);

  return {
    id:           lot.id,
    parent_item_id: null,
    descriptor: {
      name:      lot.description,
      code:      lot.lot_number,
      short_desc:`${lot.quantity} ${lot.unit} of ${lot.description}`,
      long_desc: `Surplus food donation available for pickup. Category: ${lot.category}. ${lot.notes || ''}`,
      images:    (lot.photos || []).map(url => ({ url })),
      tags: [
        { code: 'veg_nonveg',    list: [{ code: 'veg', value: lot.is_vegetarian ? 'yes' : 'no' }] },
        { code: 'organic',       list: [{ code: 'organic', value: lot.is_organic ? 'yes' : 'no' }] },
        { code: 'urgency',       list: [{ code: 'level', value: urgency }] },
        { code: 'storage',       list: [{ code: 'temp_min', value: String(lot.storage_temp_min || '') }, { code: 'temp_max', value: String(lot.storage_temp_max || '') }] },
        { code: 'allergens',     list: (lot.allergens || []).map(a => ({ code: 'allergen', value: a })) },
        { code: 'annasetu_meta', list: [{ code: 'lot_id', value: lot.id }, { code: 'blockchain_id', value: lot.blockchain_lot_id || '' }] },
      ],
    },
    quantity: {
      available: { count: String(lot.quantity) },
      maximum:   { count: String(lot.quantity) },
      unitized:  { measure: { unit: lot.unit, value: String(lot.quantity) } },
    },
    price: {
      currency:      'INR',
      value:         '0',               // Free donation
      offered_value: '0',
      tagged_price:  String(lot.estimated_value),  // for 80G tracking
    },
    category_id: categoryCode,
    fulfillment_id: 'F001',
    location_id:    lot.donor_id,
    time: {
      label:    'validity',
      range: {
        start: lot.pickup_available_from || new Date().toISOString(),
        end:   lot.expiry_date + 'T23:59:59Z',
      },
    },
    matched:     true,
    related:     false,
    recommended: urgency === 'HIGH',
    '@ondc/org/returnable':           false,
    '@ondc/org/cancellable':          false,
    '@ondc/org/time_to_ship':         'PT2H',
    '@ondc/org/available_on_cod':     false,
    '@ondc/org/contact_details_consumer_care': 'AnnaSetu Helpline,support@annasetu.in,1800-XXX-XXXX',
    'annasetu:fssai_license':         lot.fssai_license || '',
    'annasetu:expiry_date':           lot.expiry_date,
    'annasetu:weight_kg':             lot.weight_kg,
  };
}

function isUrgent(expiryDate) {
  const hours = (new Date(expiryDate) - Date.now()) / (1000 * 3600);
  if (hours < 24)  return 'CRITICAL';
  if (hours < 48)  return 'HIGH';
  if (hours < 72)  return 'MEDIUM';
  return 'LOW';
}

function mapDbCategoryToTaxonomy(category) {
  const map = {
    grains:    'F001',
    vegetables:'F002',
    fruits:    'F002',
    dairy:     'F003',
    cooked:    'F004',
    packaged:  'F005',
    oil:       'F006',
    spices:    'F006',
    other:     'F005',
  };
  return map[category] || 'F005';
}

// ── Geo-radius NGO Matching ───────────────────────────────────────────────────

/**
 * Find NGOs within radius (km) of pickup location, sorted by:
 * 1. Available capacity (capacity_kg_day - current_load_kg)
 * 2. Distance from pickup
 * 3. Cold storage match (if lot requires it)
 */
async function findMatchingNGOs(pickupLat, pickupLng, radiusKm = 15, requireCold = false, weightKg = 0) {
  const result = await db.query(`
    SELECT n.*,
           ST_Distance(
             n.location::geography,
             ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
           ) / 1000.0 AS distance_km,
           (n.capacity_kg_day - n.current_load_kg) AS available_capacity_kg
    FROM   ngos n
    WHERE  n.is_active = TRUE
      AND  ST_DWithin(
             n.location::geography,
             ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
             $3 * 1000
           )
      AND  (n.capacity_kg_day - n.current_load_kg) >= $4
      ${requireCold ? 'AND n.cold_storage = TRUE' : ''}
    ORDER BY
      available_capacity_kg DESC,
      distance_km ASC
    LIMIT 10
  `, [pickupLng, pickupLat, radiusKm, weightKg]);

  return result.rows.map(ngo => ({
    id:                  ngo.id,
    name:                ngo.name,
    reg_no:              ngo.reg_no,
    phone:               ngo.phone,
    distance_km:         Math.round(ngo.distance_km * 10) / 10,
    available_capacity:  ngo.available_capacity_kg,
    cold_storage:        ngo.cold_storage,
    vehicle_available:   ngo.vehicle_available,
    score:               computeNGOScore(ngo),
  }));
}

function computeNGOScore(ngo) {
  let score = 100;
  score -= ngo.distance_km * 2;                                              // penalise distance
  score += Math.min(ngo.available_capacity_kg / 10, 30);                     // reward capacity
  if (ngo.vehicle_available) score += 20;
  if (ngo.cold_storage)      score += 15;
  return Math.max(0, Math.round(score));
}

// ── Capacity-aware Lot Selection ──────────────────────────────────────────────

async function selectLotsForNGO(ngoId, radiusKm = 10) {
  const ngo = await db.query('SELECT * FROM ngos WHERE id = $1', [ngoId]);
  if (!ngo.rowCount) throw new Error('NGO not found');

  const n = ngo.rows[0];
  const available = n.capacity_kg_day - n.current_load_kg;

  const lots = await db.query(`
    SELECT dl.*, d.name AS donor_name,
           ST_X(dl.pickup_location::geometry) AS pickup_lng,
           ST_Y(dl.pickup_location::geometry) AS pickup_lat,
           ST_Distance(
             dl.pickup_location::geography,
             ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
           ) / 1000.0 AS distance_km
    FROM   donation_lots dl
    JOIN   donors d ON dl.donor_id = d.id
    WHERE  dl.status = 'verified'
      AND  dl.ngo_id IS NULL
      AND  dl.expiry_date >= NOW()
      AND  dl.pickup_location IS NOT NULL
      AND  ST_DWithin(
             dl.pickup_location::geography,
             ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
             $3 * 1000
           )
      AND  (
             $4 = FALSE         -- no cold storage required
             OR dl.storage_temp_max IS NULL
             OR dl.storage_temp_max >= 0   -- needs cold? check against NGO capability
             OR $5 = TRUE        -- NGO has cold storage
           )
    ORDER BY
      dl.expiry_date ASC,       -- urgent items first
      distance_km   ASC
  `, [
    n.location ? JSON.parse(n.location).coordinates[0] : 72.83,
    n.location ? JSON.parse(n.location).coordinates[1] : 21.17,
    radiusKm,
    false,
    n.cold_storage,
  ]);

  // Greedy selection respecting capacity
  const selected = [];
  let allocated  = 0;

  for (const lot of lots.rows) {
    const lotKg = lot.weight_kg || (lot.quantity * 0.5);
    if (allocated + lotKg <= available) {
      selected.push(lot);
      allocated += lotKg;
    }
    if (allocated >= available) break;
  }

  return { ngo: n, selected_lots: selected, total_kg: allocated, remaining_capacity: available - allocated };
}

// ── Logistics Mock API ────────────────────────────────────────────────────────

const logisticsMock = {
  providers: [
    { id: 'DUNZO-GJ', name: 'Dunzo Business Surat', type: 'hyperlocal', max_weight_kg: 20,  cost_per_km: 8 },
    { id: 'PORTER',   name: 'Porter Mini Truck',    type: 'mini_truck',  max_weight_kg: 500, cost_per_km: 25 },
    { id: 'NGO-SELF', name: 'NGO Self-Pickup',       type: 'self',        max_weight_kg: 9999,cost_per_km: 0 },
    { id: 'SWIGGY-G', name: 'Swiggy Genie',          type: 'hyperlocal', max_weight_kg: 15,  cost_per_km: 10 },
  ],

  getQuote(pickupLat, pickupLng, dropLat, dropLng, weightKg) {
    const distKm = geolib.getDistance(
      { latitude: pickupLat, longitude: pickupLng },
      { latitude: dropLat,   longitude: dropLng }
    ) / 1000;

    return this.providers
      .filter(p => p.max_weight_kg >= weightKg)
      .map(p => ({
        provider_id:     p.id,
        provider_name:   p.name,
        type:            p.type,
        distance_km:     Math.round(distKm * 10) / 10,
        estimated_cost:  Math.round(distKm * p.cost_per_km),
        eta_minutes:     p.type === 'hyperlocal' ? 30 : 60,
        tracking_url:    `https://track.annasetu.in/${p.id.toLowerCase()}/${crypto.randomBytes(4).toString('hex')}`,
        recommended:     p.cost_per_km === 0,
      }))
      .sort((a, b) => a.estimated_cost - b.estimated_cost);
  },
};

// ── Beckn Protocol Endpoints ──────────────────────────────────────────────────

// search — BAP sends search request, BPP returns catalog
app.post('/beckn/search', async (req, res) => {
  const { context, message } = req.body;
  const { intent } = message;

  try {
    // Parse search intent (geo-radius, category filter, urgency)
    const gpsString   = intent?.fulfillment?.start?.location?.gps || '';
    const [lat, lng]  = gpsString.split(',').map(Number);
    const radiusKm    = intent?.fulfillment?.start?.location?.radius?.value || 15;
    const category    = intent?.item?.category_id;
    const urgentOnly  = intent?.item?.tags?.find(t => t.code === 'urgency')?.list?.[0]?.value === 'HIGH';

    // Query lots
    let query = `
      SELECT dl.*, d.name AS donor_name, d.city AS donor_city,
             d.address_line1 AS donor_address,
             ST_Y(dl.pickup_location::geometry) AS pickup_lat,
             ST_X(dl.pickup_location::geometry) AS pickup_lng
      FROM   donation_lots dl
      JOIN   donors d ON dl.donor_id = d.id
      WHERE  dl.status IN ('pending','verified')
        AND  dl.expiry_date >= NOW()
    `;
    const params = [];

    if (lat && lng) {
      params.push(lng, lat, radiusKm * 1000);
      query += ` AND ST_DWithin(dl.pickup_location::geography, ST_SetSRID(ST_MakePoint($${params.length - 2}, $${params.length - 1}), 4326)::geography, $${params.length})`;
    }
    if (category) {
      params.push(mapTaxonomyToDb(category));
      query += ` AND dl.category = $${params.length}`;
    }
    if (urgentOnly) {
      query += ` AND dl.expiry_date <= NOW() + INTERVAL '48 hours'`;
    }
    query += ' ORDER BY dl.expiry_date ASC LIMIT 50';

    const lots = await db.query(query, params);

    const catalog = {
      descriptor: {
        name:      'AnnaSetu Food Donation Network',
        short_desc:'Surplus food bridge connecting donors to NGOs',
        long_desc: 'AnnaSetu leverages ONDC, e-RUPI, and Hyperledger Fabric to eliminate food waste and hunger in India.',
        images:    [{ url: 'https://annasetu.in/assets/logo.png' }],
        tags: [
          { code: 'domain',    list: [{ code: 'domain', value: 'Food Security & Donation' }] },
          { code: 'coverage',  list: [{ code: 'city', value: 'Surat, Gujarat' }] },
        ],
      },
      categories: Object.entries(FOOD_TAXONOMY).map(([id, cat]) => ({
        id,
        descriptor: { name: cat.name },
        sub_categories: Object.entries(cat.sub).map(([sid, sname]) => ({
          id: sid,
          descriptor: { name: sname },
        })),
      })),
      fulfillments: [
        {
          id:   'F001',
          type: 'Delivery',
          contact: { phone: '1800-XXX-XXXX', email: 'logistics@annasetu.in' },
        },
        {
          id:   'F002',
          type: 'Self-Pickup',
        },
      ],
      payments: [
        { id: 'P001', type: 'ON-FULFILLMENT', collected_by: 'BAP', status: 'NOT-PAID', params: { currency: 'INR', amount: '0' } },
      ],
      offers: [],
      items: lots.rows.map(lotToBecknItem),
      exp:   new Date(Date.now() + 30 * 60000).toISOString(),
    };

    res.json({
      context: { ...makeContext('on_search', context?.message_id), bpp_id: BPP_ID, bpp_uri: BPP_URI },
      message: { catalog },
    });
  } catch (err) {
    console.error('/beckn/search error:', err);
    res.status(500).json({ context: makeContext('on_search'), error: { type: 'INTERNAL-ERROR', code: '30022', message: err.message } });
  }
});

// select — BAP selects items, BPP confirms availability
app.post('/beckn/select', async (req, res) => {
  const { context, message } = req.body;
  const itemIds = (message?.order?.items || []).map(i => i.id);

  const lots = await db.query(
    `SELECT * FROM donation_lots WHERE id = ANY($1::uuid[]) AND status IN ('pending','verified')`,
    [itemIds]
  );

  res.json({
    context: makeContext('on_select', context?.message_id),
    message: {
      order: {
        items:     lots.rows.map(l => ({ id: l.id, quantity: { count: String(l.quantity) } })),
        quote: {
          price: { currency: 'INR', value: '0' },
          breakup: lots.rows.map(l => ({
            title:  l.description,
            price:  { currency: 'INR', value: '0' },
            item:   { id: l.id },
          })),
          ttl: 'PT30S',
        },
      },
    },
  });
});

// init — NGO initiates order
app.post('/beckn/init', async (req, res) => {
  const { context, message } = req.body;
  res.json({
    context: makeContext('on_init', context?.message_id),
    message: {
      order: {
        ...message.order,
        id:      crypto.randomUUID(),
        state:   'CREATED',
        quote:   { price: { currency: 'INR', value: '0' } },
        payment: { status: 'NOT-PAID', type: 'ON-FULFILLMENT' },
      },
    },
  });
});

// confirm — Finalise donation handover
app.post('/beckn/confirm', async (req, res) => {
  const { context, message } = req.body;
  const orderId = message?.order?.id || crypto.randomUUID();
  const itemIds = (message?.order?.items || []).map(i => i.id);

  // Assign lots to NGO
  if (itemIds.length) {
    await db.query(
      `UPDATE donation_lots SET status = 'dispatched', updated_at = NOW() WHERE id = ANY($1::uuid[])`,
      [itemIds]
    );
  }

  res.json({
    context: makeContext('on_confirm', context?.message_id),
    message: {
      order: {
        ...message.order,
        id:    orderId,
        state: 'ACCEPTED',
        fulfillment: { state: { descriptor: { name: 'Pickup Scheduled' } } },
      },
    },
  });
});

// ── Geo matching & logistics endpoints ───────────────────────────────────────

app.post('/api/match-ngos', async (req, res) => {
  const { lat, lng, radius_km = 15, require_cold = false, weight_kg = 0 } = req.body;
  const ngos = await findMatchingNGOs(lat, lng, radius_km, require_cold, weight_kg);
  res.json({ count: ngos.length, ngos });
});

app.get('/api/lots/select-for-ngo/:ngoId', async (req, res) => {
  const selection = await selectLotsForNGO(req.params.ngoId, req.query.radius_km || 10);
  res.json(selection);
});

app.post('/api/logistics/quote', (req, res) => {
  const { pickup_lat, pickup_lng, drop_lat, drop_lng, weight_kg } = req.body;
  const quotes = logisticsMock.getQuote(pickup_lat, pickup_lng, drop_lat, drop_lng, weight_kg);
  res.json({ quotes });
});

// Full taxonomy
app.get('/api/taxonomy', (req, res) => res.json(FOOD_TAXONOMY));

function mapTaxonomyToDb(code) {
  const m = { F001: 'grains', F002: 'vegetables', F003: 'dairy', F004: 'cooked', F005: 'packaged', F006: 'oil', F007: 'other' };
  return m[code] || 'other';
}

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`🔗 ONDC Beckn BPP running on :${PORT}`));

module.exports = { app, findMatchingNGOs, selectLotsForNGO, FOOD_TAXONOMY, logisticsMock };
