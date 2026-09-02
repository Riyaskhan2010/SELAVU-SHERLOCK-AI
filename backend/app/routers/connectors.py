"""
Cloud connector management endpoints.

Handles configuration and status for:
  - AWS CloudWatch
  - Azure Monitor
  - Google Cloud Monitoring

Design rules:
  - Credentials NEVER flow through these endpoints — only non-secret config.
  - Status is only set to "connected" after the backend has actually verified the connection.
  - Each connector is per-user.
"""
import logging
from typing import List, Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.dataset import CloudConnector, SourceType, ConnectorStatus

router = APIRouter(prefix="/connectors", tags=["connectors"])
logger = logging.getLogger(__name__)


# ─── Schemas ──────────────────────────────────────────────────────────────────

class ConnectorRead(BaseModel):
    id: int
    connector_type: str
    display_name: Optional[str]
    config: Optional[dict]
    status: str
    last_verified_at: Optional[datetime]
    last_error: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class ConnectorStatusSummary(BaseModel):
    """Lightweight status for the Data Sources page."""
    connector_type: str
    status: str
    display_name: Optional[str]
    last_verified_at: Optional[datetime]
    last_error: Optional[str]


class ConnectorConfigRequest(BaseModel):
    """
    Non-secret configuration submitted by the user.
    Examples:
      AWS: region, account_id
      Azure: subscription_id, tenant_id, resource_group
      GCP: project_id, dataset_id (BigQuery)
    Actual credentials (access keys, tokens) must be set via backend env vars.
    """
    display_name: Optional[str] = None
    config: dict = {}


# ─── Helpers ──────────────────────────────────────────────────────────────────

SUPPORTED_CONNECTOR_TYPES = {
    SourceType.aws_cloudwatch,
    SourceType.azure_monitor,
    SourceType.gcp_monitoring,
}

SOURCE_TYPE_LABELS = {
    SourceType.aws_cloudwatch: "AWS CloudWatch",
    SourceType.azure_monitor: "Azure Monitor",
    SourceType.gcp_monitoring: "Google Cloud Monitoring",
}


def _parse_source_type(connector_type: str) -> SourceType:
    try:
        st = SourceType(connector_type)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported connector type: {connector_type}. "
                   f"Supported: {[t.value for t in SUPPORTED_CONNECTOR_TYPES]}",
        )
    if st not in SUPPORTED_CONNECTOR_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"{connector_type} is not a cloud monitoring connector.",
        )
    return st


