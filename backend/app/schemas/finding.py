from pydantic import BaseModel
from typing import Optional, List, Any, Dict
from datetime import datetime


class EvidenceMetric(BaseModel):
    label: str
    observed_value: Any
    unit: Optional[str] = None
    threshold: Optional[Any] = None
    flagged: bool = False


class SavingsCalculation(BaseModel):
    current_cost: float
    optimized_cost: float
    potential_saving: float
    saving_pct: float
    annualized_saving: float
    assumption: str


class FindingRead(BaseModel):
    id: int
    dataset_id: int
    finding_type: str
    title: str
    description: str
    service: str
    resource_id: Optional[str]
    resource_name: Optional[str]
    team: Optional[str]
    priority: str
    confidence: float
    current_cost: float
    potential_saving: float
    annualized_saving: float
    evidence_metrics: List[Dict]
    savings_calculation: Dict
    assumption: str
    ai_explanation: Optional[str]
    recommendation: str
    is_anomaly: bool
    anomaly_score: Optional[float]
    detection_method: str
    created_at: datetime

    model_config = {"from_attributes": True}


class AnomalyRead(BaseModel):
    id: int
    dataset_id: int
    finding_id: Optional[int]
    date: str
    service: str
    team: Optional[str]
    cost: float
    expected_cost: float
    deviation_pct: float
    anomaly_score: float
    severity: str
    detection_method: str
    description: str
    created_at: datetime

    model_config = {"from_attributes": True}


class PaginatedFindings(BaseModel):
    items: List[FindingRead]
    total: int
    page: int
    page_size: int
    pages: int


class PaginatedAnomalies(BaseModel):
    items: List[AnomalyRead]
    total: int
    page: int
    page_size: int
    pages: int
