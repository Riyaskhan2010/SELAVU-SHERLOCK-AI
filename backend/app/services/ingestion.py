"""
Data ingestion and normalization pipeline.
Accepts CSV or JSON billing exports and normalizes to the internal CostRecord schema.
Designed for FOCUS-compatible datasets and general structured billing exports.
"""
import io
import json
import logging
from datetime import date
from typing import List, Dict, Any, Optional, Tuple
import pandas as pd
import numpy as np
from sqlalchemy.orm import Session

from app.models.dataset import Dataset, CostRecord, DatasetStatus

logger = logging.getLogger(__name__)

# ─── Column alias maps ────────────────────────────────────────────────────────
# Maps common billing export column names → our normalized field names
COLUMN_ALIASES: Dict[str, str] = {
    # Date
    "date": "date", "usage_date": "date", "usagedate": "date",
    "billing_period_start": "date", "billingperiodstartdate": "date",
    "period_start": "date", "start_date": "date", "day": "date",
    # Service
    "service": "service", "service_name": "service", "servicename": "service",
    "product_name": "service", "productname": "service",
    "resource_type": "service", "meter_category": "service",
    # Resource
    "resource_id": "resource_id", "resourceid": "resource_id",
    "instance_id": "resource_id", "instanceid": "resource_id",
    "resource_name": "resource_name", "resourcename": "resource_name",
    "instance_name": "resource_name", "instancename": "resource_name",
    # Team / Tags
    "team": "team", "department": "team", "team_name": "team",
    "cost_center": "team", "costcenter": "team", "project": "team",
    # Environment
    "environment": "environment", "env": "environment",
    "stage": "environment", "deployment_env": "environment",
    # Region
    "region": "region", "location": "region", "availability_zone": "region",
    # Cost
    "cost": "cost", "amount": "cost", "total_cost": "cost",
    "unblended_cost": "cost", "blended_cost": "cost",
    "billed_cost": "cost", "charge_amount": "cost", "line_item_unblended_cost": "cost",
    # Usage
    "usage_quantity": "usage_quantity", "quantity": "usage_quantity",
    "usage_amount": "usage_quantity", "usagequantity": "usage_quantity",
    "usage_unit": "usage_unit", "unit_of_measure": "usage_unit",
    # Utilization
    "cpu_utilization": "cpu_utilization_avg",
    "cpu_util": "cpu_utilization_avg",
    "average_cpu": "cpu_utilization_avg",
    "memory_utilization": "memory_utilization_avg",
    "mem_util": "memory_utilization_avg",
}


def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Lowercase and alias column names."""
    df.columns = [c.strip().lower().replace(" ", "_").replace("-", "_") for c in df.columns]
    df = df.rename(columns={k: v for k, v in COLUMN_ALIASES.items() if k in df.columns})
    return df


def _coerce_date(val: Any) -> Optional[date]:
    """Parse various date formats to a date object."""
    if pd.isna(val):
        return None
    try:
        return pd.to_datetime(str(val)).date()
    except Exception:
        return None


def _validate_required_columns(df: pd.DataFrame) -> Tuple[bool, str]:
    required = {"date", "service", "cost"}
    missing = required - set(df.columns)
    if missing:
        return False, f"Missing required columns: {', '.join(sorted(missing))}"
    return True, ""


def parse_file(file_content: bytes, filename: str) -> pd.DataFrame:
    """Parse CSV or JSON bytes into a raw DataFrame."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "csv"

    if ext == "csv":
        # Try common encodings
        for enc in ("utf-8", "utf-8-sig", "latin-1"):
            try:
                df = pd.read_csv(io.BytesIO(file_content), encoding=enc, low_memory=False)
                return df
            except UnicodeDecodeError:
                continue
        raise ValueError("Cannot decode CSV — unsupported encoding")

    elif ext == "json":
        data = json.loads(file_content.decode("utf-8"))
        if isinstance(data, list):
            return pd.DataFrame(data)
        elif isinstance(data, dict):
            # Handle {records: [...]} or FOCUS envelope
            for key in ("records", "data", "items", "line_items", "costs"):
                if key in data and isinstance(data[key], list):
                    return pd.DataFrame(data[key])
            return pd.DataFrame([data])
        raise ValueError("Unsupported JSON structure")

    raise ValueError(f"Unsupported file extension: {ext}")


