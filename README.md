# 🌾 AnnaSetu — India's Digital Food Bridge

> **Connecting 78 million tonnes of food surplus to 200 million undernourished Indians through Blockchain, ONDC, e-RUPI and Jan Dhan.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)](https://nodejs.org)
[![Python](https://img.shields.io/badge/Python-3.11-blue.svg)](https://python.org)
[![Hyperledger Fabric](https://img.shields.io/badge/Hyperledger-Fabric_2.5-2F3134.svg)](https://hyperledger.org)

---

## Architecture Overview

AnnaSetu is a 6-layer digital public infrastructure that routes surplus food from organised retail to BPL families via blockchain-verified, choice-based food credits.

```
LAYER 01 | Donor Integration    | Supermarket POS → ONDC API
LAYER 02 | ONDC Network         | Beckn Protocol Commerce
LAYER 03 | Blockchain Core      | Hyperledger Fabric + Polygon
LAYER 04 | Identity & JAM       | Aadhaar eKYC + NFSA
LAYER 05 | Financial Layer      | IDBI Bank + e-RUPI + UPI
LAYER 06 | Beneficiary Access   | React Web + Kirana POS
```

## Repository Structure

```
AnnaSetu/
├── layer-01-donor/          # Supermarket POS integration & surplus detection
├── layer-02-ondc/           # ONDC Beckn Protocol — seller/buyer nodes
├── layer-03-blockchain/     # Hyperledger Fabric chaincode + Polygon contracts
├── layer-04-identity/       # Aadhaar eKYC + NFSA registry + ZK proofs
├── layer-05-finance/        # e-RUPI issuance + escrow + UPI settlement
├── layer-06-beneficiary/    # Beneficiary web portal + Kirana POS app
├── docs/                    # API specs, architecture docs
├── infra/                   # Docker Compose, Kubernetes manifests
└── .github/workflows/       # CI/CD pipelines
```

## Quick Start

```bash
git clone https://github.com/subhasishsinha12/AnnaSetu.git
cd AnnaSetu
cp .env.example .env
docker-compose up -d
```

## API Endpoints

| Service | Port |
|---------|------|
| Donor API | 3001 |
| ONDC Seller | 3002 |
| ONDC Buyer | 3003 |
| Identity Service | 8001 |
| e-RUPI Service | 3005 |
| Beneficiary Portal | 3000 |

## Developed by
IDBI Bank, Surat Branch — AnnaSetu Initiative  
Concept: Major Subhasish Sinha, AGM & Branch Head  
