# AnnaSetu Hyperledger Fabric Network

## Network Topology

```
Organizations:
  - DonorOrg (supermarkets)     → peer0.donor.annasetu.com
  - NGOOrg (SFDOs/NGOs)         → peer0.ngo.annasetu.com
  - BankOrg (IDBI Bank)         → peer0.bank.annasetu.com
  - GovernmentOrg (FSSAI/NITI)  → peer0.govt.annasetu.com

Channel: annasetu-channel
Chaincode: surplus-food-cc (Node.js)
Orderer: orderer.annasetu.com (Raft consensus)
```

## Setup (Local Dev with Fabric test-network)

```bash
# 1. Install Hyperledger Fabric binaries
curl -sSL https://bit.ly/2ysbOFE | bash -s

# 2. Start test network
cd fabric-samples/test-network
./network.sh up createChannel -c annasetu-channel

# 3. Deploy chaincode
./network.sh deployCC -ccn surplus-food-cc \
  -ccp ../../layer-03-blockchain/chaincode/surplus-food \
  -ccl javascript

# 4. Interact with chaincode
peer chaincode invoke -C annasetu-channel -n surplus-food-cc \
  -c '{"function":"CreateLot","Args":["LOT-001","DONOR-001","STORE-001","[]","2026-03-01","false"]}'
```
