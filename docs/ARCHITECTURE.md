# AnnaSetu Technical Architecture

## Overview

AnnaSetu uses a **six-layer microservices architecture** designed around India's Digital Public Infrastructure (DPI):

```
┌──────────────────────────────────────────────────────────────┐
│                  Governance Layer                            │
│  NITI Aayog · FSSAI · RBI · DPIIT/ONDC                     │
└──────────────────────────────────────────────────────────────┘
         │ Policy & Standards
         ▼
┌──────────────────────────────────────────────────────────────┐
│  L1: Donor      │  Supermarket POS/ERP → Surplus Detection  │
│  L2: ONDC       │  Beckn Protocol → NGO Matching            │
│  L3: Blockchain │  Hyperledger Fabric + Polygon L2          │
│  L4: Identity   │  Aadhaar eKYC + NFSA Registry             │
│  L5: Finance    │  IDBI Bank + e-RUPI + UPI Settlement      │
│  L6: Beneficiary│  React Web App + Kirana POS               │
└──────────────────────────────────────────────────────────────┘
```

## Tech Stack Matrix

| Layer | Language | Framework | Database | External APIs |
|-------|----------|-----------|----------|---------------|
| 01 Donor | Node.js 20 | Express 4.x | MongoDB 7 | ONDC Beckn, Fabric SDK |
| 02 ONDC | Node.js 20 | Express 4.x | Redis | ONDC Gateway |
| 03 Blockchain | Node.js (chaincode), Solidity | Fabric 2.5, Hardhat | Fabric Ledger, Polygon zkEVM | - |
| 04 Identity | Python 3.11 | FastAPI 0.104 | - | UIDAI eKYC, NFSA API |
| 05 Finance | Node.js 20 | Express 4.x | MongoDB 7 | NPCI e-RUPI, UPI |
| 06 Beneficiary | TypeScript | React 18 + Vite | - | All backend APIs |

## Blockchain Architecture

### Hyperledger Fabric (Private Chain)
- **Purpose**: Private supply chain events (competitive data between retail chains)
- **Channels**: One channel per retail chain consortium
- **Endorsement Policy**: 2-of-3 org endorsement for collection events
- **Throughput**: 3,000+ TPS, zero gas fees

### Polygon zkEVM (Public Chain)
- **Purpose**: Public audit trail, tax certificate hashes, impact metrics
- **Smart Contract**: `AnnaSetuTransparency.sol`
- **Cost**: ~$0.001 per transaction
- **Accessibility**: Any citizen can verify donation/credit hashes

### Cross-Chain Bridge
- Hyperledger records full supply chain data
- Anonymised hash pushed to Polygon for public verifiability
- Polygon ID ZK proofs verify BPL eligibility without exposing Aadhaar

## Data Privacy Architecture

```
Raw Aadhaar Number
        │
        ▼ SHA-256 (irreversible)
   Aadhaar Hash ──── Stored on Hyperledger (private)
        │
        ▼ Polygon ID ZK Proof
   "User is BPL eligible" ──── Verified without revealing identity
```

**DPDP Act 2023 Compliance:**
- No raw biometric data stored anywhere
- Only SHA-256 hash of Aadhaar on private Hyperledger
- ZK proofs for beneficiary eligibility verification
- Right to erasure: Hash deletion removes all on-chain linkability
- Purpose limitation: Data used only for food credit issuance

## ONDC Integration

### Surplus Food Domain Taxonomy
```
domain: "nic2004:52110"  # Grocery/surplus food
categories:
  - surplus-food
    subcategories:
      - perishable
      - packaged
      - fresh_produce
      - dairy
      - bakery
      - prepared
```

### Beckn Protocol Flow
```
Supermarket POS                    NGO Buyer App
     │                                  │
     │ POST /search (surplus food)       │
     │ ──────────────────────────────►  │
     │                                  │
     │ POST /select (confirm interest)   │
     │ ◄──────────────────────────────  │
     │                                  │
     │ POST /init (initiate pickup)      │
     │ ──────────────────────────────►  │
     │                                  │
     │ POST /confirm (confirmed)         │
     │ ◄──────────────────────────────  │
     │                                  │
     │ POST /track (logistics update)    │
     │ ──────────────────────────────►  │
```
