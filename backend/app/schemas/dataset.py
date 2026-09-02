from pydantic import BaseModel
from typing import Optional, Dict, Any
from datetime import date, datetime

# Human-readable labels for each source_type value
SOURCE_TYPE_LABELS: Dict[str, str] = {
    "focus":          "FOCUS",
    "csv_upload":     "CSV Upload",
    "aws_cloudwatch": "AWS CloudWatch",
    "azure_monitor":  "Azure Monitor",
    "gcp_monitoring": "Google Cloud Monitoring",
    "gcp_billing":    "Google Cloud Billing Export",
}


class DatasetCreate(BaseModel):
    name: str
    description: Optional[str] = None


class DatasetRead(BaseModel):
    id: int
    name: str
    description: Optional[str]
    status: str
    source_type: Optional[str] = "csv_upload"
    source_name: Optional[str] = None
    source_filename: Optional[str] = None
    row_count: int
    total_cost: float
    date_range_start: Optional[date]
    date_range_end: Optional[date]
    created_at: datetime
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


class DatasetHistoryItem(BaseModel):
    """Rich dataset record for the Dataset History page."""
    id: int
    name: str
    description: Optional[str]
    status: str
    source_type: Optional[str] = "csv_upload"
    source_name: Optional[str] = None
    source_filename: Optional[str] = None
    row_count: int
    total_cost: float
    date_range_start: Optional[date]
    date_range_end: Optional[date]
    # Aggregated analysis stats
    opportunity_count: int
    anomaly_count: int
    potential_savings: float
    annualized_savings: float
    created_at: datetime
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


class CostRecordRead(BaseModel):
    id: int
    dataset_id: int
    date: date
    service: str
    resource_id: Optional[str]
    resource_name: Optional[str]
    team: Optional[str]
    environment: Optional[str]
    region: Optional[str]
    cost: float
    usage_quantity: Optional[float]
    usage_unit: Optional[str]
    cpu_utilization_avg: Optional[float]
    tags: Optional[Dict[str, Any]]

    model_config = {"from_attributes": True}
