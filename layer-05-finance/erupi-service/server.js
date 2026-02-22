/**
 * AnnaSetu Layer 05: e-RUPI Food Credit Service
 * Issues purpose-specific food vouchers via NPCI e-RUPI infrastructure
 * Manages: Issuance → Delivery → Redemption → Settlement lifecycle
 */
require('dotenv').config({ path: '../../.env' });
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const app = express();
app.use(express.json());
const PORT = process.env.ERUPI_PORT || 3005;

// ── Food Credit Config ──
const CREDIT_CONFIG = {
  PHH: { monthlyINR: 1000, maxBalance: 10000 },   // Priority Household
  AAY: { monthlyINR: 1500, maxBalance: 10000 },   // Antyodaya Anna Yojana
  validityDays: 30,
  purposeCode: 'FOOD_NUTRITION',
  merchantCategory: 'GROCERY_FOOD'
};

// In-memory store (use PostgreSQL in production)
const vouchers = new Map();
const redemptions = [];

/**
 * POST /api/v1/vouchers/issue
 * Issue e-RUPI food voucher to beneficiary Jan Dhan account
 */
app.post('/api/v1/vouchers/issue', async (req, res) => {
  try {
    const { beneficiaryId, aadhaarHash, mobile, nfsaCategory, janDhanAccount, districtCode } = req.body;

    if (!beneficiaryId || !mobile || !nfsaCategory) {
      return res.status(400).json({ error: 'beneficiaryId, mobile, nfsaCategory required' });
    }

    const config = CREDIT_CONFIG[nfsaCategory] || CREDIT_CONFIG.PHH;
    const voucherId = `ERUPI-${uuidv4().substring(0, 10).toUpperCase()}`;
    const expiryDate = new Date(Date.now() + CREDIT_CONFIG.validityDays * 24 * 60 * 60 * 1000);

    const voucher = {
      voucherId,
      beneficiaryId,
      aadhaarHash,  // anonymized, stored for audit
      mobile,
      nfsaCategory,
      janDhanAccount,
      districtCode,
      amountINR: config.monthlyINR,
      balanceINR: config.monthlyINR,
      purposeCode: CREDIT_CONFIG.purposeCode,
      merchantCategory: CREDIT_CONFIG.merchantCategory,
      status: 'ACTIVE',
      issuedAt: new Date().toISOString(),
      expiryDate: expiryDate.toISOString(),
      qrData: generateQRData(voucherId, config.monthlyINR),
      smsString: generateSMSString(voucherId, config.monthlyINR, mobile)
    };

    vouchers.set(voucherId, voucher);

    // Emit event for Polygon recording (async in production)
    console.log(`[e-RUPI] Issued ${voucherId}: ₹${config.monthlyINR} for ${nfsaCategory} beneficiary`);

    res.status(201).json({
      success: true,
      voucherId,
      amountINR: config.monthlyINR,
      expiryDate: expiryDate.toISOString(),
      deliveryMethod: mobile ? 'SMS' : 'BRANCH',
      message: `Food credit of ₹${config.monthlyINR} issued successfully`
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * POST /api/v1/vouchers/redeem
 * Merchant redeems voucher at kirana/FPS — triggers UPI settlement
 */
app.post('/api/v1/vouchers/redeem', async (req, res) => {
  try {
    const { voucherId, merchantId, merchantUPI, amountINR, items } = req.body;

    const voucher = vouchers.get(voucherId);
    if (!voucher) return res.status(404).json({ error: 'Voucher not found' });
    if (voucher.status !== 'ACTIVE') return res.status(400).json({ error: `Voucher status: ${voucher.status}` });
    if (new Date(voucher.expiryDate) < new Date()) {
      voucher.status = 'EXPIRED';
      return res.status(400).json({ error: 'Voucher expired' });
    }
    if (amountINR > voucher.balanceINR) {
      return res.status(400).json({ error: `Insufficient balance: ₹${voucher.balanceINR} available` });
    }

    // Validate food-only purchase
    if (items) {
      const nonFoodItems = items.filter(i => !i.category?.includes('food') && !i.category?.includes('grocery'));
      if (nonFoodItems.length > 0) {
        return res.status(400).json({ error: 'e-RUPI food credits can only be used for food items', nonFoodItems });
      }
    }

    voucher.balanceINR -= amountINR;
    if (voucher.balanceINR <= 0) voucher.status = 'FULLY_REDEEMED';

    const redemptionId = `RDM-${uuidv4().substring(0, 8).toUpperCase()}`;
    const redemption = {
      redemptionId,
      voucherId,
      merchantId,
      merchantUPI,
      amountINR,
      items: items || [],
      redeemedAt: new Date().toISOString(),
      upiRefNo: `UPI${Date.now()}`
    };
    redemptions.push(redemption);

    console.log(`[e-RUPI] Redeemed ${voucherId}: ₹${amountINR} at merchant ${merchantId}`);
    res.json({
      success: true,
      redemptionId,
      amountINR,
      remainingBalance: voucher.balanceINR,
      upiRefNo: redemption.upiRefNo,
      merchantSettlementStatus: 'INITIATED',
      message: 'Payment successful — UPI settlement initiated'
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * GET /api/v1/vouchers/:voucherId
 */
app.get('/api/v1/vouchers/:voucherId', (req, res) => {
  const v = vouchers.get(req.params.voucherId);
  if (!v) return res.status(404).json({ error: 'Not found' });
  const { aadhaarHash, smsString, qrData, ...publicData } = v;
  res.json({ success: true, voucher: publicData });
});

/**
 * GET /api/v1/beneficiary/:beneficiaryId/vouchers
 */
app.get('/api/v1/beneficiary/:beneficiaryId/vouchers', (req, res) => {
  const beneficiaryVouchers = Array.from(vouchers.values())
    .filter(v => v.beneficiaryId === req.params.beneficiaryId)
    .map(({ aadhaarHash, smsString, qrData, ...v }) => v);
  res.json({ success: true, vouchers: beneficiaryVouchers });
});

app.get('/health', (req, res) => res.json({ status: 'healthy', service: 'erupi-service', version: '1.0.0' }));

function generateQRData(voucherId, amount) {
  return `annasetu://voucher?id=${voucherId}&amt=${amount}&purpose=FOOD`;
}
function generateSMSString(voucherId, amount, mobile) {
  return `Your AnnaSetu food credit of Rs.${amount} is ready. Voucher: ${voucherId}. Show at any authorised store. Valid 30 days.`;
}

app.listen(PORT, () => console.log(`AnnaSetu e-RUPI Service :${PORT}`));
module.exports = app;
