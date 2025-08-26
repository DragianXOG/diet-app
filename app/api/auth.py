from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, constr
from sqlmodel import Session, select

from ..core.db import get_session
from ..core.security import hash_password, verify_password, create_access_token, get_current_user
from ..models import User

router = APIRouter()

class SignupIn(BaseModel):
    email: EmailStr
    password: constr(min_length=8)

class LoginIn(BaseModel):
    email: EmailStr
    password: str

@router.post("/signup", status_code=201)
def signup(payload: SignupIn, session: Session = Depends(get_session)):
    existing = session.exec(select(User).where(User.email == payload.email)).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    u = User(email=str(payload.email), password_hash=hash_password(payload.password))
    session.add(u)
    session.commit()
    session.refresh(u)
    # return a token too for convenience
    token = create_access_token(sub=str(u.id))
    return {"id": u.id, "email": u.email, "access_token": token, "token_type": "bearer"}

@router.post("/login")
def login(payload: LoginIn, session: Session = Depends(get_session)):
    u = session.exec(select(User).where(User.email == payload.email)).first()
    if not u or not verify_password(payload.password, u.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    token = create_access_token(sub=str(u.id))
    return {"access_token": token, "token_type": "bearer"}

@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return {"id": user.id, "email": user.email, "created_at": user.created_at.isoformat()}
