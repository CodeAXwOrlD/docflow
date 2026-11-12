import base64
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from cryptography.fernet import Fernet, InvalidToken, MultiFernet
from fastapi import Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db

bearer_scheme = HTTPBearer(auto_error=False)


class EncryptionError(Exception):
    """Raised when credential encryption, decryption, or key configuration fails."""


def hash_password(password: str) -> str:
    """Hash a plaintext password using bcrypt."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a stored bcrypt hash."""
    if not plain_password or not hashed_password:
        return False
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False


def _build_dev_fernet_key(secret_key: str) -> bytes:
    """Derive a deterministic Fernet key from SECRET_KEY for non-production local development only."""
    digest = hashlib.sha256(f"docflow-dev-fernet:{secret_key}".encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


class EncryptionService:
    """Authenticated symmetric encryption (Fernet / MultiFernet) for BYOK credentials."""

    def __init__(self, master_key: Optional[str] = None, allow_dev_fallback: Optional[bool] = None):
        raw_key = settings.ENCRYPTION_MASTER_KEY if master_key is None else master_key
        if allow_dev_fallback is None:
            allow_dev_fallback = settings.ENVIRONMENT.lower() != "production"

        keys = [k.strip() for k in raw_key.split(",") if k.strip()] if raw_key else []
        if not keys:
            if not allow_dev_fallback:
                raise EncryptionError("ENCRYPTION_MASTER_KEY is not configured.")
            fernets = [Fernet(_build_dev_fernet_key(settings.SECRET_KEY))]
        else:
            fernets = []
            for k in keys:
                try:
                    fernets.append(Fernet(k.encode("utf-8")))
                except Exception as exc:
                    raise EncryptionError("Invalid ENCRYPTION_MASTER_KEY format; expected Fernet key.") from exc

        self._fernet = MultiFernet(fernets)

    def encrypt(self, plaintext: str) -> str:
        """Encrypt a secret string. Never accepts empty values or logs plaintext."""
        if not plaintext or not plaintext.strip():
            raise EncryptionError("Cannot encrypt an empty API key.")
        try:
            token = self._fernet.encrypt(plaintext.strip().encode("utf-8"))
            return token.decode("utf-8")
        except EncryptionError:
            raise
        except Exception as exc:
            raise EncryptionError("Credential encryption failed.") from exc

    def decrypt(self, ciphertext: str) -> str:
        """Decrypt an encrypted credential token."""
        if not ciphertext:
            raise EncryptionError("Encrypted credential payload is missing.")
        try:
            plaintext = self._fernet.decrypt(ciphertext.encode("utf-8"))
            return plaintext.decode("utf-8")
        except InvalidToken as exc:
            raise EncryptionError(
                "Unable to decrypt stored API key. Verify ENCRYPTION_MASTER_KEY configuration."
            ) from exc
        except Exception as exc:
            raise EncryptionError("Credential decryption failed.") from exc

    def rotate(self, ciphertext: str) -> str:
        """Re-encrypt an existing token using the primary (first) Fernet key."""
        try:
            return self._fernet.rotate(ciphertext.encode("utf-8")).decode("utf-8")
        except InvalidToken as exc:
            raise EncryptionError("Cannot rotate credential: invalid token or master key.") from exc


def get_encryption_service() -> EncryptionService:
    """Return configured EncryptionService instance."""
    return EncryptionService()


def mask_api_key(api_key: str) -> tuple[str, str]:
    """Return (masked_key, last_four) without exposing sensitive prefix or body characters."""
    cleaned = (api_key or "").strip()
    if len(cleaned) <= 4:
        return ("••••", "")
    last_four = cleaned[-4:]
    mask_len = min(12, max(6, len(cleaned) - 4))
    return (f"{'•' * mask_len}{last_four}", last_four)


def format_masked_from_last_four(last_four: Optional[str]) -> str:
    """Render a consistent masked representation from stored last-four characters."""
    if not last_four or len(last_four) < 4:
        return "••••••••"
    return f"••••••••{last_four[-4:]}"


def create_access_token(user_id: str, email: str, expires_delta: Optional[timedelta] = None) -> str:
    """Issue a signed JWT access token for API authentication."""
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    payload = {
        "sub": user_id,
        "email": email,
        "type": "access",
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Decode and validate an access JWT."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token has expired.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    if payload.get("type") != "access" or not payload.get("sub"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload


def create_stream_token(user_id: str, doc_id: str) -> str:
    """Issue a short-lived SSE stream token scoped to a single user and document."""
    now = datetime.now(timezone.utc)
    expire = now + timedelta(seconds=settings.STREAM_TOKEN_EXPIRE_SECONDS)
    payload = {
        "sub": user_id,
        "doc_id": doc_id,
        "type": "sse_stream",
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def verify_stream_token(token: str, expected_doc_id: str) -> str:
    """Verify a scoped SSE stream token and return user_id."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired stream token.") from exc

    if (
        payload.get("type") != "sse_stream"
        or payload.get("doc_id") != expected_doc_id
        or not payload.get("sub")
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid stream token scope.")
    return str(payload["sub"])


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
):
    """Resolve authenticated User from Bearer token."""
    from app.models.user import User

    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(credentials.credentials)
    user_id = payload["sub"]

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found or inactive.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


async def get_sse_user(
    doc_id: str,
    stream_token: Optional[str] = Query(default=None),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
):
    """Authenticate SSE stream via Bearer header or short-lived scoped stream_token."""
    from app.models.user import User

    if credentials and credentials.scheme.lower() == "bearer":
        payload = decode_access_token(credentials.credentials)
        user_id = str(payload["sub"])
    elif stream_token:
        user_id = verify_stream_token(stream_token, doc_id)
    else:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required for stream.")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User account not found or inactive.")
    return user

