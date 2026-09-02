"""
Dataset management endpoints.

Supports all 6 data sources:
  1. FOCUS       — POST /datasets/import/focus
  2. CSV Upload  — POST /datasets/import/csv
  3. GCP Billing — POST /datasets/import/gcp_billing
  (AWS/Azure/GCP Monitoring connectors are in routers/connectors.py)

Every dataset is permanently associated with the authenticated user.
Ownership is verified on every read/write operation.
"""
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.dataset import Dataset, DatasetStatus, SourceType
from app.models.finding import Finding, Anomaly
from app.schemas.dataset import DatasetRead, DatasetHistoryItem
from app.services.ingestion import parse_file, normalize_dataframe, persist_records, load_dataframe_from_db
from app.detection.engine import run_full_analysis

router = APIRouter(prefix="/datasets", tags=["datasets"])
logger = logging.getLogger(__name__)

# ─── Ownership helper ─────────────────────────────────────────────────────────

def _require_owner(dataset_id: int, user: User, db: Session) -> Dataset:
    dataset = db.query(Dataset).filter(
        Dataset.id == dataset_id,
        Dataset.owner_id == user.id,
    ).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset


# ─── Shared ingestion helper ──────────────────────────────────────────────────

async def _ingest_and_analyze(
    db: Session,
    user: User,
    file_content: bytes,
    filename: str,
    dataset_name: str,
    source_type: SourceType,
    source_name: Optional[str] = None,
    description: Optional[str] = None,
) -> Dataset:
    """
    Full pipeline: validate → normalize → persist → analyze.
    Used by all file-based import endpoints.
    """
    dataset = Dataset(
        owner_id=user.id,
        name=dataset_name,
        description=description,
        source_type=source_type,
        source_name=source_name or source_type.value,
        source_filename=filename,
        status=DatasetStatus.processing,
    )
    db.add(dataset)
    db.commit()
    db.refresh(dataset)

    try:
        df_raw = parse_file(file_content, filename)
        df_norm, warnings = normalize_dataframe(df_raw)

        if df_norm.empty:
            dataset.status = DatasetStatus.error
            db.commit()
            raise HTTPException(status_code=422, detail="No valid records found in file")

        row_count = persist_records(db, df_norm, dataset)
        logger.info(
            f"Ingested {row_count} records | dataset={dataset.id} | "
            f"source={source_type.value} | user={user.id}"
        )

        df_analysis = load_dataframe_from_db(db, dataset.id)
        run_full_analysis(db, dataset, df_analysis)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ingestion failed: {e}", exc_info=True)
        dataset.status = DatasetStatus.error
        db.commit()
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")

    db.refresh(dataset)
    return dataset


# ─── List ─────────────────────────────────────────────────────────────────────

