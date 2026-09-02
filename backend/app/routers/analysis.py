from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.dataset import Dataset
from app.schemas.analysis import DashboardData
from app.services.analysis import build_dashboard

router = APIRouter(prefix="/analysis", tags=["analysis"])


@router.get("/dashboard/{dataset_id}", response_model=DashboardData)
async def get_dashboard(
    dataset_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Verify ownership
    dataset = db.query(Dataset).filter(
        Dataset.id == dataset_id,
        Dataset.owner_id == current_user.id,
    ).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if dataset.status != "ready":
        raise HTTPException(status_code=422, detail="Dataset is not ready for analysis")

    try:
        return await build_dashboard(db, dataset_id)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")
