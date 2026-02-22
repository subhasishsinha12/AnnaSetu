/**
 * AnnaSetu Layer 02: ONDC Buyer Node (NGO/SFDO)
 * Handles callbacks + allows NGO to search surplus
 */
require('dotenv').config({ path: '../../.env' });
const express = require('express');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const app = express();
app.use(express.json());
const PORT = process.env.ONDC_BUYER_PORT || 3003;

const ack = (res) => res.json({ message: { ack: { status: 'ACK' } } });

// Callbacks from seller
app.post('/on_search',  (req, res) => { console.log('[Buyer] on_search catalog received'); ack(res); });
app.post('/on_select',  (req, res) => { console.log('[Buyer] on_select'); ack(res); });
app.post('/on_init',    (req, res) => { console.log('[Buyer] on_init'); ack(res); });
app.post('/on_confirm', (req, res) => { console.log('[Buyer] on_confirm — Logistics initiated'); ack(res); });
app.post('/on_track',   (req, res) => ack(res));

// NGO UI triggers search
app.post('/api/search-surplus', async (req, res) => {
  try {
    const { city = 'std:0261', categories = [] } = req.body;
    const payload = {
      context: {
        domain: 'nic2004:01400', country: 'IND', city,
        action: 'search', core_version: '1.1.0',
        transaction_id: uuidv4(), message_id: uuidv4(),
        timestamp: new Date().toISOString(),
        bap_id: process.env.ONDC_SUBSCRIBER_ID || 'annasetu.ngo.example.com',
        bap_uri: `http://localhost:${PORT}`
      },
      message: { intent: { item: { descriptor: { tags: ['surplus', ...categories] } } } }
    };
    const sellerUrl = process.env.ONDC_SELLER_URL || 'http://localhost:3002';
    const resp = await axios.post(`${sellerUrl}/search`, payload, { timeout: 5000 });
    res.json({ success: true, transaction_id: payload.context.transaction_id, ack: resp.data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/health', (req, res) => res.json({ status: 'healthy', service: 'ondc-buyer-node' }));
app.listen(PORT, () => console.log(`ONDC Buyer Node :${PORT}`));
module.exports = app;