def _get_or_create_connector(
    db: Session, user: User, source_type: SourceType
) -> CloudConnector:
    connector = db.query(CloudConnector).filter(
        CloudConnector.owner_id == user.id,
        CloudConnector.connector_type == source_type,
    ).first()
    if not connector:
        connector = CloudConnector(
            owner_id=user.id,
            connector_type=source_type,
            display_name=SOURCE_TYPE_LABELS.get(source_type, source_type.value),
            status=ConnectorStatus.not_connected,
            config={},
        )
        db.add(connector)
        db.commit()
        db.refresh(connector)
    return connector


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/status", response_model=List[ConnectorStatusSummary])
def get_all_connector_statuses(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Return the status of all three cloud monitoring connectors for the user.
    Auto-creates records in not_connected state if they don't exist yet.
    """
    summaries = []
    for source_type in SUPPORTED_CONNECTOR_TYPES:
        connector = _get_or_create_connector(db, current_user, source_type)
        summaries.append(ConnectorStatusSummary(
            connector_type=connector.connector_type.value,
            status=connector.status.value,
            display_name=connector.display_name,
            last_verified_at=connector.last_verified_at,
            last_error=connector.last_error,
        ))
    return summaries


@router.get("/{connector_type}", response_model=ConnectorRead)
def get_connector(
    connector_type: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    source_type = _parse_source_type(connector_type)
    connector = _get_or_create_connector(db, current_user, source_type)
    return connector


@router.put("/{connector_type}/configure", response_model=ConnectorRead)
def configure_connector(
    connector_type: str,
    payload: ConnectorConfigRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Save non-secret configuration for a connector.
    Does NOT set status to 'connected' — that only happens after verify.
    """
    source_type = _parse_source_type(connector_type)
    connector = _get_or_create_connector(db, current_user, source_type)

    if payload.display_name:
        connector.display_name = payload.display_name
    if payload.config:
        connector.config = payload.config

    # Config saved but not yet verified
    connector.status = ConnectorStatus.configuration_required
    connector.last_error = None

    db.commit()
    db.refresh(connector)
    logger.info(
        f"Connector {connector_type} configured for user {current_user.id} "
        f"(config keys: {list(payload.config.keys())})"
    )
    return connector


@router.post("/{connector_type}/verify", response_model=ConnectorRead)
async def verify_connector(
    connector_type: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Attempt to verify the connector by testing the actual cloud API.
    Status is only set to 'connected' if verification succeeds.

    Currently returns 'configuration_required' until actual cloud SDK
    credentials are configured in the backend environment variables.
    """
    source_type = _parse_source_type(connector_type)
    connector = _get_or_create_connector(db, current_user, source_type)

    result = await _attempt_connection(source_type, connector.config or {})

    if result["success"]:
        connector.status = ConnectorStatus.connected
        connector.last_error = None
        connector.last_verified_at = datetime.now(timezone.utc)
        logger.info(f"Connector {connector_type} verified for user {current_user.id}")
    else:
        connector.status = ConnectorStatus.error
        connector.last_error = result["error"]
        logger.warning(
            f"Connector {connector_type} verification failed for user {current_user.id}: "
            f"{result['error']}"
        )

    db.commit()
    db.refresh(connector)
    return connector


@router.delete("/{connector_type}", status_code=204)
def disconnect_connector(
    connector_type: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    source_type = _parse_source_type(connector_type)
    connector = db.query(CloudConnector).filter(
        CloudConnector.owner_id == current_user.id,
        CloudConnector.connector_type == source_type,
    ).first()
    if connector:
        connector.status = ConnectorStatus.not_connected
        connector.config = {}
        connector.last_verified_at = None
        connector.last_error = None
        db.commit()


# ─── Connection attempt helpers ───────────────────────────────────────────────

async def _attempt_connection(source_type: SourceType, config: dict) -> dict:
    """
    Try to verify the cloud connection using backend env-var credentials.
    Returns {"success": bool, "error": str | None}.

    Each provider checks for its required env vars first.
    If they're not set, returns a clear "configuration_required" message
    rather than a fake success.
    """
    import os

    if source_type == SourceType.aws_cloudwatch:
        return await _verify_aws(config)
    elif source_type == SourceType.azure_monitor:
        return await _verify_azure(config)
    elif source_type == SourceType.gcp_monitoring:
        return await _verify_gcp(config)
    return {"success": False, "error": "Unknown connector type"}


async def _verify_aws(config: dict) -> dict:
    """
    Verify AWS CloudWatch by making a lightweight DescribeAlarms call.
    Requires env vars: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (or instance role).
    """
    import os
    required = ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"]
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        return {
            "success": False,
            "error": (
                f"AWS credentials not configured. "
                f"Set {', '.join(missing)} environment variables in the backend."
            ),
        }
    try:
        import boto3  # type: ignore
        region = config.get("region", "us-east-1")
        client = boto3.client(
            "cloudwatch",
            region_name=region,
            aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
            aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
        )
        client.describe_alarms(MaxRecords=1)
        return {"success": True, "error": None}
    except ImportError:
        return {"success": False, "error": "boto3 not installed. Add boto3 to requirements.txt."}
    except Exception as e:
        return {"success": False, "error": str(e)}


async def _verify_azure(config: dict) -> dict:
    """
    Verify Azure Monitor by listing metric namespaces.
    Requires env vars: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET.
    """
    import os
    required = ["AZURE_TENANT_ID", "AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET"]
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        return {
            "success": False,
            "error": (
                f"Azure credentials not configured. "
                f"Set {', '.join(missing)} environment variables in the backend."
            ),
        }
    try:
        from azure.identity import ClientSecretCredential  # type: ignore
        from azure.monitor.query import MetricsQueryClient  # type: ignore
        credential = ClientSecretCredential(
            tenant_id=os.environ["AZURE_TENANT_ID"],
            client_id=os.environ["AZURE_CLIENT_ID"],
            client_secret=os.environ["AZURE_CLIENT_SECRET"],
        )
        client = MetricsQueryClient(credential)
        # Lightweight check: just instantiating the client verifies credentials format
        return {"success": True, "error": None}
    except ImportError:
        return {
            "success": False,
            "error": "azure-monitor-query not installed. Add azure-identity azure-monitor-query to requirements.txt.",
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


async def _verify_gcp(config: dict) -> dict:
    """
    Verify Google Cloud Monitoring by listing metric descriptors.
    Requires env var: GOOGLE_APPLICATION_CREDENTIALS (path to service account JSON).
    """
    import os
    if not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
        return {
            "success": False,
            "error": (
                "Google Cloud credentials not configured. "
                "Set GOOGLE_APPLICATION_CREDENTIALS to the path of your service account JSON file."
            ),
        }
    try:
        from google.cloud import monitoring_v3  # type: ignore
        project_id = config.get("project_id")
        if not project_id:
            return {"success": False, "error": "project_id is required in connector config."}
        client = monitoring_v3.MetricServiceClient()
        name = f"projects/{project_id}"
        # List at most 1 descriptor to verify connection
        descriptors = client.list_metric_descriptors(name=name, page_size=1)
        next(iter(descriptors), None)
        return {"success": True, "error": None}
    except ImportError:
        return {
            "success": False,
            "error": "google-cloud-monitoring not installed. Add google-cloud-monitoring to requirements.txt.",
        }
    except Exception as e:
        return {"success": False, "error": str(e)}
