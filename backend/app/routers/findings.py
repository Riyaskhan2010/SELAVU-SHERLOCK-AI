import math
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.dataset import Dataset
from app.models.finding import Finding, Anomaly
from app.schemas.finding import FindingRead, AnomalyRead, PaginatedFindings, PaginatedAnomalies
from app.services.llm import get_llm_service, build_finding_explanation_prompt

router = APIRouter(prefix="/findings", tags=["findings"])


def _verify_dataset(dataset_id: int, user: User, db: Session) -> Dataset:
    dataset = db.query(Dataset).filter(
        Dataset.id == dataset_id,
        Dataset.owner_id == user.id,
    ).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset


@router.get("/{dataset_id}", response_model=PaginatedFindings)
def list_findings(
    dataset_id: int,
    priority: Optional[str] = Query(None),
    type: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _verify_dataset(dataset_id, current_user, db)

    query = db.query(Finding).filter(Finding.dataset_id == dataset_id)
    if priority:
        query = query.filter(Finding.priority == priority)
    if type:
        query = query.filter(Finding.finding_type == type)

    total = query.count()
    items = (
        query
        .order_by(Finding.potential_saving.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return PaginatedFindings(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size),
    )


@router.get("/detail/{finding_id}", response_model=FindingRead)
def get_finding(
    finding_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    finding = db.query(Finding).filter(Finding.id == finding_id).first()
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")
    # Verify ownership through dataset
    _verify_dataset(finding.dataset_id, current_user, db)
    return finding


@router.post("/{finding_id}/explain")
async def explain_finding(
    finding_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    finding = db.query(Finding).filter(Finding.id == finding_id).first()
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")
    _verify_dataset(finding.dataset_id, current_user, db)

    # Return cached explanation if available
    if finding.ai_explanation:
        return {"explanation": finding.ai_explanation}

    try:
        llm = get_llm_service()
        finding_data = {
            "title": finding.title,
            "service": finding.service,
            "finding_type": finding.finding_type.value if hasattr(finding.finding_type, 'value') else finding.finding_type,
            "priority": finding.priority.value if hasattr(finding.priority, 'value') else finding.priority,
            "evidence_metrics": finding.evidence_metrics,
            "savings_calculation": finding.savings_calculation,
            "assumption": finding.assumption,
        }
        messages = build_finding_explanation_prompt(finding_data)
        explanation = await llm.complete(messages, max_tokens=256)

        # Cache it
        finding.ai_explanation = explanation
        db.commit()

        return {"explanation": explanation}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI explanation failed: {str(e)}")


# ─── Anomalies ────────────────────────────────────────────────────────────────
anomaly_router = APIRouter(prefix="/anomalies", tags=["anomalies"])


@anomaly_router.get("/{dataset_id}", response_model=PaginatedAnomalies)
def list_anomalies(
    dataset_id: int,
    severity: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _verify_dataset(dataset_id, current_user, db)

    query = db.query(Anomaly).filter(Anomaly.dataset_id == dataset_id)
    if severity:
        query = query.filter(Anomaly.severity == severity)

    total = query.count()
    items = (
        query
        .order_by(Anomaly.anomaly_score.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return PaginatedAnomalies(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size),
    )
