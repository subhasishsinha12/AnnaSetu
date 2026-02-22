"""
AnnaSetu Layer 04: Aadhaar eKYC Service
FastAPI service mocking UIDAI Aadhaar OTP-based eKYC
In production: integrate with UIDAI Authentication API
"""
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional
import hashlib, uuid, logging
from datetime import datetime, timedelta

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("annasetu-kyc")

app = FastAPI(
    title="AnnaSetu Identity Service",
    description="Aadhaar eKYC + NFSA eligibility verification for AnnaSetu beneficiaries",
    version="1.0.0",
    docs_url="/docs"
)

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ── Pydantic Models ──
class OTPRequest(BaseModel):
    aadhaar_number: str = Field(..., min_length=12, max_length=12, description="12-digit Aadhaar number")
    mobile_last4: str = Field(..., min_length=4, max_length=4)

class OTPVerifyRequest(BaseModel):
    aadhaar_number: str
    otp: str
    session_id: str

class BeneficiaryOnboardRequest(BaseModel):
    aadhaar_number: str
    name: str
    mobile: str
    district: str
    state: str
    ration_card_no: Optional[str] = None
    jan_dhan_account: Optional[str] = None

class NFSALookupRequest(BaseModel):
    ration_card_no: str
    state: str

# ── In-memory session store (use Redis in prod) ──
otp_sessions: dict = {}

def _hash_aadhaar(aadhaar: str) -> str:
    """Double-hash Aadhaar: only hash stored on blockchain, never raw number"""
    first_hash = hashlib.sha256(aadhaar.encode()).hexdigest()
    return hashlib.sha256(first_hash.encode()).hexdigest()

# ── Endpoints ──

@app.get("/health")
def health():
    return {"status": "healthy", "service": "annasetu-identity", "version": "1.0.0"}

@app.post("/api/v1/kyc/send-otp", summary="Send OTP to Aadhaar-linked mobile")
async def send_otp(req: OTPRequest):
    """
    In production: calls UIDAI OTP API
    Mock: generates a fixed OTP 123456 for development
    """
    session_id = str(uuid.uuid4())
    otp_sessions[session_id] = {
        "aadhaar": req.aadhaar_number,
        "otp": "123456",  # Mock OTP
        "expires": (datetime.utcnow() + timedelta(minutes=10)).isoformat(),
        "verified": False
    }
    logger.info(f"OTP session created: {session_id} for Aadhaar xxxx-xxxx-{req.aadhaar_number[-4:]}")
    return {
        "success": True,
        "session_id": session_id,
        "message": f"OTP sent to mobile ending in {req.mobile_last4}",
        "expires_in_minutes": 10
    }

@app.post("/api/v1/kyc/verify-otp", summary="Verify OTP and get eKYC token")
async def verify_otp(req: OTPVerifyRequest):
    """Verify OTP and return KYC token + anonymized identity hash"""
    session = otp_sessions.get(req.session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid session ID")
    if session["otp"] != req.otp:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid OTP")
    if datetime.fromisoformat(session["expires"]) < datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OTP expired")

    session["verified"] = True
    aadhaar_hash = _hash_aadhaar(req.aadhaar_number)
    kyc_token = str(uuid.uuid4())

    logger.info(f"KYC verified for hash: {aadhaar_hash[:16]}...")
    return {
        "success": True,
        "kyc_token": kyc_token,
        "aadhaar_hash": aadhaar_hash,
        "verified_at": datetime.utcnow().isoformat(),
        "message": "Identity verified successfully"
    }

@app.post("/api/v1/beneficiary/onboard", summary="Onboard verified beneficiary")
async def onboard_beneficiary(req: BeneficiaryOnboardRequest):
    """Register beneficiary with anonymized identity — links Aadhaar hash to Jan Dhan"""
    aadhaar_hash = _hash_aadhaar(req.aadhaar_number)
    beneficiary_id = f"BEN-{uuid.uuid4().hex[:8].upper()}"

    logger.info(f"Beneficiary onboarded: {beneficiary_id} in {req.district}, {req.state}")
    return {
        "success": True,
        "beneficiary_id": beneficiary_id,
        "aadhaar_hash": aadhaar_hash,
        "district": req.district,
        "state": req.state,
        "jan_dhan_linked": bool(req.jan_dhan_account),
        "status": "ACTIVE",
        "onboarded_at": datetime.utcnow().isoformat()
    }

@app.post("/api/v1/nfsa/lookup", summary="Lookup NFSA ration card eligibility")
async def nfsa_lookup(req: NFSALookupRequest):
    """Check NFSA eligibility (AAY/PHH) for ration card number"""
    # Mock: In production, query State NFSA database via NIC API
    mock_data = {
        "ration_card_no": req.ration_card_no,
        "state": req.state,
        "category": "PHH",  # Antyodaya Anna Yojana (AAY) or Priority Household (PHH)
        "household_size": 4,
        "is_active": True,
        "scheme_benefits": ["rice", "wheat", "coarse_grain"],
        "onrc_enabled": True  # One Nation One Ration Card
    }
    return {"success": True, "nfsa_data": mock_data}
