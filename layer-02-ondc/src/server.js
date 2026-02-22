require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const logger = require('./utils/logger');
const beckn = require('./routes/beckn');
const ngo = require('./routes/ngo');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'healthy', service: 'AnnaSetu ONDC Gateway', layer: '02' }));

// Beckn Protocol endpoints
app.use('/ondc/v1', beckn);
// NGO management
app.use('/api/v1/ngo', ngo);

app.listen(process.env.ONDC_PORT || 3002, () => {
  logger.info('AnnaSetu ONDC Gateway (Layer 02) running on port ' + (process.env.ONDC_PORT || 3002));
});

module.exports = app;
