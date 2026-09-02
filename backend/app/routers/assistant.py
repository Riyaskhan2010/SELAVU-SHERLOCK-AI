"""
/api/assistant/conversations — persistent chat history.

Security: every endpoint reads current_user from the Firebase-verified token.
A user can only read/write/delete their OWN conversations.
"""
import math
import logging
from typing import List, Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.chat import ChatConversation, ChatMessage

router = APIRouter(prefix="/assistant", tags=["assistant"])
logger = logging.getLogger(__name__)


# ─── Schemas ──────────────────────────────────────────────────────────────────

class MessageOut(BaseModel):
    id: int
    role: str
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ConversationOut(BaseModel):
    id: int
    title: str
    dataset_id: Optional[int]
    created_at: datetime
    updated_at: Optional[datetime]
    message_count: int = 0
    last_message: Optional[str] = None

    model_config = {"from_attributes": True}


class ConversationDetail(ConversationOut):
    messages: List[MessageOut] = []


class CreateConversationIn(BaseModel):
    title: str = "New Conversation"
    dataset_id: Optional[int] = None


class UpdateTitleIn(BaseModel):
    title: str


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _get_conversation_or_404(
    conversation_id: int,
    user: User,
    db: Session,
) -> ChatConversation:
    conv = db.query(ChatConversation).filter(
        ChatConversation.id == conversation_id,
        ChatConversation.user_id == user.id,   # ownership check
    ).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


def _make_title(first_message: str) -> str:
    """Generate a short title from the first user message — no LLM needed."""
    text = first_message.strip()
    # Take first sentence or first 60 chars, whichever is shorter
    for sep in (".", "?", "!"):
        idx = text.find(sep)
        if 0 < idx < 80:
            text = text[: idx + 1]
            break
    if len(text) > 60:
        text = text[:57].rstrip() + "…"
    return text or "New Conversation"


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/conversations", response_model=List[ConversationOut])
def list_conversations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return all conversations for the authenticated user, most recent first."""
    convs = (
        db.query(ChatConversation)
        .filter(ChatConversation.user_id == current_user.id)
        .order_by(ChatConversation.updated_at.desc())
        .all()
    )

    result = []
    for c in convs:
        msgs = c.messages  # already ordered by created_at via relationship
        last = msgs[-1].content[:80] if msgs else None
        result.append(ConversationOut(
            id=c.id,
            title=c.title,
            dataset_id=c.dataset_id,
            created_at=c.created_at,
            updated_at=c.updated_at,
            message_count=len(msgs),
            last_message=last,
        ))
    return result


@router.post("/conversations", response_model=ConversationOut, status_code=201)
def create_conversation(
    payload: CreateConversationIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new empty conversation for the current user."""
    conv = ChatConversation(
        user_id=current_user.id,
        title=payload.title,
        dataset_id=payload.dataset_id,
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return ConversationOut(
        id=conv.id,
        title=conv.title,
        dataset_id=conv.dataset_id,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        message_count=0,
        last_message=None,
    )


@router.get("/conversations/{conversation_id}", response_model=ConversationDetail)
def get_conversation(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Fetch a conversation and all its messages."""
    conv = _get_conversation_or_404(conversation_id, current_user, db)
    msgs = conv.messages
    return ConversationDetail(
        id=conv.id,
        title=conv.title,
        dataset_id=conv.dataset_id,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        message_count=len(msgs),
        last_message=msgs[-1].content[:80] if msgs else None,
        messages=[MessageOut.model_validate(m) for m in msgs],
    )


@router.patch("/conversations/{conversation_id}/title", response_model=ConversationOut)
def update_title(
    conversation_id: int,
    payload: UpdateTitleIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conv = _get_conversation_or_404(conversation_id, current_user, db)
    conv.title = payload.title[:255]
    db.commit()
    db.refresh(conv)
    msgs = conv.messages
    return ConversationOut(
        id=conv.id, title=conv.title, dataset_id=conv.dataset_id,
        created_at=conv.created_at, updated_at=conv.updated_at,
        message_count=len(msgs),
        last_message=msgs[-1].content[:80] if msgs else None,
    )


@router.delete("/conversations/{conversation_id}", status_code=204)
def delete_conversation(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a conversation and all its messages (cascade)."""
    conv = _get_conversation_or_404(conversation_id, current_user, db)
    db.delete(conv)
    db.commit()
    logger.info(f"Conversation {conversation_id} deleted by user {current_user.id}")


# ─── Internal helper used by ai_chat.py ──────────────────────────────────────

def get_or_create_conversation(
    db: Session,
    user: User,
    conversation_id: Optional[int],
    first_message: str,
    dataset_id: Optional[int] = None,
) -> ChatConversation:
    """
    Return existing conversation (ownership-verified) or create a new one.
    Called by the chat endpoint to ensure every message is persisted.
    """
    if conversation_id:
        conv = db.query(ChatConversation).filter(
            ChatConversation.id == conversation_id,
            ChatConversation.user_id == user.id,
        ).first()
        if conv:
            return conv
        # conversation_id was provided but doesn't belong to this user
        # (or doesn't exist) — create a new one silently
    title = _make_title(first_message)
    conv = ChatConversation(
        user_id=user.id,
        title=title,
        dataset_id=dataset_id,
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return conv


def save_messages(
    db: Session,
    conv: ChatConversation,
    user_text: str,
    assistant_text: str,
) -> None:
    """Persist a user/assistant message pair and bump updated_at."""
    db.add(ChatMessage(
        conversation_id=conv.id, role="user", content=user_text
    ))
    db.add(ChatMessage(
        conversation_id=conv.id, role="assistant", content=assistant_text
    ))
    # bump updated_at so the conversation floats to the top of the list
    conv.updated_at = datetime.now(timezone.utc)
    db.commit()
