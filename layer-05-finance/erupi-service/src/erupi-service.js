/**
 * AnnaSetu — Layer 05: e-RUPI Service
 * PostgreSQL-backed voucher store + NPCI mock + escrow integration + settlement reports
 */

'use strict';

const express  = require('express');
const crypto   = require('crypto');
const { Pool } = require('pg');
const cron     = require('node-cron');
const axios    = require('axios');
const { ethers } = require('ethers');

const app = express();
app.use(express.json());

const db = new Pool({ connectionString: process.env.DATABASE_URL });

// ── PostgreSQL Schema ─────────────────────────────────────────────────────────
const ERUPI_SCHEMA = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE voucher_status AS ENUM ('ISSUED','ACTIVE','REDEEMED','EXPIRED','CANCELLED','REVERSED');
CREATE TYPE txn_type AS ENUM ('ISSUE','REDEEM','EXPIRE','CANCEL','REVERSE','SETTLE');

CREATE TABLE IF NOT EXISTS vouchers (
  id                UUID         DEFAULT uuid_generate_v4() PRIMARY KEY,
  voucher_ref       TEXT         UNIQUE NOT NULL,          -- ANNA-VCH-YYYYMMDD-XXXXXX
  lot_id            TEXT,                                  -- Hyperledger lot reference
  donor_pan         TEXT,
  beneficiary_ration TEXT,                                 -- ration card no (masked in reports)
  beneficiary_mobile VARCHAR(15),
  merchant_id       TEXT         NOT NULL,
  merchant_name     TEXT,
  merchant_upi      TEXT,
  face_value        NUMERIC(10,2) NOT NULL,                -- INR
  redemption_amount NUMERIC(10,2),
  currency          CHAR(3)      DEFAULT 'INR',
  status            voucher_status DEFAULT 'ISSUED',
  purpose_code      TEXT         DEFAULT 'FOOD_DONATION',  -- NPCI purpose code
  issued_by         TEXT         DEFAULT 'IDBI0000001',    -- IFSC of issuing bank
  issued_at         TIMESTAMPTZ  DEFAULT NOW(),
  activated_at      TIMESTAMPTZ,
  redeemed_at       TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ  DEFAULT NOW() + INTERVAL '90 days',
  settlement_id     UUID,
  blockchain_voucher_id TEXT,                              -- Polygon contract ID
  npci_txn_id       TEXT,
  npci_response     JSONB,
  qr_data           TEXT,                                  -- QR string
  deep_link         TEXT,
  sms_sent          BOOLEAN      DEFAULT FALSE,
  created_at        TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vouchers_ref      ON vouchers(voucher_ref);
CREATE INDEX IF NOT EXISTS idx_vouchers_status   ON vouchers(status);
CREATE INDEX IF NOT EXISTS idx_vouchers_merchant ON vouchers(merchant_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_expires  ON vouchers(expires_at);

CREATE TABLE IF NOT EXISTS merchant_accounts (
  id            UUID         DEFAULT uuid_generate_v4() PRIMARY KEY,
  merchant_id   TEXT         UNIQUE NOT NULL,              -- Kirana shop ID
  name          TEXT         NOT NULL,
  upi_vpa       TEXT         UNIQUE NOT NULL,              -- VPA like 9876543210@idfcfirst
  ifsc          CHAR(11),
  account_no    TEXT,
  gstin         TEXT,
  address       TEXT,
  city          TEXT,
  pincode       CHAR(6),
  food_license  TEXT,
  is_active     BOOLEAN      DEFAULT TRUE,
  wallet_address TEXT,                                     -- Polygon wallet
  total_settled NUMERIC(14,2) DEFAULT 0,
  pending_amount NUMERIC(14,2) DEFAULT 0,
  registered_at TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settlement_batches (
  id            UUID         DEFAULT uuid_generate_v4() PRIMARY KEY,
  batch_ref     TEXT         UNIQUE,
  merchant_id   TEXT         NOT NULL,
  voucher_ids   UUID[]       NOT NULL,
  gross_amount  NUMERIC(14,2) NOT NULL,
  tds_amount    NUMERIC(14,2) DEFAULT 0,
  net_amount    NUMERIC(14,2) NOT NULL,
  utr_number    TEXT,                                      -- UTR from NPCI
  settled_at    TIMESTAMPTZ,
  status        TEXT         DEFAULT 'PENDING',
  report_url    TEXT,
  created_at    TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS erupi_txn_log (
  id            UUID         DEFAULT uuid_generate_v4() PRIMARY KEY,
  voucher_id    UUID         REFERENCES vouchers(id),
  txn_type      txn_type     NOT NULL,
  amount        NUMERIC(10,2),
  actor         TEXT,
  channel       TEXT,                                      -- 'SMS','APP','QR','API'
  npci_ack      TEXT,
  payload       JSONB,
  created_at    TIMESTAMPTZ  DEFAULT NOW()
);
`;

// ── NPCI e-RUPI Mock ──────────────────────────────────────────────────────────
/**
 * Simulates NPCI e-RUPI API responses
 * Production: integrate with NPCI BBPS / UPI sandbox
 */
const NPCIMock = {
  purposeCodes: {
    'FOOD_DONATION': 'FF',   // Food & Fertilizers
    'HEALTH':        'HH',
    'EDUCATION':     'EE',
    'AGRICULTURE':   'AG',
  },

  issueVoucher(params) {
    return {
      status:       'SUCCESS',
      npciTxnId:    `NPCI${Date.now()}${Math.floor(Math.random() * 9999)}`,
      voucherRef:   params.voucherRef,
      qrString:     buildQRString(params),
      deepLink:     `upi://pay?pa=${params.merchantUpi}&pn=${encodeURIComponent(params.merchantName)}&am=${params.faceValue}&cu=INR&tn=AnnaSetu+Food+Voucher+${params.voucherRef}&mode=04&purpose=${this.purposeCodes[params.purposeCode] || 'FF'}`,
      smsTemplate:  `AnnaSetu Food Voucher: Rs.${params.faceValue} credited. Valid till ${params.expiresAt?.split('T')[0]}. Redeem at approved Kirana stores. Ref: ${params.voucherRef}`,
      timestamp:    new Date().toISOString(),
    };
  },

  redeemVoucher(voucherRef, merchantUpi, amount) {
    return {
      status:       'SUCCESS',
      npciTxnId:    `NPCI${Date.now()}${Math.floor(Math.random() * 9999)}`,
      utrNumber:    `UTR${Date.now()}`,
      voucherRef,
      redeemedAmount: amount,
      timestamp:    new Date().toISOString(),
    };
  },

  settleMerchant(merchantUpi, amount, upiRef) {
    return {
      status:       'SUCCESS',
      utrNumber:    `UTR${Date.now()}`,
      merchantUpi,
      amount,
      debitAccount: '000405009IDBI',   // IDBI Bank escrow account
      creditAccount: merchantUpi,
      rrn:          Date.now().toString(),
      timestamp:    new Date().toISOString(),
    };
  },
};

function buildQRString(params) {
  // BharatQR / UPI QR format
  return [
    `upi://pay`,
    `?pa=${params.merchantUpi}`,
    `&pn=${encodeURIComponent(params.merchantName)}`,
    `&am=${params.faceValue}`,
    `&cu=INR`,
    `&tn=AnnaSetu${params.voucherRef}`,
    `&purpose=FF`,
  ].join('');
}

// ── Voucher Reference Generator ───────────────────────────────────────────────
function generateVoucherRef() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand  = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `ANNA-VCH-${date}-${rand}`;
}

