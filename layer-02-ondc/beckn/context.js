const { v4: uuidv4 } = require('uuid');
const buildContext = ({ action, city = 'std:0261', bap_id, bap_uri, bpp_id, bpp_uri }) => ({
  domain: 'nic2004:01400',
  country: 'IND', city, action,
  core_version: '1.1.0',
  transaction_id: uuidv4(),
  message_id: uuidv4(),
  timestamp: new Date().toISOString(),
  ttl: 'PT30S',
  bap_id, bap_uri,
  ...(bpp_id && { bpp_id }),
  ...(bpp_uri && { bpp_uri })
});
module.exports = { buildContext };
