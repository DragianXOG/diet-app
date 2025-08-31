# app/core/security.py
from datetime import datetime, timedelta
import jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlmodel import Session

from .config import settings
from .db import get_session
from ..models import User

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)

# OAuth2 bearer token (used by FastAPI dependency)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token")

def create_access_token(sub: str, token_version: int) -> str:
    """
    Create a JWT with subject (user id) and the user's current token_version.
    Tokens expire according to ACCESS_TOKEN_EXPIRE_MINUTES in settings.
    """
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": sub,            # user id as string
        "exp": expire,         # expiry time
        "ver": token_version,  # token version for server-side revocation
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

def get_current_user(
    token: str = Depends(oauth2_scheme),
    session: Session = Depends(get_session),
) -> User:
    """
    Decode the JWT, load the user, and enforce token version matching.
    If the token's version doesn't equal the user's current token_version,
    the token is considered revoked.
    """
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        data = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        sub = data.get("sub")
        ver = data.get("ver")
        if not sub or ver is None:
            raise credentials_exc
        user_id = int(sub)
    except Exception:
        # Any decode/validation error → unauthorized
        raise credentials_exc

    user = session.get(User, user_id)
    if not user:
        raise credentials_exc

    # 🔒 Server-side revocation check
    if ver != user.token_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user
