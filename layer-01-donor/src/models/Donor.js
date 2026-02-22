const mongoose = require('mongoose');

const donorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { 
    type: String, 
    enum: ['supermarket', 'hotel', 'restaurant', 'cloud_kitchen', 'food_processor', 'caterer'],
    required: true 
  },
  gstin: { type: String, required: true, unique: true },
  pan: { type: String, required: true },
  fssaiLicenseNo: { type: String, required: true },
  address: {
    line1: String, line2: String,
    city: String, state: String,
    pincode: String,
    coordinates: { lat: Number, lng: Number }
  },
  contact: { name: String, email: String, phone: String },
  posSystem: { 
    type: { type: String, enum: ['SAP', 'OracleRetail', 'Tally', 'Custom', 'Other'] },
    version: String,
    apiEndpoint: String,
    apiKey: String
  },
  bankAccount: {
    ifsc: String, accountNo: String,
    bankName: String, upiId: String
  },
  ondc: {
    subscriberId: String, sellerNodeId: String,
    registeredAt: Date
  },
  blockchain: {
    hyperledgerOrgId: String,
    walletAddress: String
  },
  taxCertificates: [{
    year: String, certificateUrl: String,
    totalDonationValue: Number, 
    generatedAt: Date
  }],
  csr: {
    totalFoodDonated_kg: { type: Number, default: 0 },
    totalDonations: { type: Number, default: 0 },
    estimatedTaxBenefit: { type: Number, default: 0 }
  },
  isActive: { type: Boolean, default: true },
  onboardedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Donor', donorSchema);