// ── Core Voucher Operations ───────────────────────────────────────────────────

async function issueVoucher({ lotId, donorPan, beneficiaryRation, beneficiaryMobile, merchantId, faceValue, blockchainVoucherId }) {
  const client  = await db.connect();
  try {
    await client.query('BEGIN');

    const merchant = await client.query(
      `SELECT * FROM merchant_accounts WHERE merchant_id = $1 AND is_active = TRUE`, [merchantId]
    );
    if (!merchant.rowCount) throw new Error(`Merchant ${merchantId} not found`);
    const m = merchant.rows[0];

    const voucherRef = generateVoucherRef();
    const expiresAt  = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString();

    // Call NPCI mock
    const npci = NPCIMock.issueVoucher({
      voucherRef,
      merchantUpi:  m.upi_vpa,
      merchantName: m.name,
      faceValue,
      purposeCode:  'FOOD_DONATION',
      expiresAt,
    });

    const result = await client.query(
      `INSERT INTO vouchers
         (voucher_ref, lot_id, donor_pan, beneficiary_ration, beneficiary_mobile,
          merchant_id, merchant_name, merchant_upi, face_value, status,
          activated_at, expires_at, blockchain_voucher_id, npci_txn_id,
          npci_response, qr_data, deep_link, sms_sent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'ACTIVE', NOW(),$10,$11,$12,$13,$14,$15,FALSE)
       RETURNING *`,
      [
        voucherRef, lotId, donorPan, beneficiaryRation, beneficiaryMobile,
        merchantId, m.name, m.upi_vpa, faceValue, expiresAt,
        blockchainVoucherId, npci.npciTxnId, npci,
        npci.qrString, npci.deepLink,
      ]
    );
    const voucher = result.rows[0];

    // Log transaction
    await client.query(
      `INSERT INTO erupi_txn_log (voucher_id, txn_type, amount, actor, channel, npci_ack, payload)
       VALUES ($1, 'ISSUE', $2, 'SYSTEM', 'API', $3, $4)`,
      [voucher.id, faceValue, npci.npciTxnId, npci]
    );

    await client.query('COMMIT');
    return { voucher, npci_response: npci };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function redeemVoucher(voucherRef, merchantId, redemptionAmount = null) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const v = await client.query(
      `SELECT v.*, m.upi_vpa, m.name AS merchant_name
       FROM   vouchers v
       JOIN   merchant_accounts m ON m.merchant_id = v.merchant_id
       WHERE  v.voucher_ref = $1 AND v.merchant_id = $2 FOR UPDATE`,
      [voucherRef, merchantId]
    );
    if (!v.rowCount)                              throw new Error('Voucher not found');
    if (v.rows[0].status !== 'ACTIVE')            throw new Error(`Voucher is ${v.rows[0].status}`);
    if (new Date(v.rows[0].expires_at) < new Date()) throw new Error('Voucher expired');

    const voucher = v.rows[0];
    const amount  = redemptionAmount || voucher.face_value;
    if (parseFloat(amount) > parseFloat(voucher.face_value)) throw new Error('Amount exceeds face value');

    const npci = NPCIMock.redeemVoucher(voucherRef, voucher.upi_vpa, amount);

    await client.query(
      `UPDATE vouchers
       SET status = 'REDEEMED', redemption_amount = $1, redeemed_at = NOW(),
           npci_txn_id = $2, npci_response = $3
       WHERE id = $4`,
      [amount, npci.npciTxnId, npci, voucher.id]
    );

    // Increment merchant pending
    await client.query(
      `UPDATE merchant_accounts SET pending_amount = pending_amount + $1 WHERE merchant_id = $2`,
      [amount, merchantId]
    );

    await client.query(
      `INSERT INTO erupi_txn_log (voucher_id, txn_type, amount, actor, channel, npci_ack, payload)
       VALUES ($1, 'REDEEM', $2, $3, 'QR', $4, $5)`,
      [voucher.id, amount, merchantId, npci.utrNumber, npci]
    );

    await client.query('COMMIT');
    return { success: true, amount, utr: npci.utrNumber };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Settlement Batch Generation ───────────────────────────────────────────────

async function generateSettlementBatch(merchantId) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const redeemed = await client.query(
      `SELECT id, voucher_ref, redemption_amount, redeemed_at
       FROM   vouchers
       WHERE  merchant_id = $1 AND status = 'REDEEMED' AND settlement_id IS NULL`,
      [merchantId]
    );
    if (!redeemed.rowCount) throw new Error('No unsettled redemptions');

    const merchant    = (await client.query(`SELECT * FROM merchant_accounts WHERE merchant_id = $1`, [merchantId])).rows[0];
    const grossAmount = redeemed.rows.reduce((sum, r) => sum + parseFloat(r.redemption_amount), 0);
    const tdsAmount   = 0;   // No TDS on food donation proceeds
    const netAmount   = grossAmount - tdsAmount;
    const batchRef    = `SETL-${merchantId}-${Date.now()}`;
    const voucherIds  = redeemed.rows.map(r => r.id);

    // Call NPCI settlement API
    const npciSettle = NPCIMock.settleMerchant(merchant.upi_vpa, netAmount, batchRef);

    const batch = await client.query(
      `INSERT INTO settlement_batches
         (batch_ref, merchant_id, voucher_ids, gross_amount, tds_amount, net_amount, utr_number, settled_at, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),'SETTLED')
       RETURNING *`,
      [batchRef, merchantId, voucherIds, grossAmount, tdsAmount, netAmount, npciSettle.utrNumber]
    );

    // Link vouchers to batch
    await client.query(
      `UPDATE vouchers SET settlement_id = $1, status = 'REDEEMED' WHERE id = ANY($2::uuid[])`,
      [batch.rows[0].id, voucherIds]
    );

    // Update merchant totals
    await client.query(
      `UPDATE merchant_accounts
       SET total_settled = total_settled + $1, pending_amount = 0
       WHERE merchant_id = $2`,
      [netAmount, merchantId]
    );

    await client.query('COMMIT');

    return {
      batch:          batch.rows[0],
      npci_settle:    npciSettle,
      voucher_count:  redeemed.rowCount,
      gross_amount:   grossAmount,
      net_amount:     netAmount,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Settlement Report ─────────────────────────────────────────────────────────

async function generateSettlementReport(merchantId, startDate, endDate) {
  const batches = await db.query(
    `SELECT sb.*, ma.name AS merchant_name, ma.upi_vpa, ma.gstin
     FROM   settlement_batches sb
     JOIN   merchant_accounts ma ON ma.merchant_id = sb.merchant_id
     WHERE  sb.merchant_id = $1
       AND  sb.settled_at BETWEEN $2 AND $3
     ORDER BY sb.settled_at`,
    [merchantId, startDate, endDate]
  );

  const vouchers = await db.query(
    `SELECT v.*, sb.batch_ref, sb.utr_number
     FROM   vouchers v
     LEFT JOIN settlement_batches sb ON v.settlement_id = sb.id
     WHERE  v.merchant_id = $1
       AND  v.redeemed_at BETWEEN $2 AND $3`,
    [merchantId, startDate, endDate]
  );

  const totalRedeemed = vouchers.rows.reduce((s, v) => s + parseFloat(v.redemption_amount || 0), 0);
  const totalSettled  = batches.rows.reduce((s, b) => s + parseFloat(b.net_amount || 0), 0);

  return {
    report_date:    new Date().toISOString(),
    merchant_id:    merchantId,
    period:         { from: startDate, to: endDate },
    summary: {
      total_vouchers:   vouchers.rowCount,
      total_redeemed:   `₹${totalRedeemed.toFixed(2)}`,
      total_settled:    `₹${totalSettled.toFixed(2)}`,
      batches_count:    batches.rowCount,
    },
    batches:       batches.rows,
    vouchers:      vouchers.rows.map(v => ({
      ref:            v.voucher_ref,
      face_value:     v.face_value,
      redeemed:       v.redemption_amount,
      redeemed_at:    v.redeemed_at,
      utr:            v.utr_number,
      lot_id:         v.lot_id,
    })),
  };
}

// ── Cron: Auto-expire vouchers ────────────────────────────────────────────────
cron.schedule('0 1 * * *', async () => {
  const expired = await db.query(
    `UPDATE vouchers SET status = 'EXPIRED' WHERE status = 'ACTIVE' AND expires_at < NOW() RETURNING id`
  );
  console.log(`[ERUPI CRON] Expired ${expired.rowCount} vouchers`);
});

// Cron: Daily auto-settlement for merchants with >₹500 pending
cron.schedule('30 23 * * *', async () => {
  const merchants = await db.query(
    `SELECT merchant_id FROM merchant_accounts WHERE pending_amount >= 500 AND is_active = TRUE`
  );
  for (const m of merchants.rows) {
    await generateSettlementBatch(m.merchant_id).catch(e => console.error(`Settlement failed ${m.merchant_id}:`, e.message));
  }
  console.log(`[ERUPI CRON] Auto-settled ${merchants.rowCount} merchants`);
});

// ── NPCI Webhook Callbacks ────────────────────────────────────────────────────
app.post('/api/erupi/npci/callback', async (req, res) => {
  const { event, voucherRef, status, npciTxnId, amount } = req.body;

  // Verify NPCI HMAC
  const sig = req.headers['x-npci-signature'];
  if (sig !== crypto.createHmac('sha256', process.env.NPCI_HMAC_KEY || 'mock').update(JSON.stringify(req.body)).digest('hex')) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  if (event === 'VOUCHER_REDEEMED') {
    await db.query(`UPDATE vouchers SET npci_txn_id = $1 WHERE voucher_ref = $2`, [npciTxnId, voucherRef]);
  }
  res.json({ ack: 'OK' });
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.post('/api/erupi/vouchers/issue',   async (req, res) => { try { res.json(await issueVoucher(req.body)); } catch(e) { res.status(400).json({ error: e.message }); } });
app.post('/api/erupi/vouchers/redeem',  async (req, res) => { try { res.json(await redeemVoucher(req.body.voucher_ref, req.body.merchant_id, req.body.amount)); } catch(e) { res.status(400).json({ error: e.message }); } });
app.post('/api/erupi/settlements/batch', async (req, res) => { try { res.json(await generateSettlementBatch(req.body.merchant_id)); } catch(e) { res.status(400).json({ error: e.message }); } });
app.get('/api/erupi/settlements/report/:merchantId', async (req, res) => {
  const { from = '2025-04-01', to = new Date().toISOString().split('T')[0] } = req.query;
  try { res.json(await generateSettlementReport(req.params.merchantId, from, to)); } catch(e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/erupi/vouchers/:ref', async (req, res) => {
  const v = await db.query(`SELECT * FROM vouchers WHERE voucher_ref = $1`, [req.params.ref]);
  if (!v.rowCount) return res.status(404).json({ error: 'Not found' });
  res.json(v.rows[0]);
});

const PORT = process.env.PORT || 3005;
app.listen(PORT, () => console.log(`💳 e-RUPI Service running on :${PORT}`));

module.exports = { app, issueVoucher, redeemVoucher, generateSettlementBatch, generateSettlementReport, ERUPI_SCHEMA };
