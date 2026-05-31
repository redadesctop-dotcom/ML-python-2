from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any
import psutil
from backend.core.eai.eai_dashboard import get_eai_status

router = APIRouter(tags=["system"])

@router.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok", "system": "Evolutionary AI Orchestrator", "sidecar": "running"}

@router.get("/metrics")
async def get_metrics() -> Dict[str, float]:
    """Returns real CPU and RAM usage."""
    return {
        "cpu": psutil.cpu_percent(interval=None),
        "ram": psutil.virtual_memory().percent
    }

@router.get("/eai/status") 
async def eai_status(): 
    return get_eai_status()
