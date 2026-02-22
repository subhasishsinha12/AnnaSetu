/**
 * AnnaSetu Layer 02: ONDC Seller Node (Supermarket)
 * Beckn Protocol: /search /select /init /confirm /track
 */
require('dotenv').config({ path: '../../.env' });
const express = require('express');
const app = express();
app.use(express.json());
const PORT = process.env.ONDC_SELLER_PORT || 3002;

const ack = (res) => res.json({ message: { ack: { status: 'ACK' } } });

// Beckn API endpoints
app.post('/search', (req, res) => { console.log('[Seller] /search from:', req.body.context?.bap_id); ack(res); });
app.post('/select', (req, res) => { console.log('[Seller] /select'); ack(res); });
app.post('/init',   (req, res) => { console.log('[Seller] /init');   ack(res); });
app.post('/confirm',(req, res) => { console.log('[Seller] /confirm — Lot reserved'); ack(res); });
app.post('/status', (req, res) => ack(res));
app.post('/track',  (req, res) => ack(res));
app.get('/health', (req, res) => res.json({ status: 'healthy', service: 'ondc-seller-node' }));

app.listen(PORT, () => console.log(`ONDC Seller Node :${PORT}`));
module.exports = app;
