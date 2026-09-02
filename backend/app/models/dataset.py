from sqlalchemy import (
    Column, Integer, String, Float, DateTime, Text,
    ForeignKey, JSON, Enum as SAEnum, Date, Boolean
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.core.database import Base


class DatasetStatus(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    ready = "ready"
    error = "error"


class SourceType(str, enum.Enum):
    focus = "focus"
    csv_upload = "csv_upload"
    aws_cloudwatch = "aws_cloudwatch"
    azure_monitor = "azure_monitor"
    gcp_monitoring = "gcp_monitoring"
    gcp_billing = "gcp_billing"


class ConnectorStatus(str, enum.Enum):
    not_connected = "not_connected"
    configuration_required = "configuration_required"
    connected = "connected"
    error = "error"


class Dataset(Base):
    __tablename__ = "datasets"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # Identity
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)

    # Source tracking — which of the 6 data sources this came from
    source_type = Column(
        SAEnum(SourceType),
        default=SourceType.csv_upload,
        nullable=False,
    )
    source_name = Column(String(255), nullable=True)   # human label e.g. "AWS CloudWatch — us-east-1"
    source_filename = Column(String(500), nullable=True)

    # Processing
    status = Column(SAEnum(DatasetStatus), default=DatasetStatus.pending)
    row_count = Column(Integer, default=0)
    total_cost = Column(Float, default=0.0)
    date_range_start = Column(Date, nullable=True)
    date_range_end = Column(Date, nullable=True)

    # Schema version for forward compatibility
    schema_version = Column(String(50), default="v1")

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        onupdate=func.now(),
        server_default=func.now(),
    )

    # Relationships
    owner = relationship("User", back_populates="datasets")
    cost_records = relationship(
        "CostRecord", back_populates="dataset", cascade="all, delete-orphan"
    )
    findings = relationship(
        "Finding", back_populates="dataset", cascade="all, delete-orphan"
    )
    anomalies = relationship(
        "Anomaly", back_populates="dataset", cascade="all, delete-orphan"
    )


class CostRecord(Base):
    """
    Normalized cost record — FOCUS-compatible field names.
    All 6 data sources normalize into this schema.
    """
    __tablename__ = "cost_records"

    id = Column(Integer, primary_key=True, index=True)
    dataset_id = Column(Integer, ForeignKey("datasets.id"), nullable=False, index=True)

    # Time
    date = Column(Date, nullable=False, index=True)

    # Resource dimensions
    service = Column(String(255), nullable=False, index=True)
    resource_id = Column(String(500), nullable=True)
    resource_name = Column(String(500), nullable=True)
    resource_type = Column(String(255), nullable=True)

    # Org dimensions
    team = Column(String(255), nullable=True, index=True)
    environment = Column(String(100), nullable=True)
    region = Column(String(100), nullable=True)
    account_id = Column(String(100), nullable=True)

    # Cost
    cost = Column(Float, nullable=False)
    currency = Column(String(10), default="USD")

    # Usage
    usage_quantity = Column(Float, nullable=True)
    usage_unit = Column(String(100), nullable=True)

    # Utilization (optional — from monitoring sources)
    cpu_utilization_avg = Column(Float, nullable=True)
    memory_utilization_avg = Column(Float, nullable=True)
    network_in_gb = Column(Float, nullable=True)
    network_out_gb = Column(Float, nullable=True)

    # Arbitrary extra fields from the source
    tags = Column(JSON, nullable=True)

    dataset = relationship("Dataset", back_populates="cost_records")


class CloudConnector(Base):
    """
    Stores cloud monitoring connector configuration per user.
    Credentials are NEVER stored here — only non-secret config (region, account ID, etc.).
    Actual secrets live in environment variables or a secrets manager.
    """
    __tablename__ = "cloud_connectors"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    connector_type = Column(SAEnum(SourceType), nullable=False)  # aws_cloudwatch | azure_monitor | gcp_monitoring
    display_name = Column(String(255), nullable=True)

    # Non-secret config (region, project ID, subscription ID, etc.)
    config = Column(JSON, nullable=True, default=dict)

    # Status — only set to "connected" after the backend has verified the connection
    status = Column(
        SAEnum(ConnectorStatus),
        default=ConnectorStatus.not_connected,
        nullable=False,
    )
    last_verified_at = Column(DateTime(timezone=True), nullable=True)
    last_error = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        onupdate=func.now(),
        server_default=func.now(),
    )

    owner = relationship("User")
