require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const cron = require('node-cron');
const logger = require('./utils/logger');
const donorRoutes = require('./api/donors');
const surplusRoutes = require('./api/surplus');
const inventoryRoutes = require('./api/inventory');
const { runExpiryDetection } = require('./services/expiryDetectionService');

const app = express();
const PORT = process.env.DONOR_API_PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));

// Health check
app.get('/health', (req, res) => res.json({ 
  status: 'healthy', 
  service: 'AnnaSetu Donor API',
  layer: '01',
  timestamp: new Date().toISOString()
}));

// Routes
app.use('/api/v1/donors', donorRoutes);
app.use('/api/v1/surplus', surplusRoutes);
app.use('/api/v1/inventory', inventoryRoutes);

// Error handler
app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Database
mongoose.connect(process.env.MONGO_URI)
  .then(() => logger.info('MongoDB connected'))
  .catch(err => logger.error('MongoDB connection error:', err));

// Cron: Run expiry detection every 30 minutes
cron.schedule('*/30 * * * *', async () => {
  logger.info('Running scheduled expiry detection...');
  await runExpiryDetection();
});

app.listen(PORT, () => {
  logger.info(`AnnaSetu Donor API (Layer 01) running on port ${PORT}`);
});

module.exports = app;
