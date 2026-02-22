/**
 * AnnaSetu Layer 01: Donor Integration API
 * Surplus food detection, ONDC broadcast, IoT telemetry
 */
require('dotenv').config({ path: '../.env' });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const app = express();
const PORT = process.env.DONOR_API_PORT || 3001;

app.use(helmet());
app.use(cors());
app.use(express.json());

// Request logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/v1/surplus', require('./routes/surplus'));
app.use('/api/v1/donors',  require('./routes/donor'));
app.use('/api/v1/lots',    require('./routes/lot'));
app.use('/health', require('./routes/health'));

// 404
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

// Error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

const server = app.listen(PORT, () => {
  console.log(`AnnaSetu Donor API running on :${PORT}`);
});

// Graceful shutdown for CI
process.on('SIGTERM', () => server.close());

module.exports = app;
