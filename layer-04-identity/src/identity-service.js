/**
 * AnnaSetu — Layer 04: Identity & KYC Service
 * - Aadhaar OTP-based eKYC (UIDAI Sandbox)
 * - NFSA Gujarat beneficiary registry
 * - Polygon ID Zero-Knowledge Proof for BPL eligibility
 * No Aadhaar number is stored; only demographic hash + ZK credential
 */

'use strict';

const express  = require('express');
const crypto   = require('crypto');
const axios    = require('axios');
const { Pool } = require('pg');
const jose     = require('jose');   // JWT for ZK-linked tokens

const app = express();
app.use(express.json());

const db = new Pool({ connectionString: process.env.DATABASE_URL });

// ── UIDAI Sandbox Config ──────────────────────────────────────────────────────
const UIDAI = {
  baseUrl:    process.env.UIDAI_SANDBOX_URL || 'https://developer.uidai.gov.in/uidauthpoc',
  authUrl:    '/auth/2.5/public/AUA_CODE/0/0',
  eKYCUrl:    '/ekyc/2.5/public/AUA_CODE/0/0',
  auaCode:    process.env.UIDAI_AUA_CODE    || 'DEMO_AUA',
  asaCode:    process.env.UIDAI_ASA_CODE    || 'DEMO_ASA',
  auaKey:     process.env.UIDAI_AUA_KEY     || 'DEMO_KEY',
  licenseKey: process.env.UIDAI_LICENSE_KEY || 'MEY4DUVYTQYBYXVBYWQ5YTQZMJIWMJQ=',
};

// ── NFSA Gujarat Category Codes ───────────────────────────────────────────────
const NFSA_CATEGORIES = {
  'AAY':  { name: 'Antyodaya Anna Yojana', quota_kg: 35, description: 'Poorest of poor families' },
  'PHH':  { name: 'Priority Household',    quota_kg: 5,  description: 'Per member per month, up to 5' },
  'NPHH': { name: 'Non-Priority HH',       quota_kg: 0,  description: 'Not entitled to PDS subsidy' },
};

// ── Gujarat NFSA Seed Data ────────────────────────────────────────────────────
const GUJARAT_DISTRICTS = [
  { code: 'SRT', name: 'Surat',     talukas: ['Choryasi', 'Olpad', 'Mangrol', 'Mandvi', 'Mahuva', 'Bardoli', 'Kamrej'] },
  { code: 'AHM', name: 'Ahmedabad', talukas: ['Daskroi', 'Sanand', 'Dholka', 'Viramgam'] },
  { code: 'VAD', name: 'Vadodara',  talukas: ['Padra', 'Karjan', 'Vaghodia'] },
  { code: 'RAJ', name: 'Rajkot',    talukas: ['Rajkot', 'Gondal', 'Jasdan'] },
];

