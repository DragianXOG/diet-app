# app/api/auth.py
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, constr
from sqlmodel import Session, select

from ..core.db import get_session
from ..core.security import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
)
from ..models import User

router = APIRouter()

# ---- Schemas ----
class SignupIn(BaseModel):
    email: EmailStr
    password: constr(min_length=8)

class LoginIn(BaseModel):
    email: EmailStr
    password: str

# ---- Routes ----
@router.post("/signup", status_code=201)
def signup(payload: SignupIn, session: Session = Depends(get_session)):
    # Check if already registered
    existing = session.exec(select(User).where(User.email == payload.email)).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Email already registered"
        )

    # Create user
    u = User(email=str(payload.email), password_hash=hash_password(payload.password))
    session.add(u)
    session.commit()
    session.refresh(u)

    # Issue token with version (defaults to 0)
    token = create_access_token(sub=str(u.id), token_version=u.token_version)
    return {"id": u.id, "email": u.email, "access_token": token, "token_type": "bearer"}

@router.post("/login")
def login(payload: LoginIn, session: Session = Depends(get_session)):
    u = session.exec(select(User).where(User.email == payload.email)).first()
    if not u or not verify_password(payload.password, u.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials"
        )
    token = create_access_token(sub=str(u.id), token_version=u.token_version)
    return {"access_token": token, "token_type": "bearer"}

@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return {
        "id": user.id,
        "email": user.email,
        "created_at": user.created_at.isoformat(),
        "token_version": user.token_version,
    }

@router.post("/logout")
def logout(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """
    Server-side logout: bump the user's token_version.
    All existing tokens (with older 'ver') are immediately invalid.
    """
    user.token_version += 1
    session.add(user)
    session.commit()
    return {"ok": True, "token_version": user.token_version}
