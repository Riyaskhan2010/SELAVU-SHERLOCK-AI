"""
Security module — Firebase Authentication.

Verifies Firebase ID tokens sent by the frontend.
Works in two modes:

  Mode A (service account): Uses Firebase Admin SDK with a service account key.
    → Set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT_JSON in .env

  Mode B (project ID only): Verifies tokens directly using Google's public JWKS
    endpoint — NO service account or ADC required. Works locally without any
    gcloud setup.
    → Set FIREBASE_PROJECT_ID in .env

Mode B is used when only FIREBASE_PROJECT_ID is configured (current situation).
"""
import json
import logging
import time
from typing import Optional

import httpx
from fastapi import HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db

logger = logging.getLogger(__name__)
bearer_scheme = HTTPBearer(auto_error=False)

# ─── Public key cache ─────────────────────────────────────────────────────────
# Google rotates these keys periodically; cache them for up to 1 hour.
_GOOGLE_CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"
_cert_cache: dict = {}
_cert_cache_expiry: float = 0.0


def _get_google_public_keys() -> dict:
    """Fetch and cache Google's Firebase token signing certificates."""
    global _cert_cache, _cert_cache_expiry
    now = time.time()
    if _cert_cache and now < _cert_cache_expiry:
        return _cert_cache

    resp = httpx.get(_GOOGLE_CERTS_URL, timeout=10)
    resp.raise_for_status()
    _cert_cache = resp.json()
    # Cache-Control header says how long to cache; default to 1 hour
    cc = resp.headers.get("Cache-Control", "max-age=3600")
    max_age = 3600
    for part in cc.split(","):
        part = part.strip()
        if part.startswith("max-age="):
            try:
                max_age = int(part.split("=")[1])
            except ValueError:
                pass
    _cert_cache_expiry = now + max_age
    return _cert_cache


# ─── Firebase Admin (used when service account is configured) ─────────────────
_firebase_initialized = False


def _init_firebase_admin():
    """Initialize Firebase Admin SDK. Only used when service account is provided."""
    global _firebase_initialized
    if _firebase_initialized:
        return

    import firebase_admin
    from firebase_admin import credentials

    if firebase_admin._apps:
        _firebase_initialized = True
        return

    if settings.FIREBASE_SERVICE_ACCOUNT_PATH:
        cred = credentials.Certificate(settings.FIREBASE_SERVICE_ACCOUNT_PATH)
        firebase_admin.initialize_app(cred)
        logger.info("Firebase Admin initialized from service account file")
        _firebase_initialized = True

    elif settings.FIREBASE_SERVICE_ACCOUNT_JSON:
        sa_dict = json.loads(settings.FIREBASE_SERVICE_ACCOUNT_JSON)
        cred = credentials.Certificate(sa_dict)
        firebase_admin.initialize_app(cred)
        logger.info("Firebase Admin initialized from service account JSON")
        _firebase_initialized = True

    # If only FIREBASE_PROJECT_ID is set, we skip Firebase Admin entirely
    # and use direct JWKS verification below — no ADC needed.


# ─── Token verification ───────────────────────────────────────────────────────

def verify_firebase_token(token: str) -> dict:
    """
    Verify a Firebase ID token and return decoded claims.

    Strategy:
    1. If a service account is configured → use Firebase Admin SDK (most secure)
    2. If only FIREBASE_PROJECT_ID is set → verify using Google's public JWKS
       (no ADC, no service account, works anywhere)
    3. Otherwise → raise 401
    """
    has_service_account = bool(
        settings.FIREBASE_SERVICE_ACCOUNT_PATH or
        settings.FIREBASE_SERVICE_ACCOUNT_JSON
    )

    if has_service_account:
        return _verify_with_firebase_admin(token)
    elif settings.FIREBASE_PROJECT_ID:
        return _verify_with_jwks(token, settings.FIREBASE_PROJECT_ID)
    else:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=(
                "Firebase is not configured on the server. "
                "Set FIREBASE_SERVICE_ACCOUNT_PATH, FIREBASE_SERVICE_ACCOUNT_JSON, "
                "or FIREBASE_PROJECT_ID in backend/.env"
            ),
        )


