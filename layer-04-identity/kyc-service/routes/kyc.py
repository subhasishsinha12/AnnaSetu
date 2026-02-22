from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, validator
import httpx
import hashlib
import os
import re

router = APIRouter()

class KYCRequest(BaseModel):
    aadhaarNumber: str
    otp: str
    purpose: str = "beneficiary_onboarding"

    @validator('aadhaarNumber')
    def validate_aadhaar(cls, v):
        if not re.match(r'^[0-9]{12}$', v.replace(' ', '')):
            raise ValueError('Invalid Aadhaar number format')
        return v.replace(' ', '')

class KYCResponse(BaseModel):
    verified: bool
    aadhaarHash: str  # SHA-256 hash — never return raw Aadhaar
    name: str = None
    dob: str = None
    gender: str = None
    address: dict = None
    phoneLinked: bool = False

UIDAI_SANDBOX = os.getenv("UIDAI_SANDBOX_URL", "https://developer.uidai.gov.in/uidaiauthws/1.6/")
AUA_CODE = os.getenv("UIDAI_AUA_CODE", "")
LICENSE_KEY = os.getenv("UIDAI_LICENSE_KEY", "")

@router.post("/verify", response_model=KYCResponse)
async def verify_aadhaar(request: KYCRequest):
    """
    Verify Aadhaar via OTP-based eKYC
    Returns hash only — raw Aadhaar never stored (DPDP Act 2023 compliant)
    """
    aadhaar_hash = hashlib.sha256(request.aadhaarNumber.encode()).hexdigest()
    
    if os.getenv("NODE_ENV", "development") == "development":
        # Mock response for development
        return KYCResponse(
            verified=True,
            aadhaarHash=aadhaar_hash,
            name="Demo Beneficiary",
            dob="1990-01-01",
            gender="M",
            address={"state": "Gujarat", "district": "Surat", "pincode": "395001"},
            phoneLinked=True
        )
    
    # Production: call UIDAI Sandbox/Live API
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{UIDAI_SANDBOX}kyc/{AUA_CODE}/{LICENSE_KEY}/0",
                json={"uid": request.aadhaarNumber, "otp": request.otp},
                timeout=30
            )
            if response.status_code != 200:
                raise HTTPException(status_code=502, detail="UIDAI service error")
            data = response.json()
            
            if data.get("ret") != "y":
                return KYCResponse(verified=False, aadhaarHash=aadhaar_hash)
            
            kua = data.get("kua", {})
            return KYCResponse(
                verified=True,
                aadhaarHash=aadhaar_hash,
                name=kua.get("name"),
                dob=kua.get("dob"),
                gender=kua.get("gender"),
                address={"state": kua.get("state"), "district": kua.get("dist"), "pincode": kua.get("pc")},
                phoneLinked=bool(kua.get("phone"))
            )
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="UIDAI service timeout")

@router.post("/hash")
def get_aadhaar_hash(aadhaarNumber: str):
    """Generate one-way hash for on-chain storage"""
    clean = aadhaarNumber.replace(' ', '')
    if not re.match(r'^[0-9]{12}$', clean):
        raise HTTPException(status_code=400, detail="Invalid Aadhaar format")
    return {
        "hash": hashlib.sha256(clean.encode()).hexdigest(),
        "algorithm": "SHA-256",
        "note": "Store only this hash on blockchain — never the raw Aadhaar"
    }
