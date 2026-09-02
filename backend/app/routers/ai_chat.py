import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.dataset import Dataset
from app.schemas.analysis import ChatRequest, ChatMessage
from app.services.llm import get_llm_service, build_chat_prompt

# Import the DB-persistence helpers from the assistant router
from app.routers.assistant import get_or_create_conversation, save_messages

router = APIRouter(prefix="/ai", tags=["ai"])
logger = logging.getLogger(__name__)


@router.post("/chat", response_model=ChatMessage)
async def chat(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # ── Resolve conversation (int ID now, not a random UUID string) ──────────
    # The frontend sends conversation_id as a string; we try to parse it as int.
    # If it's a legacy UUID string we create a new conversation instead.
    conv_id_int: Optional[int] = None
    if request.conversation_id:
        try:
            conv_id_int = int(request.conversation_id)
        except (ValueError, TypeError):
            conv_id_int = None  # legacy UUID — start fresh

    # ── Dataset context — rich aggregated data from cost_records ────────────
    dataset_context = None
    if request.dataset_id:
        dataset = db.query(Dataset).filter(
            Dataset.id == request.dataset_id,
            Dataset.owner_id == current_user.id,
        ).first()
        if dataset:
            from app.models.finding import Finding
            from sqlalchemy import text as sqtext

            findings = db.query(Finding).filter(
                Finding.dataset_id == dataset.id
            ).all()
            total_savings = sum(f.potential_saving for f in findings)

            did = dataset.id

            # ── Service-level cost aggregation (raw SQL — avoids SQLAlchemy Row issues) ──
            svc_result = db.execute(sqtext("""
                SELECT service, ROUND(SUM(cost), 2)
                FROM cost_records
                WHERE dataset_id = :did
                GROUP BY service
                ORDER BY SUM(cost) DESC
            """), {"did": did})
            service_costs = {r[0]: float(r[1]) for r in svc_result.fetchall()}

            # ── Date-level cost aggregation ────────────────────────────────
            date_result = db.execute(sqtext("""
                SELECT date, ROUND(SUM(cost), 2)
                FROM cost_records
                WHERE dataset_id = :did
                GROUP BY date
                ORDER BY date ASC
                LIMIT 60
            """), {"did": did})
            daily_costs = {str(r[0]): float(r[1]) for r in date_result.fetchall()}

            # ── Service × date breakdown ───────────────────────────────────
            detail_result = db.execute(sqtext("""
                SELECT date, service, ROUND(SUM(cost), 2)
                FROM cost_records
                WHERE dataset_id = :did
                GROUP BY date, service
                ORDER BY date ASC, SUM(cost) DESC
            """), {"did": did})
            service_date_costs = [
                {"date": str(r[0]), "service": r[1], "cost": float(r[2])}
                for r in detail_result.fetchall()
            ]

            # ── Top findings summary ───────────────────────────────────────
            top_findings = sorted(findings, key=lambda f: f.potential_saving, reverse=True)[:5]
            findings_summary = [
                {
                    "title": f.title,
                    "service": f.service,
                    "priority": f.priority.value if hasattr(f.priority, "value") else f.priority,
                    "current_cost": f.current_cost,
                    "potential_saving": f.potential_saving,
                }
                for f in top_findings
            ]

            dataset_context = {
                "name": dataset.name,
                "total_cost": round(float(dataset.total_cost), 2),
                "period_days": (
                    (dataset.date_range_end - dataset.date_range_start).days
                    if dataset.date_range_start and dataset.date_range_end
                    else 30
                ),
                "date_range_start": str(dataset.date_range_start) if dataset.date_range_start else None,
                "date_range_end": str(dataset.date_range_end) if dataset.date_range_end else None,
                "findings_count": len(findings),
                "potential_savings": round(total_savings, 2),
                # Rich data for answering specific questions
                "service_costs": service_costs,        # {service: total_cost}
                "daily_costs": daily_costs,             # {date: total_cost}
                "service_date_costs": service_date_costs,  # [{date, service, cost}]
                "top_findings": findings_summary,
            }

    # ── Get or create the persistent conversation ─────────────────────────────
    conv = get_or_create_conversation(
        db=db,
        user=current_user,
        conversation_id=conv_id_int,
        first_message=request.message,
        dataset_id=request.dataset_id,
    )

    # ── Build history from DB (last 10 turns = 20 messages) ──────────────────
    db_messages = conv.messages[-20:]  # already ordered by created_at
    history: List[Dict] = [
        {"role": m.role, "content": m.content}
        for m in db_messages
    ]

    # ── Call LLM ──────────────────────────────────────────────────────────────
    try:
        messages = build_chat_prompt(
            user_message=request.message,
            dataset_context=dataset_context,
            conversation_history=history,
        )
        llm = get_llm_service()
        response_text = await llm.complete(messages, max_tokens=512)
    except Exception as e:
        logger.error(f"Chat LLM error (conv={conv.id}): {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"AI service error: {str(e)}",
        )

    # ── Persist both messages ─────────────────────────────────────────────────
    try:
        save_messages(db, conv, request.message, response_text)
    except Exception as e:
        logger.warning(f"Failed to persist messages (conv={conv.id}): {e}")
        # Don't fail the response — user still gets the reply

    return ChatMessage(
        id=str(uuid.uuid4()),
        role="assistant",
        content=response_text,
        timestamp=datetime.now(timezone.utc).isoformat(),
        sources=["Cost analysis data", "Detected findings"],
        # Return the real conversation ID so the frontend can track it
        conversation_id=str(conv.id),
    )


@router.get("/chat/{conversation_id}", response_model=List[ChatMessage])
def get_chat_history(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return persisted messages for a conversation (ownership verified)."""
    from app.models.chat import ChatConversation

    try:
        conv_id = int(conversation_id)
    except ValueError:
        return []

    conv = db.query(ChatConversation).filter(
        ChatConversation.id == conv_id,
        ChatConversation.user_id == current_user.id,
    ).first()

    if not conv:
        return []

    return [
        ChatMessage(
            id=str(m.id),
            role=m.role,
            content=m.content,
            timestamp=m.created_at.isoformat() if m.created_at else "",
            conversation_id=str(conv.id),
        )
        for m in conv.messages
    ]