def _verify_with_firebase_admin(token: str) -> dict:
    """Verify using Firebase Admin SDK (requires service account)."""
    _init_firebase_admin()
    try:
        from firebase_admin import auth as fb_auth
        return fb_auth.verify_id_token(token)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired Firebase token: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )


def _verify_with_jwks(token: str, project_id: str) -> dict:
    """
    Verify a Firebase ID token using Google's public JWKS endpoint.
    No service account or ADC needed — just HTTPS to Google's public API.
    """
    from jose import jwt, JWTError, ExpiredSignatureError
    from jose.utils import base64url_decode

    try:
        # Get unverified header to find the key ID
        header = jwt.get_unverified_header(token)
        kid = header.get("kid")
        if not kid:
            raise HTTPException(status_code=401, detail="Firebase token missing kid header")

        # Fetch Google's public certificates
        certs = _get_google_public_keys()
        if kid not in certs:
            # Invalidate cache and retry once (key rotation)
            global _cert_cache_expiry
            _cert_cache_expiry = 0.0
            certs = _get_google_public_keys()

        if kid not in certs:
            raise HTTPException(status_code=401, detail="Firebase token key ID not found")

        cert_pem = certs[kid]

        # Verify and decode
        claims = jwt.decode(
            token,
            cert_pem,
            algorithms=["RS256"],
            audience=project_id,
            issuer=f"https://securetoken.google.com/{project_id}",
            options={"verify_exp": True},
        )

        # Firebase-specific claim checks
        if claims.get("aud") != project_id:
            raise HTTPException(status_code=401, detail="Token audience mismatch")

        uid = claims.get("sub") or claims.get("uid")
        if not uid:
            raise HTTPException(status_code=401, detail="Token missing subject (uid)")

        claims["uid"] = uid
        return claims

    except HTTPException:
        raise
    except ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Firebase token has expired")
    except JWTError as e:
        raise HTTPException(
            status_code=401,
            detail=f"Invalid Firebase token: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=503,
            detail=f"Could not reach Google's key server: {str(e)}",
        )
    except Exception as e:
        raise HTTPException(
            status_code=401,
            detail=f"Token verification failed: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ─── FastAPI dependency ───────────────────────────────────────────────────────

def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    """
    FastAPI dependency — verifies Firebase ID token, returns local User.
    Auto-provisions the local DB record on first login.
    """
    from app.models.user import User

    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    claims = verify_firebase_token(credentials.credentials)

    uid: str = claims.get("uid") or claims.get("sub", "")
    email: str = claims.get("email", "")
    name: str = (
        claims.get("name") or
        claims.get("display_name") or
        email.split("@")[0]
    )

    if not uid:
        raise HTTPException(status_code=401, detail="Firebase token missing uid")

    user = db.query(User).filter(User.firebase_uid == uid).first()

    if not user:
        existing = db.query(User).filter(User.email == email).first()
        if existing and not existing.firebase_uid:
            existing.firebase_uid = uid
            db.commit()
            db.refresh(existing)
            user = existing
            logger.info(f"Linked existing user {email} → Firebase UID {uid}")
        else:
            user = User(
                email=email,
                full_name=name,
                firebase_uid=uid,
                hashed_password="",
                is_active=True,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            logger.info(f"Auto-provisioned user {email} (uid={uid})")

    if not user.is_active:
        raise HTTPException(status_code=401, detail="Account is disabled")

    return user


def _check_firebase_configured() -> bool:
    return bool(
        settings.FIREBASE_SERVICE_ACCOUNT_PATH or
        settings.FIREBASE_SERVICE_ACCOUNT_JSON or
        settings.FIREBASE_PROJECT_ID
    )
