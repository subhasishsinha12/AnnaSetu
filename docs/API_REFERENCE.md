# AnnaSetu API Reference

## Base URLs

| Service | URL | Description |
|---------|-----|-------------|
| Donor API | `http://localhost:3001/api/v1` | Layer 01 - Supermarket integration |
| ONDC Gateway | `http://localhost:3002/api/v1` | Layer 02 - Beckn Protocol |
| Identity Service | `http://localhost:8001/api/v1` | Layer 04 - Aadhaar eKYC |
| Finance Service | `http://localhost:3003/api/v1` | Layer 05 - e-RUPI credits |

---

## Layer 01 — Donor API

### Onboard Donor
```http
POST /api/v1/donors
Content-Type: application/json

{
  "name": "DMart Surat",
  "type": "supermarket",
  "gstin": "24AAACR5055K1Z5",
  "fssaiLicenseNo": "10024022001234",
  "contact": {
    "name": "Store Manager",
    "email": "surat@dmart.in",
    "phone": "9876543210"
  },
  "address": {
    "city": "Surat",
    "state": "Gujarat",
    "pincode": "395001",
    "coordinates": { "lat": 21.1702, "lng": 72.8311 }
  }
}
```

### Add Inventory Item (POS Webhook)
```http
POST /api/v1/inventory
Content-Type: application/json

{
  "donorId": "65abc123",
  "productName": "Amul Full Cream Milk 500ml",
  "category": "dairy",
  "quantity": 120,
  "unit": "units",
  "expiryDate": "2026-02-24T00:00:00.000Z",
  "coldChainRequired": true,
  "storageTemp": { "min": 2, "max": 8, "unit": "celsius" }
}
```

### Trigger Expiry Detection
```http
POST /api/v1/surplus/trigger-detection
Content-Type: application/json

{ "donorId": "65abc123" }
```

### Mark Surplus as Collected
```http
PATCH /api/v1/surplus/{lotId}/collect
Content-Type: application/json

{
  "sfdoId": "SFDO-001",
  "sfdoName": "Feeding India Surat",
  "fssaiNo": "11222334455",
  "qualityApproved": true
}
```

---

## Layer 04 — Identity Service

### Verify Aadhaar (eKYC)
```http
POST /api/v1/kyc/verify
Content-Type: application/json

{
  "aadhaarNumber": "1234 5678 9012",
  "otp": "123456",
  "purpose": "beneficiary_onboarding"
}
```

**Response:**
```json
{
  "verified": true,
  "aadhaarHash": "a1b2c3d4...",
  "name": "Ramesh Patel",
  "dob": "1985-06-15",
  "gender": "M",
  "address": { "state": "Gujarat", "district": "Surat", "pincode": "395001" },
  "phoneLinked": true
}
```

### NFSA Eligibility Lookup
```http
POST /api/v1/nfsa/lookup
Content-Type: application/json

{
  "aadhaarHash": "a1b2c3d4...",
  "state": "Gujarat"
}
```

---

## Layer 05 — Finance Service

### Issue Food Credit
```http
POST /api/v1/credits/issue
Content-Type: application/json

{
  "beneficiaryAadhaarHash": "a1b2c3d4...",
  "beneficiaryMobile": "9876543210",
  "rationCardNo": "GJ-ST-001234",
  "familySize": 5,
  "nfsaCategory": "PHH",
  "donorLotId": "LOT-1234567890-ABCDEF"
}
```

**Response:**
```json
{
  "success": true,
  "creditId": "ANSC-1234567890-ABC123",
  "amount": 1500,
  "currency": "INR",
  "expiryDate": "2026-03-24",
  "qrCode": "data:image/png;base64,...",
  "smsMessage": "Your AnnaSetu food credit of Rs.1500 is ready...",
  "usageInstructions": {
    "en": "Show this QR/SMS code at any AnnaSetu-registered grocery store.",
    "gu": "AnnaSetu-નોંધાયેલ કિરાણા પર આ QR/SMS કોડ બતાવો.",
    "hi": "AnnaSetu-पंजीकृत किराने पर यह QR/SMS कोड दिखाएं।"
  }
}
```

### Redeem Credit at Merchant
```http
POST /api/v1/credits/redeem
Content-Type: application/json

{
  "creditId": "ANSC-1234567890-ABC123",
  "merchantId": "KIRANA-SU-001",
  "merchantUpiId": "kiranastore@upi",
  "items": [
    { "name": "Tomatoes", "qty": "2 kg", "price": 60 },
    { "name": "Toor Dal", "qty": "1 kg", "price": 120 },
    { "name": "Eggs", "qty": "12 pcs", "price": 84 }
  ],
  "totalAmount": 264
}
```
