const { Gateway, Wallets } = require('fabric-network');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

/**
 * Hyperledger Fabric interaction service
 * Records all food donation events on private ledger
 */
class BlockchainService {
  constructor() {
    this.channelName = process.env.FABRIC_CHANNEL || 'annasetu-channel';
    this.chaincodeName = process.env.FABRIC_CHAINCODE || 'annasetu';
    this.connected = false;
  }

  async getGateway() {
    if (process.env.NODE_ENV === 'development' && !process.env.FABRIC_CA_URL?.includes('localhost')) {
      return null; // Mock mode
    }
    try {
      const ccpPath = path.resolve(__dirname, '../../..', 
        'layer-03-blockchain/network/organizations/peerOrganizations/org1.annasetu.com/connection-org1.json');
      const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));
      const walletPath = path.join(process.cwd(), 'wallet');
      const wallet = await Wallets.newFileSystemWallet(walletPath);
      const gateway = new Gateway();
      await gateway.connect(ccp, {
        wallet, identity: 'appUser',
        discovery: { enabled: true, asLocalhost: true }
      });
      return gateway;
    } catch (err) {
      logger.warn('Fabric gateway unavailable, using mock mode:', err.message);
      return null;
    }
  }

  async recordSurplusListing(data) {
    const gateway = await this.getGateway();
    if (!gateway) {
      const mockTxId = `MOCK-TX-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      logger.info(`[MOCK] Blockchain record: ${JSON.stringify(data)} | TxID: ${mockTxId}`);
      return mockTxId;
    }
    try {
      const network = await gateway.getNetwork(this.channelName);
      const contract = network.getContract(this.chaincodeName);
      const result = await contract.submitTransaction(
        'RecordSurplusListing',
        data.lotId, data.donorId, data.productName,
        String(data.quantity), data.expiryDate, data.ondcListingId
      );
      return result.toString();
    } finally {
      gateway.disconnect();
    }
  }

  async recordCollection(data) {
    const gateway = await this.getGateway();
    if (!gateway) {
      const mockTxId = `MOCK-COLLECT-${Date.now()}`;
      logger.info(`[MOCK] Collection recorded: ${JSON.stringify(data)}`);
      return mockTxId;
    }
    try {
      const network = await gateway.getNetwork(this.channelName);
      const contract = network.getContract(this.chaincodeName);
      const result = await contract.submitTransaction(
        'RecordCollection', data.lotId, data.sfdoId, data.collectedAt, data.qualityApproved.toString()
      );
      return result.toString();
    } finally {
      gateway.disconnect();
    }
  }

  async querySurplusHistory(lotId) {
    const gateway = await this.getGateway();
    if (!gateway) return [{ event: 'MOCK_HISTORY', lotId, timestamp: new Date().toISOString() }];
    try {
      const network = await gateway.getNetwork(this.channelName);
      const contract = network.getContract(this.chaincodeName);
      const result = await contract.evaluateTransaction('GetSurplusHistory', lotId);
      return JSON.parse(result.toString());
    } finally {
      gateway.disconnect();
    }
  }
}

module.exports = new BlockchainService();
