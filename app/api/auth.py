from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel, EmailStr, constr, field_validator, FieldValidationInfo
from sqlmodel import Session, select
from passlib.context import CryptContext

from app.core.db import get_session
from app.models import User
from time import time as _now
from app.core.config import settings

router = APIRouter()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def _hash_password(plain: str) -> str:
    return pwd_context.hash(plain)

def _verify_password(plain: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(plain, hashed)
    except Exception:
        return False

import re as _re
_COMMON_WEAK = {
    "password","123456","qwerty","letmein","111111","iloveyou","admin",
    "welcome","abc123","monkey","dragon","123456789","12345678","000000"
}

def _password_issues(pw: str, email: str = "") -> list[str]:
    pw = pw or ""
    issues: list[str] = []
    if len(pw) < 12:
        issues.append("At least 12 characters")
    if not _re.search(r"[a-z]", pw):
        issues.append("Contains a lowercase letter")
    if not _re.search(r"[A-Z]", pw):
        issues.append("Contains an uppercase letter")
    if not _re.search(r"\d", pw):
        issues.append("Contains a number")
    if not _re.search(r"[^A-Za-z0-9]", pw):
        issues.append("Contains a symbol")
    if _re.search(r"(.)\1\1", pw):
        issues.append("No character repeated 3+ times in a row")
    local = (email or "").split("@")[0].lower() if email else ""
    if local and local in pw.lower():
        issues.append("Does not include your email name")
    if pw.lower() in _COMMON_WEAK:
        issues.append("Not a common password")
    return issues

class SignupIn(BaseModel):
    email: EmailStr
    password: constr(min_length=12)

    @field_validator('password')
    @classmethod
    def _strong_pw(cls, v: str, info: FieldValidationInfo):
        email = ''
        try:
            email = str(getattr(info, 'data', {}).get('email', ''))
        except Exception:
            pass
        issues = _password_issues(v, email)
        if issues:
            raise ValueError('weak_password: ' + '; '.join(issues))
        return v

class LoginIn(BaseModel):
    email: EmailStr
    password: str

@router.post("/signup", status_code=201)
def signup(payload: SignupIn, request: Request, session: Session = Depends(get_session)):
    existing = session.exec(select(User).where(User.email == payload.email)).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    u = User(email=str(payload.email), password_hash=_hash_password(payload.password))
    session.add(u)
    session.commit()
    session.refresh(u)
    # Auto-login via session cookie
    request.session['user_id'] = u.id
    request.session['started_at'] = int(_now())
    return {"id": u.id, "email": u.email}

@router.post("/login")
def login(payload: LoginIn, request: Request, session: Session = Depends(get_session)):
    u = session.exec(select(User).where(User.email == payload.email)).first()
    if not u or not _verify_password(payload.password, u.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    request.session['user_id'] = u.id
    request.session['started_at'] = int(_now())
    return {"ok": True}

@router.post("/logout")
def logout(request: Request):
    request.session.clear()
    return {"ok": True}

def get_current_user_session(request: Request, session: Session = Depends(get_session)) -> User:
    uid = request.session.get('user_id')
    if not uid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    u = session.get(User, int(uid))
    if not u:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")
    return u

@router.get("/me")
def me(request: Request, user: User = Depends(get_current_user_session)):
    started = int(request.session.get('started_at') or int(_now()))
    remaining = max(0, started + settings.SESSION_MAX_AGE - int(_now()))
    return {
        "id": user.id,
        "email": user.email,
        "created_at": user.created_at.isoformat(),
        "remaining_seconds": remaining,
    }

@router.post("/extend")
def extend(request: Request, user: User = Depends(get_current_user_session)):
    # Touch session to refresh cookie and reset countdown
    request.session['started_at'] = int(_now())
    remaining = settings.SESSION_MAX_AGE
    return {"ok": True, "remaining_seconds": remaining}
