require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const logger = require('../utils/logger');
const Credit = require('../models/Credit');

const router = express.Router();

// POST /api/v1/credits/issue - Issue food credit to beneficiary
router.post('/issue', async (req, res) => {
  try {
    const { beneficiaryAadhaarHash, beneficiaryMobile, rationCardNo, familySize, nfsaCategory, donorLotId } = req.body;
    const baseAmount = nfsaCategory === 'AAY' ? 500 : 300;
    const totalAmount = Math.min(baseAmount * familySize, 2500);
    const creditId = `ANSC-${Date.now()}-${uuidv4().slice(0,6).toUpperCase()}`;
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30);

    const erupiVoucher = await issueERupiVoucher({ voucherId: creditId, beneficiaryMobile, amount: totalAmount, expiryDate: expiryDate.toISOString() });
    const credit = await Credit.create({ creditId, beneficiaryAadhaarHash, beneficiaryMobile, rationCardNo, familySize, nfsaCategory, amount: totalAmount, donorLotId, expiryDate, erupiVoucherId: erupiVoucher.voucherId, erupiQrString: erupiVoucher.qrString, status: 'active' });
    const qrImageUrl = await QRCode.toDataURL(erupiVoucher.qrString);
    logger.info('Food credit issued: ' + creditId + ' | Rs.' + totalAmount);
    res.status(201).json({ success: true, creditId, amount: totalAmount, currency: 'INR', expiryDate, qrCode: qrImageUrl, smsMessage: erupiVoucher.smsMessage, usageInstructions: { en: 'Show this QR/SMS code at any AnnaSetu-registered grocery store.', gu: 'AnnaSetu-નોંધાયેલ કિરાણા પર આ QR/SMS કોડ બતાવો.', hi: 'AnnaSetu-पंजीकृत किराने पर यह QR/SMS कोड दिखाएं।' } });
  } catch (err) {
    logger.error('Credit issue error: ' + err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/credits/redeem
router.post('/redeem', async (req, res) => {
  try {
    const { creditId, merchantId, merchantUpiId, items, totalAmount } = req.body;
    const credit = await Credit.findOne({ creditId, status: 'active' });
    if (!credit) return res.status(404).json({ error: 'Credit not found or already used' });
    if (new Date() > credit.expiryDate) return res.status(400).json({ error: 'Credit expired' });
    if (totalAmount > credit.amount - credit.redeemedAmount) return res.status(400).json({ error: 'Insufficient credit balance' });
    const upiTxId = await processUpiPayment({ toUpiId: merchantUpiId, amount: totalAmount, remarks: 'AnnaSetu food credit ' + creditId });
    await Credit.findByIdAndUpdate(credit._id, { $inc: { redeemedAmount: totalAmount }, $push: { redemptions: { merchantId, merchantUpiId, items, amount: totalAmount, upiTxId, redeemedAt: new Date() } }, status: credit.redeemedAmount + totalAmount >= credit.amount ? 'exhausted' : 'active' });
    logger.info('Credit redeemed: ' + creditId + ' | Rs.' + totalAmount + ' | UPI: ' + upiTxId);
    res.json({ success: true, upiTransactionId: upiTxId, amountPaid: totalAmount, remainingBalance: credit.amount - credit.redeemedAmount - totalAmount });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/credits/:creditId/balance
router.get('/:creditId/balance', async (req, res) => {
  try {
    const credit = await Credit.findOne({ creditId: req.params.creditId });
    if (!credit) return res.status(404).json({ error: 'Credit not found' });
    res.json({ creditId: credit.creditId, totalAmount: credit.amount, redeemedAmount: credit.redeemedAmount, balance: credit.amount - credit.redeemedAmount, status: credit.status, expiryDate: credit.expiryDate });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

async function issueERupiVoucher({ voucherId, beneficiaryMobile, amount, expiryDate }) {
  if (process.env.NODE_ENV === 'development') {
    return {
      voucherId,
      qrString: 'upi://pay?pa=annasetu@idbi&pn=AnnaSetu&am=' + amount + '&tn=' + voucherId + '&cu=INR',
      smsMessage: 'Your AnnaSetu food credit of Rs.' + amount + ' is ready. Voucher: ' + voucherId + '. Show at any AnnaSetu store.'
    };
  }
  const token = await getERupiToken();
  const response = await axios.post(process.env.ERUPI_API_URL + '/voucher/issue',
    { voucherId, mobile: beneficiaryMobile, amount, purpose: 'FOOD_NUTRITION', expiryDate },
    { headers: { Authorization: 'Bearer ' + token } }
  );
  return response.data;
}

async function processUpiPayment({ toUpiId, amount, remarks }) {
  if (process.env.NODE_ENV === 'development') return 'MOCK-UPI-' + Date.now();
  const response = await axios.post(process.env.UPI_API_URL + '/pay', { payee: toUpiId, amount, currency: 'INR', remarks });
  return response.data.transactionId;
}

async function getERupiToken() {
  const r = await axios.post(process.env.ERUPI_API_URL + '/auth/token', { client_id: process.env.ERUPI_CLIENT_ID, client_secret: process.env.ERUPI_CLIENT_SECRET, grant_type: 'client_credentials' });
  return r.data.access_token;
}

module.exports = router;
