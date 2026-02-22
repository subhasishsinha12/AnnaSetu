# 🌾 AnnaSetu — India's Blockchain-Enabled Food Bridge

> **Connecting Food Surplus to Food Security via Digital Public Infrastructure**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.11-blue.svg)](https://python.org/)
[![Hyperledger Fabric](https://img.shields.io/badge/Hyperledger-Fabric_2.5-orange.svg)](https://hyperledger-fabric.readthedocs.io/)
[![Polygon](https://img.shields.io/badge/Polygon-zkEVM-purple.svg)](https://polygon.technology/)

---

## 🎯 Vision

AnnaSetu (**अन्न सेतु** — "Food Bridge") is India's first blockchain-verified, choice-based supplementary food security platform that connects:

- 🏪 **₹1.52 lakh crore** in annual food waste from organized retail
- 🌾 **200 million** undernourished Indians
- 💳 **56 crore** Jan Dhan account holders
- 📡 India's **Digital Public Infrastructure** (ONDC + Aadhaar + UPI + Blockchain)

Inspired by France's Garot Law (2016) and adapted for India's unique JAM Trinity ecosystem.

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    AnnaSetu Platform                            │
├─────────────────┬───────────────────────────────────────────────┤
│  LAYER 01       │  Donor Integration (Supermarket POS/ERP)      │
│  LAYER 02       │  ONDC Commerce Network (Beckn Protocol)       │
│  LAYER 03       │  Blockchain Core (Hyperledger + Polygon L2)   │
│  LAYER 04       │  Identity & JAM (Aadhaar + NFSA + Mobile)     │
│  LAYER 05       │  Financial Layer (IDBI Bank + e-RUPI + UPI)   │
│  LAYER 06       │  Beneficiary Access (Web + Kirana POS)        │
└─────────────────┴───────────────────────────────────────────────┘
```

---

## 📁 Repository Structure

```
AnnaSetu/
├── layer-01-donor/          # Supermarket POS integration & surplus detection
│   ├── src/
│   │   ├── api/             # Express.js REST endpoints
│   │   ├── services/        # Expiry detection, IoT sensor integration
│   │   └── models/          # Mongoose data models
│   └── tests/
├── layer-02-ondc/           # ONDC Beckn Protocol integration
│   ├── seller-node/         # Surplus food seller app
│   ├── buyer-node/          # NGO buyer application
│   └── gateway-config/      # ONDC gateway configuration
├── layer-03-blockchain/     # Hyperledger Fabric + Polygon
│   ├── chaincode/           # Smart contracts (Node.js chaincode)
│   ├── network/             # Fabric network configuration
│   └── polygon/             # Solidity contracts + Polygon ID
├── layer-04-identity/       # Aadhaar eKYC + NFSA integration
│   ├── kyc-service/         # Python FastAPI service
│   └── zk-proof/            # Polygon ID ZK credential service
├── layer-05-finance/        # e-RUPI, Jan Dhan, UPI settlement
│   ├── erupi-service/       # Voucher issuance microservice
│   ├── escrow/              # Trust escrow management
│   └── upi-settlement/      # UPI payment processing
├── layer-06-beneficiary/    # Beneficiary & Kirana frontends
│   ├── web-app/             # React + Tailwind (beneficiary portal)
│   └── kirana-pos/          # Merchant redemption interface
├── docs/                    # Architecture docs, API specs, diagrams
├── infra/                   # Docker Compose, Kubernetes manifests
└── .github/workflows/       # CI/CD pipelines
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 20.x
- Python 3.11+
- Docker & Docker Compose
- Hyperledger Fabric 2.5 binaries

### 1. Clone & Install
```bash
git clone https://github.com/subhasishsinha12/AnnaSetu.git
cd AnnaSetu
cp .env.example .env
```

### 2. Start Full Stack (Development)
```bash
docker-compose up -d
```

### 3. Initialize Blockchain Network
```bash
cd layer-03-blockchain/network
./network.sh up createChannel -c annasetu-channel
./network.sh deployCC -ccn annasetu -ccp ../chaincode -ccl javascript
```

### 4. Seed Demo Data
```bash
npm run seed:donors
npm run seed:beneficiaries
```

---

## 🔧 Layer-by-Layer Development

| Layer | Tech Stack | Port | Status |
|-------|-----------|------|--------|
| Donor API | Node.js + Express + MongoDB | 3001 | 🟡 In Development |
| ONDC Gateway | Node.js + Beckn Protocol | 3002 | 🟡 In Development |
| Blockchain | Hyperledger Fabric + Polygon | 7050-7054 | 🟡 In Development |
| Identity | Python FastAPI | 8001 | 🟡 In Development |
| Finance | Node.js + e-RUPI SDK | 3003 | 🟡 In Development |
| Beneficiary UI | React + Vite | 5173 | 🟡 In Development |

---

## 🏦 Key Integrations

| Integration | Purpose | API |
|-------------|---------|-----|
| ONDC | Surplus food marketplace | Beckn Protocol 1.1 |
| Hyperledger Fabric | Private supply chain ledger | Fabric SDK v2.5 |
| Polygon zkEVM | Public audit trail | EVM JSON-RPC |
| Aadhaar eKYC | Beneficiary identity | UIDAI Sandbox |
| e-RUPI (NPCI) | Food voucher issuance | NPCI e-RUPI API |
| UPI | Merchant settlement | NPCI UPI API |
| Jan Dhan | Beneficiary wallet | PMJDY API |

---

## 📊 Impact Targets (Phase 1 Pilot — Surat)

| Metric | Target |
|--------|--------|
| Food waste diverted/month | 50 tonnes |
| Beneficiary families | 10,000 |
| Participating retailers | 25 |
| NGO partners | 5 |
| Monthly food credits issued | ₹1 Cr |

---

## 🤝 Policy Framework

- **France Garot Law** precedent for mandatory food donation
- **FSSAI Surplus Food Regulations 2019** compliance
- **RBI PPI Master Direction** for e-RUPI food credits
- **NFSA Section 12** statutory authority for food credit distribution
- **Companies Act 2013 § 135** CSR funding framework
- **DPDP Act 2023** privacy compliance

---

## 📜 License

MIT License — See [LICENSE](LICENSE)

---

## 👥 Team

**Developed by IDBI Bank, Surat Branch**
- Concept: i-Rishi Framework (Vedic AI Risk Management)
- Initiative: AnnaSetu — India's Food Bridge

---

*"अन्न वसुधैव कुटुम्बकम् — Food is the Universal Family"*
