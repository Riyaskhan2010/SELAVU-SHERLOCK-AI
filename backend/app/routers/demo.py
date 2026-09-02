"""
Demo Data router — /api/demo/*

Serves a shared, read-only demonstration dataset available to every
authenticated user. This data is:

  - Never associated with any individual user's account.
  - Never returned by /api/datasets or /api/datasets/history.
  - Computed once per process startup, then cached in memory.
  - Rebuilt on restart (deterministic seed → same numbers every time).

The demo dataset demonstrates:
  - 90-day multi-service cost history
  - Cost anomaly (Data Transfer spike ~day 60)
  - Underutilized compute resources (low CPU, high cost)
  - Optimization opportunities with evidence
  - AI-generated explanation from the analysis engine
"""
import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from sqlalchemy.orm import Session

router = APIRouter(prefix="/demo", tags=["demo"])
logger = logging.getLogger(__name__)

# ─── In-memory cache ──────────────────────────────────────────────────────────
# Built once per process. Keyed by a constant so it's effectively a singleton.

_demo_cache: dict = {}

DEMO_DATASET_NAME = "Selavu Sherlock AI Demo — Q3 Cloud Costs (90 days)"
DEMO_DESCRIPTION = (
    "Shared demonstration dataset. "
    "Shows realistic cost patterns, anomaly detection, "
    "underutilized resources, and optimization opportunities."
)


def _get_or_build_demo() -> dict:
    """Build (or return cached) demo analysis results."""
    global _demo_cache
    if _demo_cache:
        return _demo_cache

    logger.info("Building demo dataset (first request)…")
    import pandas as pd
    import numpy as np
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from app.services.sample_data import generate_sample_records
    from app.services.ingestion import normalize_dataframe
    from app.detection.rules import run_all_rules
    from app.detection.statistical import run_statistical_detection

    # --- Build a DataFrame from sample records ---
    records = generate_sample_records(90)
    df_raw = pd.DataFrame(records)
    df_raw.rename(columns={
        "date": "date", "service": "service", "cost": "cost",
        "team": "team", "resource_id": "resource_id",
        "resource_name": "resource_name",
        "cpu_utilization_avg": "cpu_utilization_avg",
        "usage_quantity": "usage_quantity", "usage_unit": "usage_unit",
    }, inplace=True)
    df_raw["date"] = pd.to_datetime(df_raw["date"])

    df = df_raw.copy()

    # --- Summary ---
    total_cost = float(df["cost"].sum())
    total_days = (df["date"].max() - df["date"].min()).days + 1
    midpoint = df["date"].min() + pd.Timedelta(days=total_days // 2)
    curr_df = df[df["date"] >= midpoint]
    prev_df = df[df["date"] < midpoint]
    curr_cost = float(curr_df["cost"].sum())
    prev_cost = float(prev_df["cost"].sum())
    cost_change_pct = ((curr_cost - prev_cost) / (prev_cost + 1e-8)) * 100

    # --- Run detection ---
    rule_findings = run_all_rules(df)
    statistical_anomalies = run_statistical_detection(df)

    # Build mock Finding / Anomaly objects for the cache
    findings_list = []
    for i, r in enumerate(rule_findings):
        findings_list.append({
            "id": i + 1,
            "dataset_id": 0,
            "finding_type": r.finding_type,
            "title": r.title,
            "description": r.description,
            "service": r.service,
            "resource_id": r.resource_id,
            "resource_name": r.resource_name,
            "team": r.team,
            "priority": r.priority,
            "confidence": r.confidence,
            "current_cost": r.current_cost,
            "potential_saving": r.potential_saving,
            "annualized_saving": r.annualized_saving,
            "evidence_metrics": r.evidence_metrics,
            "savings_calculation": r.savings_calculation,
            "assumption": r.assumption,
            "ai_explanation": None,
            "recommendation": r.recommendation,
            "is_anomaly": r.is_anomaly,
            "anomaly_score": r.anomaly_score,
            "detection_method": r.detection_method,
            "created_at": "2024-09-01T00:00:00",
        })

    anomalies_list = []
    for i, a in enumerate(statistical_anomalies):
        anomalies_list.append({
            "id": i + 1,
            "dataset_id": 0,
            "finding_id": None,
            "date": a["date"],
            "service": a["service"],
            "team": None,
            "cost": a["cost"],
            "expected_cost": a["expected_cost"],
            "deviation_pct": a["deviation_pct"],
            "anomaly_score": a["anomaly_score"],
            "severity": a["severity"],
            "detection_method": a["detection_method"],
            "description": a["description"],
            "created_at": "2024-09-01T00:00:00",
        })

    # --- Daily trend ---
    daily = df.groupby("date")["cost"].sum().reset_index().sort_values("date")
    anomaly_dates = {a["date"] for a in anomalies_list}
    anomaly_score_map = {a["date"]: a["anomaly_score"] for a in anomalies_list}

    daily_trend = [
        {
            "date": str(row["date"])[:10],
            "cost": round(float(row["cost"]), 2),
            "is_anomaly": str(row["date"])[:10] in anomaly_dates,
            "anomaly_score": anomaly_score_map.get(str(row["date"])[:10]),
        }
        for _, row in daily.iterrows()
    ]

    # --- Service breakdown ---
    svc_curr = curr_df.groupby("service")["cost"].sum().reset_index()
    svc_prev = prev_df.groupby("service")["cost"].sum().reset_index().rename(columns={"cost": "prev_cost"})
    svc = svc_curr.merge(svc_prev, on="service", how="left").fillna({"prev_cost": 0})
    svc["pct"] = (svc["cost"] / (total_cost + 1e-8)) * 100
    svc["change"] = ((svc["cost"] - svc["prev_cost"]) / (svc["prev_cost"] + 1e-8)) * 100
    svc = svc.sort_values("cost", ascending=False)
    service_breakdown = [
        {"service": r["service"], "cost": round(float(r["cost"]), 2),
         "percentage": round(float(r["pct"]), 1), "change_pct": round(float(r["change"]), 1)}
        for _, r in svc.head(10).iterrows()
    ]

    # --- Team breakdown ---
    team_df = df.groupby("team", dropna=True)["cost"].sum().reset_index()
    team_df["pct"] = (team_df["cost"] / (total_cost + 1e-8)) * 100
    team_df = team_df.sort_values("cost", ascending=False)
    team_breakdown = [
        {"team": str(r["team"]) or "Untagged",
         "cost": round(float(r["cost"]), 2),
         "percentage": round(float(r["pct"]), 1)}
        for _, r in team_df.head(8).iterrows()
    ]

    # --- AI summary (sync fallback — async is called separately) ---
    potential_savings = sum(f["potential_saving"] for f in findings_list)
    top_service = service_breakdown[0]["service"] if service_breakdown else "N/A"
    ai_summary = (
        f"Demo dataset: ${total_cost:,.0f} total spend over {total_days} days "
        f"({'↑' if cost_change_pct > 0 else '↓'}{abs(cost_change_pct):.1f}% vs prior period). "
        f"{len(findings_list)} optimization opportunities with ~${potential_savings:,.0f}/month estimated potential savings. "
        f"{top_service} is the largest cost driver."
    )

    _demo_cache = {
        "summary": {
            "total_cost": round(total_cost, 2),
            "period_days": total_days,
            "daily_average": round(total_cost / max(total_days, 1), 2),
            "cost_change_pct": round(cost_change_pct, 1),
            "previous_period_cost": round(prev_cost, 2),
            "potential_savings": round(potential_savings, 2),
            "anomaly_count": len(anomalies_list),
            "opportunity_count": len(findings_list),
        },
        "service_breakdown": service_breakdown,
        "team_breakdown": team_breakdown,
        "daily_trend": daily_trend,
        "ai_summary": ai_summary,
        "findings": findings_list,
        "anomalies": anomalies_list,
    }
    logger.info(
        f"Demo dataset built: {len(records)} records, "
        f"{len(findings_list)} findings, {len(anomalies_list)} anomalies"
    )
    return _demo_cache


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/dashboard")
async def get_demo_dashboard():
    """Return demo dashboard data. Public — no auth required. Read-only shared data."""
    try:
        data = _get_or_build_demo()
        return data
    except Exception as e:
        logger.error(f"Demo dashboard build failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/findings")
def get_demo_findings(
    priority: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
):
    """Return demo optimization findings. Read-only, shared across all users."""
    data = _get_or_build_demo()
    findings = data["findings"]

    if priority:
        findings = [f for f in findings if f["priority"] == priority]

    total = len(findings)
    start = (page - 1) * page_size
    items = findings[start: start + page_size]

    import math
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": math.ceil(total / page_size) if total else 1,
    }


