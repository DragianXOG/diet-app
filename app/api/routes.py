from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import select, Session

from ..core.config import settings
from ..core.db import get_session
from ..models import Ping

router = APIRouter()

@router.get("/status")
def status():
    return {"ok": True, "app": settings.APP_NAME, "version": settings.VERSION}

@router.get("/version")
def version():
    return {"version": settings.VERSION}

class PingIn(BaseModel):
    msg: str

@router.post("/ping")
def create_ping(payload: PingIn, session: Session = Depends(get_session)):
    p = Ping(msg=payload.msg)
    session.add(p)
    session.commit()
    session.refresh(p)
    return {"id": p.id, "msg": p.msg}

@router.get("/pings")
def list_pings(session: Session = Depends(get_session)):
    rows = session.exec(select(Ping).order_by(Ping.id.desc()).limit(5)).all()
    return [{"id": r.id, "msg": r.msg, "created_at": r.created_at.isoformat()} for r in rows]

# --- OAuth2 password flow (for Swagger UI) ---
from fastapi.security import OAuth2PasswordRequestForm
from ..core.security import verify_password, create_access_token

@router.post("/auth/token")
def login_token(form_data: OAuth2PasswordRequestForm = Depends(), session: Session = Depends(get_session)):
    """OAuth2 password grant endpoint for Swagger UI.
    Uses 'username' as the email field."""
    user = session.exec(select(User).where(User.email == form_data.username)).first()
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token(str(user.id))
    return {"access_token": token, "token_type": "bearer"}
