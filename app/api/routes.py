from fastapi import APIRouter
from ..core.config import settings

router = APIRouter()

@router.get("/status")
def status():
    return {"ok": True, "app": settings.APP_NAME, "version": settings.VERSION}

@router.get("/version")
def version():
    return {"version": settings.VERSION}