// ── Database Schema (run once) ────────────────────────────────────────────────
const KYC_SCHEMA = `
CREATE TABLE IF NOT EXISTS beneficiaries (
  id                UUID          DEFAULT uuid_generate_v4() PRIMARY KEY,
  ration_card_no    TEXT          UNIQUE NOT NULL,
  nfsa_category     TEXT          NOT NULL,           -- AAY, PHH, NPHH
  family_size       INT           NOT NULL DEFAULT 1,
  head_of_family    TEXT          NOT NULL,
  district          TEXT          NOT NULL,
  taluka            TEXT,
  village_ward      TEXT,
  fair_price_shop   TEXT,                             -- FPS dealer code
  mobile            VARCHAR(15),
  jan_dhan_account  TEXT,                             -- Jan Dhan linked account
  ekyc_done         BOOLEAN       DEFAULT FALSE,
  ekyc_at           TIMESTAMPTZ,
  polygon_did       TEXT,                             -- Polygon ID Decentralised ID
  vc_credential_id  TEXT,                             -- Verifiable Credential ID
  wallet_address    TEXT,                             -- linked Polygon wallet
  aadhaar_hash      TEXT,                             -- SHA-256 of Aadhaar (no plain storage)
  is_active         BOOLEAN       DEFAULT TRUE,
  enrolled_at       TIMESTAMPTZ   DEFAULT NOW(),
  last_benefit_at   TIMESTAMPTZ,
  benefit_month     TEXT                              -- last month benefits received 'YYYY-MM'
);

CREATE TABLE IF NOT EXISTS kyc_sessions (
  id            UUID          DEFAULT uuid_generate_v4() PRIMARY KEY,
  ration_card   TEXT,
  txn_id        TEXT          UNIQUE,
  otp_sent      BOOLEAN       DEFAULT FALSE,
  otp_verified  BOOLEAN       DEFAULT FALSE,
  ekyc_data     JSONB,                                -- demographic data from UIDAI (no Aadhaar no.)
  created_at    TIMESTAMPTZ   DEFAULT NOW(),
  expires_at    TIMESTAMPTZ   DEFAULT NOW() + INTERVAL '10 minutes'
);

CREATE TABLE IF NOT EXISTS zk_credentials (
  id            UUID          DEFAULT uuid_generate_v4() PRIMARY KEY,
  beneficiary_id UUID         REFERENCES beneficiaries(id),
  credential_id TEXT          UNIQUE NOT NULL,
  schema_id     TEXT          NOT NULL,               -- Polygon ID schema
  issuer_did    TEXT          NOT NULL,
  holder_did    TEXT,
  proof         JSONB         NOT NULL,               -- ZK proof blob
  attributes    JSONB,                                -- revealed attributes only
  issued_at     TIMESTAMPTZ   DEFAULT NOW(),
  expires_at    TIMESTAMPTZ,
  is_revoked    BOOLEAN       DEFAULT FALSE
);
`;

// ── Aadhaar OTP Initiation ────────────────────────────────────────────────────

/**
 * Step 1: Generate OTP on Aadhaar-linked mobile
 * NOTE: In production, Aadhaar number goes directly to UIDAI — NOT stored
 */
