# Layer 01 — Donor Integration

## Overview
Integrates supermarket POS/ERP systems with AnnaSetu to automatically detect and list near-expiry surplus food on ONDC.

## Architecture
```
Supermarket POS/ERP
       │
       │ Webhook (expiry flag)
       ▼
  Donor API (Express.js)
       │
       ├── ExpiryDetectionService  → Runs every 30min via cron
       ├── OndcBroadcastService    → Beckn Protocol broadcast
       └── BlockchainService       → Hyperledger Fabric record
```

## Setup
```bash
cd layer-01-donor
npm install
cp ../.env.example .env
# Edit .env with your MongoDB URI and other values
npm run dev
```

## Key Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/v1/donors | Onboard new supermarket donor |
| GET  | /api/v1/donors | List all active donors |
| POST | /api/v1/inventory | Add inventory item (POS webhook) |
| POST | /api/v1/inventory/bulk | Bulk upload from ERP |
| POST | /api/v1/inventory/iot-update | IoT cold chain sensor data |
| GET  | /api/v1/surplus | List available surplus food |
| POST | /api/v1/surplus/trigger-detection | Manual expiry scan |
| PATCH | /api/v1/surplus/:lotId/collect | Mark as collected |
| GET  | /api/v1/surplus/:lotId/history | Blockchain provenance |

## POS Integration
Point-of-sale systems should POST to `/api/v1/inventory/bulk` when near-expiry items are flagged:

```json
{
  "items": [
    {
      "donorId": "your_donor_id",
      "productName": "Amul Milk 500ml",
      "category": "dairy",
      "quantity": 50,
      "unit": "units",
      "expiryDate": "2026-02-24T00:00:00Z",
      "coldChainRequired": true
    }
  ]
}
```

## Environment Variables
See `../.env.example` for all required variables.