def normalize_dataframe(df: pd.DataFrame) -> Tuple[pd.DataFrame, List[str]]:
    """
    Normalize a raw billing DataFrame to our internal schema.
    Returns (normalized_df, warnings).
    """
    warnings: List[str] = []
    df = _normalize_columns(df)

    ok, err = _validate_required_columns(df)
    if not ok:
        raise ValueError(err)

    # ── Date ──────────────────────────────────────────────────────────────
    df["date"] = df["date"].apply(_coerce_date)
    null_dates = df["date"].isna().sum()
    if null_dates > 0:
        warnings.append(f"{null_dates} rows dropped due to invalid dates")
    df = df.dropna(subset=["date"])

    # ── Cost ──────────────────────────────────────────────────────────────
    df["cost"] = pd.to_numeric(df["cost"], errors="coerce").fillna(0.0)
    df = df[df["cost"] >= 0]  # drop negative costs (credits handled separately)

    # ── Service ───────────────────────────────────────────────────────────
    df["service"] = df["service"].astype(str).str.strip()
    df["service"] = df["service"].replace("", "Unknown")
    df["service"] = df["service"].replace("nan", "Unknown")

    # ── Optional string fields ────────────────────────────────────────────
    for col in ("resource_id", "resource_name", "resource_type", "team",
                "environment", "region", "account_id", "usage_unit"):
        if col in df.columns:
            df[col] = df[col].astype(str).str.strip().replace("nan", None).replace("", None)
        else:
            df[col] = None

    # ── Optional numeric fields ───────────────────────────────────────────
    for col in ("usage_quantity", "cpu_utilization_avg", "memory_utilization_avg",
                "network_in_gb", "network_out_gb"):
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
        else:
            df[col] = np.nan

    # Clamp utilization to [0, 100]
    for col in ("cpu_utilization_avg", "memory_utilization_avg"):
        mask = df[col].notna()
        df.loc[mask, col] = df.loc[mask, col].clip(0, 100)

    # ── Tags: collect leftover columns ────────────────────────────────────
    known = {
        "date", "service", "resource_id", "resource_name", "resource_type",
        "team", "environment", "region", "account_id", "cost", "currency",
        "usage_quantity", "usage_unit", "cpu_utilization_avg",
        "memory_utilization_avg", "network_in_gb", "network_out_gb",
    }
    tag_cols = [c for c in df.columns if c not in known]
    if tag_cols:
        df["tags"] = df[tag_cols].apply(
            lambda row: {k: str(v) for k, v in row.items() if pd.notna(v)},
            axis=1
        )
    else:
        df["tags"] = [{}] * len(df)

    return df, warnings


def persist_records(
    db: Session,
    df: pd.DataFrame,
    dataset: Dataset,
) -> int:
    """Bulk-insert normalized records into the database."""
    records = []
    for _, row in df.iterrows():
        record = CostRecord(
            dataset_id=dataset.id,
            date=row["date"],
            service=row["service"],
            resource_id=row.get("resource_id"),
            resource_name=row.get("resource_name"),
            resource_type=row.get("resource_type"),
            team=row.get("team"),
            environment=row.get("environment"),
            region=row.get("region"),
            account_id=row.get("account_id"),
            cost=float(row["cost"]),
            currency="USD",
            usage_quantity=None if pd.isna(row.get("usage_quantity", float("nan"))) else float(row["usage_quantity"]),
            usage_unit=row.get("usage_unit"),
            cpu_utilization_avg=None if pd.isna(row.get("cpu_utilization_avg", float("nan"))) else float(row["cpu_utilization_avg"]),
            memory_utilization_avg=None if pd.isna(row.get("memory_utilization_avg", float("nan"))) else float(row["memory_utilization_avg"]),
            network_in_gb=None if pd.isna(row.get("network_in_gb", float("nan"))) else float(row["network_in_gb"]),
            network_out_gb=None if pd.isna(row.get("network_out_gb", float("nan"))) else float(row["network_out_gb"]),
            tags=row.get("tags") or {},
        )
        records.append(record)

    db.bulk_save_objects(records)
    db.flush()

    # Update dataset stats
    dataset.row_count = len(records)
    dataset.total_cost = float(df["cost"].sum())
    dataset.date_range_start = df["date"].min()
    dataset.date_range_end = df["date"].max()
    dataset.status = DatasetStatus.ready
    db.commit()

    return len(records)


def load_dataframe_from_db(db: Session, dataset_id: int) -> pd.DataFrame:
    """Load cost records for a dataset back into a DataFrame for analysis."""
    from sqlalchemy import text
    result = db.execute(
        text("""
            SELECT date, service, resource_id, resource_name, resource_type,
                   team, environment, region, cost, usage_quantity, usage_unit,
                   cpu_utilization_avg, memory_utilization_avg,
                   network_in_gb, network_out_gb, tags
            FROM cost_records
            WHERE dataset_id = :dataset_id
            ORDER BY date ASC
        """),
        {"dataset_id": dataset_id}
    )
    rows = result.fetchall()
    if not rows:
        return pd.DataFrame()

    df = pd.DataFrame(rows, columns=result.keys())
    df["date"] = pd.to_datetime(df["date"])
    df["cost"] = pd.to_numeric(df["cost"])
    return df
