"""
Auth router — Firebase Authentication.

Registration and login are handled entirely by Firebase on the frontend.
The backend only needs:
  - GET /auth/me  — return the authenticated user's profile
  - GET /auth/status — confirm Firebase Admin is configured
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user, _check_firebase_configured
from app.models.user import User
from app.schemas.user import UserRead

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me", response_model=UserRead)
def get_me(current_user: User = Depends(get_current_user)):
    """Return the profile of the currently authenticated Firebase user."""
    return current_user


@router.get("/status")
def auth_status():
    """
    Health check — confirms whether Firebase Admin SDK is configured on the backend.
    Useful for debugging auth setup.
    """
    configured = _check_firebase_configured()
    return {
        "firebase_configured": configured,
        "auth_method": "firebase",
        "message": (
            "Firebase Admin SDK is active." if configured
            else "Firebase Admin SDK is NOT configured. Set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT_JSON in .env"
        ),
    }