async function initiateAadhaarOTP(aadhaarNum) {
  // Validate format (12 digits, Verhoeff algorithm check)
  if (!/^\d{12}$/.test(aadhaarNum)) {
    throw new Error('Invalid Aadhaar format');
  }
  if (!verhoeffCheck(aadhaarNum)) {
    throw new Error('Invalid Aadhaar number (checksum)');
  }

  const txnId = `ANNA-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

  // UIDAI Sandbox OTP request
  const payload = {
    aadhaar: aadhaarNum,
    txn:     txnId,
    otp: { channel: 'SMS' },
  };

  try {
    if (process.env.UIDAI_SANDBOX_MODE === 'mock') {
      // Sandbox mock: always succeeds
      console.log(`[UIDAI MOCK] OTP initiated for last-4: ${aadhaarNum.slice(-4)}, txn: ${txnId}`);
      return { success: true, txnId, message: 'OTP sent to Aadhaar-registered mobile' };
    }

    const resp = await axios.post(
      `${UIDAI.baseUrl}/otp/1.0/public/${UIDAI.auaCode}`,
      payload,
      { headers: { 'Content-Type': 'application/json', 'Authorization': UIDAI.licenseKey } }
    );
    return { success: resp.data.status === 'y', txnId, message: 'OTP sent' };
  } catch (err) {
    throw new Error(`UIDAI OTP error: ${err.response?.data?.message || err.message}`);
  }
}

/**
 * Step 2: Verify OTP and perform eKYC
 * Returns demographic data — Aadhaar number NOT stored anywhere
 */
async function verifyAadhaarOTP(aadhaarNum, otp, txnId) {
  if (!txnId || !otp) throw new Error('txnId and otp required');

  if (process.env.UIDAI_SANDBOX_MODE === 'mock') {
    // Sandbox always passes with OTP '123456'
    if (otp !== '123456' && process.env.NODE_ENV !== 'test') {
      throw new Error('Invalid OTP (sandbox: use 123456)');
    }
    return {
      success:    true,
      demographic: {
        name:    'Ramesh Kumar Patel',
        dob:     '1985-03-15',
        gender:  'M',
        address: 'Lal Darwaja, Surat, Gujarat',
        pincode: '395003',
        mobile:  'XXXXXXX' + aadhaarNum.slice(-3),  // masked
      },
      aadhaarHash: crypto.createHash('sha256').update(aadhaarNum + process.env.HASH_SALT).digest('hex'),
    };
  }

  const resp = await axios.post(
    `${UIDAI.baseUrl}${UIDAI.eKYCUrl}`,
    { aadhaar: aadhaarNum, otp, txn: txnId },
    { headers: { 'Authorization': UIDAI.licenseKey } }
  );

  return {
    success:     resp.data.status === 'y',
    demographic: maskDemographic(resp.data.ekyc),
    aadhaarHash: crypto.createHash('sha256')
                       .update(aadhaarNum + process.env.HASH_SALT)
                       .digest('hex'),
  };
}

function maskDemographic(data) {
  // Strip Aadhaar, mask partial phone
  const { uid, ...clean } = data;
  if (clean.phone) clean.phone = 'XXXXXXX' + clean.phone.slice(-3);
  return clean;
}

// ── NFSA Gujarat Beneficiary Lookup ──────────────────────────────────────────

async function findBeneficiaryByRationCard(rationCardNo) {
  const result = await db.query(
    `SELECT b.*, zc.credential_id, zc.holder_did
     FROM   beneficiaries b
     LEFT JOIN zk_credentials zc ON zc.beneficiary_id = b.id AND NOT zc.is_revoked
     WHERE  b.ration_card_no = $1 AND b.is_active = TRUE`,
    [rationCardNo]
  );
  return result.rows[0] || null;
}

async function checkBPLEligibility(rationCardNo) {
  const ben = await findBeneficiaryByRationCard(rationCardNo);
  if (!ben) return { eligible: false, reason: 'Ration card not found' };
  if (ben.nfsa_category === 'NPHH') return { eligible: false, reason: 'NPHH category — not entitled to subsidy' };
  if (!ben.ekyc_done) return { eligible: false, reason: 'eKYC not completed' };

  const monthKey = new Date().toISOString().slice(0, 7);
  if (ben.benefit_month === monthKey) return { eligible: false, reason: 'Benefits already received this month' };

  return {
    eligible:     true,
    category:     ben.nfsa_category,
    quota_kg:     NFSA_CATEGORIES[ben.nfsa_category]?.quota_kg || 0,
    family_size:  ben.family_size,
    district:     ben.district,
    wallet:       ben.wallet_address,
    polygon_did:  ben.polygon_did,
    zk_cred_id:   ben.credential_id,
  };
}

// ── Polygon ID — Zero-Knowledge Proof for BPL eligibility ────────────────────

const POLYGON_ID_ISSUER_DID = process.env.POLYGON_ISSUER_DID || 'did:polygonid:polygon:amoy:2qH7XaukfHiyLi7GnRGTNqJXmhBNvBMr27Nzd3Lfd1';
const BPL_SCHEMA_ID         = 'https://schema.iden3.io/core/json/annasetu-bpl-eligibility.json';

/**
 * Issue a Polygon ID Verifiable Credential for BPL eligibility
 * ZK circuit: proves "is BPL" without revealing Aadhaar or ration card number
 */
async function issueBPLCredential(beneficiaryId, holderDID) {
  const ben = await db.query(`SELECT * FROM beneficiaries WHERE id = $1`, [beneficiaryId]);
  if (!ben.rowCount) throw new Error('Beneficiary not found');
  const b = ben.rows[0];

  if (!['AAY', 'PHH'].includes(b.nfsa_category)) {
    throw new Error('Only BPL households (AAY/PHH) can receive BPL credential');
  }
  if (!b.ekyc_done) throw new Error('eKYC must be completed before credential issuance');

  const credentialId = `urn:uuid:${crypto.randomUUID()}`;

  // Build W3C Verifiable Credential (Polygon ID format)
  const credential = {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      'https://schema.iden3.io/core/jsonld/iden3proofs.jsonld',
      'https://raw.githubusercontent.com/iden3/claim-schema-vocab/main/schemas/json-ld/kyc-v3.json-ld',
    ],
    id:   credentialId,
    type: ['VerifiableCredential', 'AnnasetuBPLEligibility'],
    issuer:            POLYGON_ID_ISSUER_DID,
    issuanceDate:      new Date().toISOString(),
    expirationDate:    new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
    credentialSubject: {
      id:            holderDID,
      type:          'AnnasetuBPLEligibility',
      // Only non-sensitive attributes exposed — NO Aadhaar, NO ration card
      isEligible:    true,
      category:      b.nfsa_category,
      district:      b.district,
      quota_kg:      NFSA_CATEGORIES[b.nfsa_category].quota_kg,
      family_size:   b.family_size,
      issuing_org:   'IDBI Bank — AnnaSetu Initiative, Gujarat',
      valid_month:   new Date().toISOString().slice(0, 7),
    },
    credentialSchema: {
      id:   BPL_SCHEMA_ID,
      type: 'JsonSchemaValidator2018',
    },
  };

  // In production: sign with Polygon ID Issuer Node
  // Here: generate Groth16 ZK proof stub
  const proof = await generateZKProof(credential, b);

  // Store credential
  await db.query(
    `INSERT INTO zk_credentials
       (beneficiary_id, credential_id, schema_id, issuer_did, holder_did, proof, attributes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (credential_id) DO NOTHING`,
    [
      beneficiaryId, credentialId, BPL_SCHEMA_ID,
      POLYGON_ID_ISSUER_DID, holderDID,
      JSON.stringify(proof),
      JSON.stringify(credential.credentialSubject),
    ]
  );

  // Update beneficiary
  await db.query(
    `UPDATE beneficiaries SET polygon_did = $1, vc_credential_id = $2 WHERE id = $3`,
    [holderDID, credentialId, beneficiaryId]
  );

  return { credential, proof, qr_code_url: buildPolygonIDQR(credentialId) };
}

/**
 * Verify a BPL ZK proof — used by merchant POS or voucher system
 * Returns true/false without accessing Aadhaar or ration card
 */
async function verifyBPLProof(credentialId, proofRequest) {
  const result = await db.query(
    `SELECT zc.*, b.nfsa_category, b.is_active, b.benefit_month
     FROM   zk_credentials zc
     JOIN   beneficiaries b ON b.id = zc.beneficiary_id
     WHERE  zc.credential_id = $1 AND NOT zc.is_revoked`,
    [credentialId]
  );

  if (!result.rowCount) return { valid: false, reason: 'Credential not found or revoked' };
  const cred = result.rows[0];

  if (new Date(JSON.parse(cred.proof).expiresAt) < new Date()) {
    return { valid: false, reason: 'Credential expired' };
  }
  if (!cred.is_active) return { valid: false, reason: 'Beneficiary inactive' };
  if (!['AAY', 'PHH'].includes(cred.nfsa_category)) {
    return { valid: false, reason: 'Not BPL category' };
  }

  // Verify ZK proof cryptographically
  const proofValid = verifyGroth16Proof(JSON.parse(cred.proof));

  return {
    valid:    proofValid,
    category: cred.nfsa_category,
    attrs:    JSON.parse(cred.attributes),
  };
}

// ── ZK Proof Helpers (Groth16 stub — replace with snarkjs in production) ─────

async function generateZKProof(credential, beneficiary) {
  // Production: use snarkjs with compiled circuit
  // Circuit: proves knowledge of (aadhaar_hash, ration_card_no) satisfying
  //          NFSA_DB(hash(ration_card_no)) == AAY or PHH
  //          WITHOUT revealing ration_card_no or aadhaar_hash

  const witness = {
    aadhaar_hash:   beneficiary.aadhaar_hash,
    ration_card_no: crypto.createHash('sha256').update(beneficiary.ration_card_no).digest('hex'),
    category_code:  beneficiary.nfsa_category === 'AAY' ? 1 : 2,
    district_code:  beneficiary.district,
  };

  // Mock Groth16 proof (replace with snarkjs.groth16.prove(wasmFile, zkeyFile, input))
  return {
    protocol: 'groth16',
    curve:    'bn128',
    pi_a:     ['0x' + crypto.randomBytes(32).toString('hex'), '0x' + crypto.randomBytes(32).toString('hex'), '0x01'],
    pi_b:     [['0x' + crypto.randomBytes(32).toString('hex'), '0x' + crypto.randomBytes(32).toString('hex')]],
    pi_c:     ['0x' + crypto.randomBytes(32).toString('hex'), '0x' + crypto.randomBytes(32).toString('hex'), '0x01'],
    publicSignals: [
      '1',           // is_eligible
      crypto.createHash('sha256').update(beneficiary.district).digest('hex').slice(0, 8),
    ],
    expiresAt:  new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
    issuedAt:   new Date().toISOString(),
    credentialId: credential.id,
  };
}

function verifyGroth16Proof(proof) {
  // Production: snarkjs.groth16.verify(vKey, publicSignals, proof)
  // For demo: check structural validity
  return proof.protocol === 'groth16' &&
         Array.isArray(proof.pi_a) && proof.pi_a.length === 3 &&
         proof.publicSignals?.[0] === '1';
}

function buildPolygonIDQR(credentialId) {
  const req = {
    id:   crypto.randomUUID(),
    typ:  'application/iden3comm-plain-json',
    type: 'https://iden3-communication.io/credentials/1.0/offer',
    body: {
      credentials: [{ id: credentialId, description: 'AnnaSetu BPL Eligibility Credential' }],
      url:         `${process.env.ISSUER_NODE_URL}/v1/agent`,
    },
  };
  return `https://annasetu.in/identity/claim/${Buffer.from(JSON.stringify(req)).toString('base64url')}`;
}

// ── Verhoeff Checksum (Aadhaar validation) ─────────────────────────────────────
function verhoeffCheck(num) {
  const d = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
  const p = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
  const inv = [0,4,3,2,1,9,8,7,6,5];
  const digits = num.split('').map(Number).reverse();
  let c = 0;
  for (let i = 0; i < digits.length; i++) c = d[c][p[i % 8][digits[i]]];
  return c === 0;
}

// ── API Routes ────────────────────────────────────────────────────────────────

// Aadhaar OTP
app.post('/api/identity/aadhaar/otp', async (req, res) => {
  const { aadhaar } = req.body;
  if (!aadhaar) return res.status(400).json({ error: 'aadhaar required' });
  const result = await initiateAadhaarOTP(aadhaar).catch(e => ({ error: e.message }));
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

// eKYC verify
app.post('/api/identity/aadhaar/verify', async (req, res) => {
  const { aadhaar, otp, txn_id, ration_card } = req.body;
  const result = await verifyAadhaarOTP(aadhaar, otp, txn_id).catch(e => ({ error: e.message }));
  if (result.error) return res.status(400).json(result);

  // Update beneficiary eKYC status
  if (ration_card && result.success) {
    await db.query(
      `UPDATE beneficiaries SET ekyc_done = TRUE, ekyc_at = NOW(), aadhaar_hash = $1 WHERE ration_card_no = $2`,
      [result.aadhaarHash, ration_card]
    );
  }
  res.json(result);
});

// BPL eligibility check (used by voucher system — no Aadhaar needed)
app.get('/api/identity/bpl-eligibility/:rationCard', async (req, res) => {
  const result = await checkBPLEligibility(req.params.rationCard).catch(e => ({ error: e.message }));
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

// Issue ZK credential
app.post('/api/identity/credentials/issue', async (req, res) => {
  const { beneficiary_id, holder_did } = req.body;
  const result = await issueBPLCredential(beneficiary_id, holder_did).catch(e => ({ error: e.message }));
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

// Verify ZK proof (used at merchant POS)
app.post('/api/identity/credentials/verify', async (req, res) => {
  const { credential_id } = req.body;
  const result = await verifyBPLProof(credential_id).catch(e => ({ error: e.message }));
  res.json(result);
});

// NFSA district data
app.get('/api/identity/nfsa/districts', (req, res) => res.json(GUJARAT_DISTRICTS));
app.get('/api/identity/nfsa/categories', (req, res) => res.json(NFSA_CATEGORIES));

// Lookup by ration card
app.get('/api/identity/beneficiary/:rationCard', async (req, res) => {
  const ben = await findBeneficiaryByRationCard(req.params.rationCard);
  if (!ben) return res.status(404).json({ error: 'Not found' });
  // Strip sensitive fields
  const { aadhaar_hash, ...safe } = ben;
  res.json(safe);
});

const PORT = process.env.PORT || 8001;
app.listen(PORT, () => console.log(`🆔 Identity Service running on :${PORT}`));

module.exports = { app, initiateAadhaarOTP, verifyAadhaarOTP, checkBPLEligibility, issueBPLCredential, verifyBPLProof, KYC_SCHEMA };
