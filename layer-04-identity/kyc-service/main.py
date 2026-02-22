from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, validator
import uvicorn
import httpx
import hashlib
import os
from dotenv import load_dotenv
from routes import kyc, nfsa, zk_proof

load_dotenv()

app = FastAPI(
    title="AnnaSetu Identity Service",
    description="Layer 04: Aadhaar eKYC + NFSA registry + ZK proof integration",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "AnnaSetu Identity Service",
        "layer": "04"
    }

app.include_router(kyc.router, prefix="/api/v1/kyc", tags=["KYC"])
app.include_router(nfsa.router, prefix="/api/v1/nfsa", tags=["NFSA"])
app.include_router(zk_proof.router, prefix="/api/v1/zk", tags=["ZK-Proof"])

if __name__ == "__main__":
    port = int(os.getenv("IDENTITY_API_PORT", 8001))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
