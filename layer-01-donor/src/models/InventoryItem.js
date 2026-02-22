const mongoose = require('mongoose');

const inventoryItemSchema = new mongoose.Schema({
  donorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Donor', required: true },
  lotId: { type: String, unique: true, required: true },
  productName: { type: String, required: true },
  category: { 
    type: String, 
    enum: ['perishable', 'packaged', 'fresh_produce', 'dairy', 'bakery', 'prepared'],
    required: true 
  },
  quantity: { type: Number, required: true },
  unit: { type: String, enum: ['kg', 'litres', 'units', 'packets'], required: true },
  manufactureDate: Date,
  expiryDate: { type: Date, required: true },
  batchNumber: String,
  storageTemp: { min: Number, max: Number, unit: { type: String, default: 'celsius' } },
  coldChainRequired: { type: Boolean, default: false },
  nutritionInfo: {
    calories: Number,
    protein: Number,
    carbs: Number,
    fat: Number
  },
  status: { 
    type: String, 
    enum: ['available', 'flagged', 'listed_ondc', 'collected', 'expired', 'wasted'],
    default: 'available'
  },
  iotSensorData: [{
    timestamp: Date,
    temperature: Number,
    humidity: Number,
    sensorId: String
  }],
  ondcListingId: String,
  blockchainTxId: String,
  flaggedAt: Date,
  collectedAt: Date,
}, { timestamps: true });

// Index for efficient expiry queries
inventoryItemSchema.index({ expiryDate: 1, status: 1 });
inventoryItemSchema.index({ donorId: 1, status: 1 });

// Virtual: hours to expiry
inventoryItemSchema.virtual('hoursToExpiry').get(function() {
  return Math.floor((this.expiryDate - new Date()) / (1000 * 60 * 60));
});

// Virtual: is near expiry
inventoryItemSchema.virtual('isNearExpiry').get(function() {
  const hours = this.hoursToExpiry;
  const threshold = this.category === 'perishable' 
    ? (process.env.EXPIRY_THRESHOLD_HOURS_PERISHABLE || 48)
    : (process.env.EXPIRY_THRESHOLD_DAYS_PACKAGED || 7) * 24;
  return hours <= threshold && hours > 0;
});

module.exports = mongoose.model('InventoryItem', inventoryItemSchema);
