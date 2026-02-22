const mongoose = require('mongoose');

const surplusListingSchema = new mongoose.Schema({
  lotId: { type: String, required: true, unique: true },
  donorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Donor', required: true },
  inventoryItems: [{ type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem' }],
  summary: {
    totalItems: Number,
    totalWeight_kg: Number,
    categories: [String],
    coldChainRequired: Boolean
  },
  ondcListing: {
    listingId: String, status: String,
    broadcastAt: Date, matchedNgoId: String,
    confirmedAt: Date
  },
  blockchain: {
    hyperledgerTxId: String,
    polygonTxHash: String,
    recordedAt: Date
  },
  collection: {
    scheduledTime: Date,
    logisticsPartner: String,
    vehicleNo: String,
    driverContact: String,
    actualPickupTime: Date,
    sfdo: {
      id: String, name: String,
      fssaiNo: String, acceptedAt: Date
    }
  },
  taxCertificate: {
    certificateNo: String,
    issuedAt: Date,
    donationValue: Number,
    eligible80GAmount: Number,
    polygonHash: String
  },
  status: {
    type: String,
    enum: ['pending', 'listed', 'matched', 'collected', 'distributed', 'cancelled'],
    default: 'pending'
  }
}, { timestamps: true });

module.exports = mongoose.model('SurplusListing', surplusListingSchema);