@router.get("", response_model=List[DatasetRead])
def list_datasets(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List every dataset owned by the authenticated user. Never touches other users' data."""
    return (
        db.query(Dataset)
        .filter(Dataset.owner_id == current_user.id)
        .order_by(Dataset.created_at.desc())
        .all()
    )


# ─── History ──────────────────────────────────────────────────────────────────

@router.get("/history", response_model=List[DatasetHistoryItem])
def dataset_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return all datasets with pre-aggregated analysis stats."""
    datasets = (
        db.query(Dataset)
        .filter(Dataset.owner_id == current_user.id)
        .order_by(Dataset.created_at.desc())
        .all()
    )

    items = []
    for ds in datasets:
        finding_stats = db.query(
            func.count(Finding.id).label("total"),
            func.coalesce(func.sum(Finding.potential_saving), 0).label("total_savings"),
            func.coalesce(func.sum(Finding.annualized_saving), 0).label("annualized_savings"),
        ).filter(Finding.dataset_id == ds.id).first()

        anomaly_count = (
            db.query(func.count(Anomaly.id))
            .filter(Anomaly.dataset_id == ds.id)
            .scalar()
        )

        items.append(DatasetHistoryItem(
            id=ds.id,
            name=ds.name,
            description=ds.description,
            status=ds.status.value if hasattr(ds.status, "value") else ds.status,
            source_type=ds.source_type.value if hasattr(ds.source_type, "value") else (ds.source_type or "csv_upload"),
            source_name=ds.source_name,
            source_filename=ds.source_filename,
            row_count=ds.row_count,
            total_cost=ds.total_cost,
            date_range_start=ds.date_range_start,
            date_range_end=ds.date_range_end,
            opportunity_count=finding_stats.total if finding_stats else 0,
            anomaly_count=anomaly_count or 0,
            potential_savings=float(finding_stats.total_savings) if finding_stats else 0.0,
            annualized_savings=float(finding_stats.annualized_savings) if finding_stats else 0.0,
            created_at=ds.created_at,
            updated_at=ds.updated_at,
        ))

    return items


# ─── Single dataset ───────────────────────────────────────────────────────────

@router.get("/{dataset_id}", response_model=DatasetRead)
def get_dataset(
    dataset_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _require_owner(dataset_id, current_user, db)


# ─── Source 1: FOCUS import ───────────────────────────────────────────────────

@router.post("/import/focus", response_model=DatasetRead, status_code=201)
async def import_focus(
    file: UploadFile = File(...),
    name: str = Form(...),
    description: str = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Import a FOCUS-compatible cost and usage dataset.
    FOCUS is a data specification — this is a file import, not a live connection.
    """
    _validate_file_type(file, allowed=("csv", "json"))
    content = await file.read()
    return await _ingest_and_analyze(
        db=db, user=current_user,
        file_content=content,
        filename=file.filename or "focus_import.csv",
        dataset_name=name,
        source_type=SourceType.focus,
        source_name="FOCUS",
        description=description,
    )


# ─── Source 2: CSV Upload ─────────────────────────────────────────────────────

@router.post("/import/csv", response_model=DatasetRead, status_code=201)
async def import_csv(
    file: UploadFile = File(...),
    name: str = Form(...),
    description: str = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload a custom CSV cost and usage dataset."""
    _validate_file_type(file, allowed=("csv",))
    content = await file.read()
    return await _ingest_and_analyze(
        db=db, user=current_user,
        file_content=content,
        filename=file.filename or "upload.csv",
        dataset_name=name,
        source_type=SourceType.csv_upload,
        source_name="CSV Upload",
        description=description,
    )


# ─── Source 6: Google Cloud Billing Export ────────────────────────────────────

@router.post("/import/gcp_billing", response_model=DatasetRead, status_code=201)
async def import_gcp_billing(
    file: UploadFile = File(...),
    name: str = Form(...),
    description: str = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Import a Google Cloud Billing export (CSV or JSON).
    This is a file import — not a live billing API connection.
    """
    _validate_file_type(file, allowed=("csv", "json"))
    content = await file.read()
    return await _ingest_and_analyze(
        db=db, user=current_user,
        file_content=content,
        filename=file.filename or "gcp_billing.csv",
        dataset_name=name,
        source_type=SourceType.gcp_billing,
        source_name="Google Cloud Billing Export",
        description=description,
    )


# ─── Legacy upload (preserved for backward compatibility) ─────────────────────

@router.post("/upload", response_model=DatasetRead, status_code=201)
async def upload_dataset_legacy(
    file: UploadFile = File(...),
    name: str = Form(...),
    description: str = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Legacy upload endpoint — maps to csv_upload source type.
    Kept for backward compatibility with existing frontend calls.
    """
    _validate_file_type(file, allowed=("csv", "json"))
    content = await file.read()
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    source_type = SourceType.csv_upload
    return await _ingest_and_analyze(
        db=db, user=current_user,
        file_content=content,
        filename=file.filename or "upload.csv",
        dataset_name=name,
        source_type=source_type,
        source_name="CSV Upload",
        description=description,
    )


# ─── Delete ───────────────────────────────────────────────────────────────────

@router.delete("/{dataset_id}", status_code=204)
def delete_dataset(
    dataset_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    dataset = _require_owner(dataset_id, current_user, db)
    db.delete(dataset)
    db.commit()
    logger.info(f"Dataset {dataset_id} deleted by user {current_user.id}")


# ─── Re-analyze ───────────────────────────────────────────────────────────────

@router.post("/{dataset_id}/analyze", response_model=dict)
async def re_analyze_dataset(
    dataset_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    dataset = _require_owner(dataset_id, current_user, db)
    df = load_dataframe_from_db(db, dataset_id)
    result = run_full_analysis(db, dataset, df)
    return result


# ─── Validation helper ────────────────────────────────────────────────────────

def _validate_file_type(file: UploadFile, allowed: tuple) -> None:
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '.{ext}'. Allowed: {', '.join(allowed)}",
        )
