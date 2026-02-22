const axios = require('axios');
const { createAuthHeader } = require('../utils/ondcAuth');
const logger = require('../utils/logger');

/**
 * ONDC Beckn Protocol Broadcast Service
 * Broadcasts surplus food listings to NGO Buyer Network Participants
 */
class OndcBroadcastService {
  constructor() {
    this.gatewayUrl = process.env.ONDC_GATEWAY_URL;
    this.subscriberId = process.env.ONDC_SUBSCRIBER_ID;
  }

  async broadcastSurplusFood(listingData) {
    const context = {
      domain: 'nic2004:52110', // Grocery/surplus food domain
      country: 'IND',
      city: 'std:0261', // Surat STD code — configurable per donor
      action: 'on_search',
      core_version: '1.1.0',
      bap_id: this.subscriberId,
      bap_uri: `https://${this.subscriberId}/ondc/v1`,
      bpp_id: `seller.${this.subscriberId}`,
      bpp_uri: `https://seller.${this.subscriberId}/ondc/v1`,
      transaction_id: listingData.listingId,
      message_id: `msg-${Date.now()}`,
      timestamp: new Date().toISOString(),
      ttl: 'PT30M'
    };

    const message = {
      catalog: {
        'bpp/descriptor': { name: 'AnnaSetu Surplus Food Network' },
        'bpp/providers': [{
          id: listingData.donorInfo.id,
          descriptor: { name: listingData.donorInfo.name },
          categories: [{ id: 'surplus-food', descriptor: { name: 'Surplus Food' } }],
          items: [{
            id: listingData.listingId,
            descriptor: {
              name: listingData.foodDetails.name,
              short_desc: `${listingData.foodDetails.quantity}${listingData.foodDetails.unit} available`,
              long_desc: JSON.stringify({
                category: listingData.foodDetails.category,
                coldChainRequired: listingData.foodDetails.coldChainRequired,
                expiryDate: listingData.foodDetails.expiryDate,
                nutritionInfo: listingData.foodDetails.nutritionInfo
              })
            },
            price: { currency: 'INR', value: '0' }, // Free surplus food
            quantity: {
              available: { 
                count: listingData.foodDetails.quantity,
                measure: { unit: listingData.foodDetails.unit, value: listingData.foodDetails.quantity }
              }
            },
            category_id: 'surplus-food',
            tags: [
              { code: 'surplus', value: 'true' },
              { code: 'expiry', value: listingData.foodDetails.expiryDate },
              { code: 'cold_chain', value: String(listingData.foodDetails.coldChainRequired) }
            ],
            location_id: listingData.donorInfo.location 
              ? `${listingData.donorInfo.location.lat},${listingData.donorInfo.location.lng}` 
              : undefined
          }]
        }]
      }
    };

    try {
      const authHeader = await createAuthHeader(context, this.subscriberId);
      const response = await axios.post(
        `${this.gatewayUrl}/search`,
        { context, message },
        { 
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': authHeader
          },
          timeout: 10000
        }
      );

      logger.info(`ONDC broadcast successful: ${listingData.listingId}`);
      return { listingId: listingData.listingId, ondcAck: response.data };
    } catch (error) {
      logger.error(`ONDC broadcast error: ${error.message}`);
      // Mock response for development
      if (process.env.NODE_ENV === 'development') {
        logger.warn('Using mock ONDC response in development mode');
        return { listingId: listingData.listingId, ondcAck: { message: { ack: { status: 'ACK' } } } };
      }
      throw error;
    }
  }
}

module.exports = new OndcBroadcastService();
