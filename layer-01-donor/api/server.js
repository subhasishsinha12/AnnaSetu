/**
 * AnnaSetu Layer 01: Donor Integration API
 * Supermarket surplus food detection, listing, ONDC broadcast
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

// Routes
app.use('/api/v1/surplus', require('./routes/surplus'));
app.use('/api/v1/donors', require('./routes/donor'));
app.use('/api/v1/lots', require('./routes/lot'));
app.use('/health', require('./routes/health'));

app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => console.log(`AnnaSetu Donor API running on :${PORT}`));
module.exports = app;
