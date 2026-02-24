/**
 * AnnaSetu — Layer 01: Donor API Server
 * Express + PostgreSQL + node-cron
 */

'use strict';

const express      = require('express');
const helmet       = require('helmet');
const cors         = require('cors');
const morgan       = require('morgan');
const compression  = require('compression');
const { Pool }     = require('pg');
const cron         = require('node-cron');
const crypto       = require('crypto');

const donorRoutes   = require('./routes/donors');
const lotRoutes     = require('./routes/lots');
const certRoutes    = require('./routes/certificates');
const webhookRoutes = require('./routes/webhooks');
const { runExpiryCron } = require('../cron/expiry-cron');

const app = express();

// ── DB Pool ───────────────────────────────────────────────────────────────────
const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'annasetu',
  user:     process.env.DB_USER     || 'annasetu',
  password: process.env.DB_PASS     || 'annasetu_dev',
  max:      20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => console.error('Unexpected PG error', err));
app.locals.db = pool;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(compression());
app.use(morgan('combined'));

// Raw body needed for HMAC webhook verification
app.use('/api/webhooks', express.raw({ type: 'application/json' }), webhookRoutes);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/donors',       donorRoutes);
app.use('/api/lots',         lotRoutes);
app.use('/api/certificates', certRoutes);

// Health
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', service: 'annasetu-donor-api', ts: new Date() });
  } catch (e) {
    res.status(503).json({ status: 'error', message: e.message });
  }
});

// ── Cron Jobs ─────────────────────────────────────────────────────────────────
// Run every 6 hours: check expiring lots and send alerts
cron.schedule('0 */6 * * *', () => {
  console.log('[CRON] Running expiry check…');
  runExpiryCron(pool).catch(console.error);
});

// Run daily at 8 AM IST: generate 80G certificates for previous day donations
cron.schedule('30 2 * * *', () => {   // 02:30 UTC = 08:00 IST
  console.log('[CRON] Running daily 80G certificate generation…');
  require('../cron/cert-generator-cron')(pool).catch(console.error);
});

// ── Error Handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    code:  err.code    || 'SERVER_ERROR',
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🌾 Donor API running on :${PORT}`));

module.exports = { app, pool };