@router.get("/findings/{finding_id}")
def get_demo_finding(finding_id: int):
    data = _get_or_build_demo()
    findings = data["findings"]
    match = next((f for f in findings if f["id"] == finding_id), None)
    if not match:
        raise HTTPException(status_code=404, detail="Demo finding not found")
    return match


@router.post("/findings/{finding_id}/explain")
async def explain_demo_finding(finding_id: int):
    """Generate an AI explanation for a demo finding based on its evidence."""
    data = _get_or_build_demo()
    findings = data["findings"]
    finding = next((f for f in findings if f["id"] == finding_id), None)
    if not finding:
        raise HTTPException(status_code=404, detail="Demo finding not found")

    # Return cached explanation if already generated
    if finding.get("ai_explanation"):
        return {"explanation": finding["ai_explanation"]}

    try:
        from app.services.llm import get_llm_service, build_finding_explanation_prompt
        llm = get_llm_service()
        messages = build_finding_explanation_prompt(finding)
        explanation = await llm.complete(messages, max_tokens=256)
        finding["ai_explanation"] = explanation  # cache in memory
        return {"explanation": explanation}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI explanation failed: {str(e)}")


@router.get("/anomalies")
def get_demo_anomalies(
    severity: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
):
    """Return demo anomalies. Read-only, shared across all users."""
    data = _get_or_build_demo()
    anomalies = data["anomalies"]

    if severity:
        anomalies = [a for a in anomalies if a["severity"] == severity]

    total = len(anomalies)
    start = (page - 1) * page_size
    items = anomalies[start: start + page_size]

    import math
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": math.ceil(total / page_size) if total else 1,
    }
