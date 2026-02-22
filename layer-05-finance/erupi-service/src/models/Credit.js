const mongoose = require('mongoose');
const creditSchema = new mongoose.Schema({
  creditId: { type: String, unique: true, required: true },
  beneficiaryAadhaarHash: { type: String, required: true },
  beneficiaryMobile: { type: String, required: true },
  rationCardNo: String,
  familySize: { type: Number, required: true },
  nfsaCategory: { type: String, enum: ['AAY', 'PHH', 'NPHH'], required: true },
  amount: { type: Number, required: true },
  redeemedAmount: { type: Number, default: 0 },
  currency: { type: String, default: 'INR' },
  donorLotId: String,
  issuedBy: { type: String, default: 'IDBI_BANK_SURAT' },
  expiryDate: { type: Date, required: true },
  erupiVoucherId: String,
  erupiQrString: String,
  status: { type: String, enum: ['active', 'exhausted', 'expired', 'cancelled'], default: 'active' },
  redemptions: [{ merchantId: String, merchantUpiId: String, items: mongoose.Schema.Types.Mixed, amount: Number, upiTxId: String, redeemedAt: Date }],
  blockchainTxHash: String,
  polygonTxHash: String
}, { timestamps: true });
creditSchema.index({ beneficiaryAadhaarHash: 1 });
creditSchema.index({ rationCardNo: 1 });
creditSchema.index({ expiryDate: 1, status: 1 });
module.exports = mongoose.model('Credit', creditSchema);
