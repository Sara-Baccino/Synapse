"""
synapse_gui.routers.auth
--------------------------------

Stateless JWT authentication, identical in mechanism to synclair-gui's
auth.py (recycled per Phase 1 plan: this logic has nothing
Structure/Matching-specific about it). Demo user renamed to
synapse-demo since Synapse has a fully independent user store.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel

__all__ = ["router", "get_current_user"]

router = APIRouter(prefix="/auth", tags=["auth"])

_SECRET_KEY = os.environ.get("SYNAPSE_JWT_SECRET", "dev-only-insecure-secret-change-me")
_ALGORITHM = "HS256"
_ACCESS_TOKEN_EXPIRE_MINUTES = 60

_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def _hash_password(password: str, salt: bytes) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations=200_000).hex()


def _verify_password(password: str, salt_hex: str, expected_hash_hex: str) -> bool:
    salt = bytes.fromhex(salt_hex)
    return hmac.compare_digest(_hash_password(password, salt), expected_hash_hex)


@dataclass
class _UserRecord:
    username: str
    salt_hex: str
    password_hash_hex: str
    full_name: str


def _make_demo_user(username: str, password: str, full_name: str) -> _UserRecord:
    salt = secrets.token_bytes(16)
    return _UserRecord(username=username, salt_hex=salt.hex(), password_hash_hex=_hash_password(password, salt), full_name=full_name)


# Placeholder single-user store, independent from synclair-gui's.
_USER_STORE: dict[str, _UserRecord] = {
    "demo": _make_demo_user("demo", "synapse-demo", full_name="Synapse Demo User"),
}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class CurrentUserResponse(BaseModel):
    username: str
    full_name: str


def _create_access_token(username: str) -> str:
    expire_at = datetime.now(timezone.utc) + timedelta(minutes=_ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode({"sub": username, "exp": expire_at}, _SECRET_KEY, algorithm=_ALGORITHM)


def _decode_access_token(token: str) -> str:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, _SECRET_KEY, algorithms=[_ALGORITHM])
    except jwt.PyJWTError as exc:
        raise credentials_exception from exc

    username = payload.get("sub")
    if not username or username not in _USER_STORE:
        raise credentials_exception
    return username


def get_current_user(token: str = Depends(_oauth2_scheme)) -> CurrentUserResponse:
    username = _decode_access_token(token)
    user = _USER_STORE[username]
    return CurrentUserResponse(username=user.username, full_name=user.full_name)


@router.post("/login", response_model=TokenResponse)
def login(form_data: OAuth2PasswordRequestForm = Depends()) -> TokenResponse:
    user = _USER_STORE.get(form_data.username)
    if user is None or not _verify_password(form_data.password, user.salt_hex, user.password_hash_hex):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect username or password.", headers={"WWW-Authenticate": "Bearer"})
    return TokenResponse(access_token=_create_access_token(user.username))


@router.get("/me", response_model=CurrentUserResponse)
def read_current_user(current_user: CurrentUserResponse = Depends(get_current_user)) -> CurrentUserResponse:
    return current_user