from sqlalchemy import (
    Column, Integer, String, Float, DateTime, Text,
    ForeignKey, JSON, Boolean, Enum as SAEnum
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.core.database import Base


class FindingType(str, enum.Enum):
    underutilization = "underutilization"
    cost_spike = "cost_spike"
    idle_resource = "idle_resource"
    rightsizing = "rightsizing"
    scheduling = "scheduling"
    reserved_instance = "reserved_instance"
    data_transfer = "data_transfer"
    storage_optimization = "storage_optimization"
    anomaly = "anomaly"


class Priority(str, enum.Enum):
    critical = "critical"
    high = "high"
    medium = "medium"
    low = "low"


class Finding(Base):
    """
    A detected optimization finding with full evidence chain:
    data → detection → evidence → calculation → assumption → AI explanation → recommendation
    """
    __tablename__ = "findings"

    id = Column(Integer, primary_key=True, index=True)
    dataset_id = Column(Integer, ForeignKey("datasets.id"), nullable=False, index=True)

    # Classification
    finding_type = Column(SAEnum(FindingType), nullable=False)
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=False)

    # Affected resource
    service = Column(String(255), nullable=False)
    resource_id = Column(String(500), nullable=True)
    resource_name = Column(String(500), nullable=True)
    team = Column(String(255), nullable=True)

    # Scoring
    priority = Column(SAEnum(Priority), nullable=False)
    confidence = Column(Float, nullable=False)  # 0-100

    # Financials
    current_cost = Column(Float, nullable=False)
    potential_saving = Column(Float, nullable=False)
    annualized_saving = Column(Float, nullable=False)

    # Evidence — stored as JSON for flexibility
    evidence_metrics = Column(JSON, nullable=False, default=list)
    savings_calculation = Column(JSON, nullable=False, default=dict)
    assumption = Column(Text, nullable=False)

    # AI
    ai_explanation = Column(Text, nullable=True)
    recommendation = Column(Text, nullable=False)

    # Detection metadata
    is_anomaly = Column(Boolean, default=False)
    anomaly_score = Column(Float, nullable=True)
    detection_method = Column(String(255), nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    dataset = relationship("Dataset", back_populates="findings")


class Anomaly(Base):
    """
    Statistical anomaly record linked to a date/service combination.
    Separate from Finding to support a dedicated anomaly feed.
    """
    __tablename__ = "anomalies"

    id = Column(Integer, primary_key=True, index=True)
    dataset_id = Column(Integer, ForeignKey("datasets.id"), nullable=False, index=True)
    finding_id = Column(Integer, ForeignKey("findings.id"), nullable=True)

    date = Column(String(20), nullable=False)
    service = Column(String(255), nullable=False)
    team = Column(String(255), nullable=True)

    cost = Column(Float, nullable=False)
    expected_cost = Column(Float, nullable=False)
    deviation_pct = Column(Float, nullable=False)
    anomaly_score = Column(Float, nullable=False)

    severity = Column(SAEnum(Priority), nullable=False)
    detection_method = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    dataset = relationship("Dataset", back_populates="anomalies")
