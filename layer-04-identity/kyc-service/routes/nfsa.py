from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import httpx
import os

router = APIRouter()

class NFSALookup(BaseModel):
    aadhaarHash: str
    state: str = "Gujarat"

class NFSARecord(BaseModel):
    eligible: bool
    rationCardNo: str = None
    category: str = None  # AAY, PHH, NPHH
    headOfFamily: str = None
    familySize: int = None
    monthlyEntitlement: dict = None
    fpShopCode: str = None
    onorc: bool = False  # One Nation One Ration Card

NFSA_URL = os.getenv("NFSA_API_URL", "https://nfsa.gov.in/api/v1")
NFSA_KEY = os.getenv("NFSA_API_KEY", "")

@router.post("/lookup", response_model=NFSARecord)
async def lookup_nfsa_eligibility(request: NFSALookup):
    """
    Check beneficiary eligibility in NFSA registry
    Uses Aadhaar hash as lookup key
    """
    if os.getenv("NODE_ENV", "development") == "development":
        # Mock: Every request returns eligible PHH family
        return NFSARecord(
            eligible=True,
            rationCardNo=f"GJ-ST-{request.aadhaarHash[:8].upper()}",
            category="PHH",
            headOfFamily="Demo Head",
            familySize=5,
            monthlyEntitlement={
                "rice_kg": 25,
                "wheat_kg": 0,
                "sugar_kg": 0,
                "annasetu_credit_inr": 750
            },
            fpShopCode="GJ-SU-001",
            onorc=True
        )
    
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{NFSA_URL}/beneficiary/aadhaar-hash/{request.aadhaarHash}",
                headers={"X-API-Key": NFSA_KEY},
                timeout=15
            )
            if resp.status_code == 404:
                return NFSARecord(eligible=False)
            if resp.status_code != 200:
                raise HTTPException(status_code=502, detail="NFSA service unavailable")
            
            data = resp.json()
            return NFSARecord(
                eligible=True,
                rationCardNo=data.get("card_no"),
                category=data.get("category"),
                headOfFamily=data.get("hof_name"),
                familySize=data.get("family_size"),
                monthlyEntitlement=data.get("entitlement"),
                fpShopCode=data.get("fps_code"),
                onorc=data.get("onorc_enabled", False)
            )
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="NFSA service timeout")
