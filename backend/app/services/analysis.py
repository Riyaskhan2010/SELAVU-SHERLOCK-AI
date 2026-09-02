"""
Analysis service — computes dashboard metrics from cost records.
"""
import logging
from typing import Optional
from sqlalchemy.orm import Session
import pandas as pd
import numpy as np

from app.models.dataset import Dataset
from app.models.finding import Finding, Anomaly
from app.schemas.analysis import (
    DashboardData, CostSummary, ServiceBreakdown, TeamBreakdown, DailyTrend,
)
from app.services.ingestion import load_dataframe_from_db
from app.services.llm import get_llm_service, build_dashboard_summary_prompt

logger = logging.getLogger(__name__)


async def build_dashboard(db: Session, dataset_id: int) -> DashboardData:
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise ValueError(f"Dataset {dataset_id} not found")

    df = load_dataframe_from_db(db, dataset_id)
    if df.empty:
        raise ValueError("Dataset has no cost records")

    # ── Period split: last half vs first half ─────────────────────────────
    total_days = (df["date"].max() - df["date"].min()).days + 1
    midpoint = df["date"].min() + pd.Timedelta(days=total_days // 2)

    curr_df = df[df["date"] >= midpoint]
    prev_df = df[df["date"] < midpoint]

    total_cost = float(df["cost"].sum())
    curr_cost = float(curr_df["cost"].sum())
    prev_cost = float(prev_df["cost"].sum())

    cost_change_pct = ((curr_cost - prev_cost) / (prev_cost + 1e-8)) * 100 if prev_cost > 0 else 0.0
    daily_avg = total_cost / max(total_days, 1)

    # ── Findings summary ──────────────────────────────────────────────────
    findings = db.query(Finding).filter(Finding.dataset_id == dataset_id).all()
    anomalies = db.query(Anomaly).filter(Anomaly.dataset_id == dataset_id).all()
    potential_savings = sum(f.potential_saving for f in findings)

    summary = CostSummary(
        total_cost=round(total_cost, 2),
        period_days=total_days,
        daily_average=round(daily_avg, 2),
        cost_change_pct=round(cost_change_pct, 1),
        previous_period_cost=round(prev_cost, 2),
        potential_savings=round(potential_savings, 2),
        anomaly_count=len(anomalies),
        opportunity_count=len(findings),
    )

    # ── Service breakdown ─────────────────────────────────────────────────
    svc_curr = curr_df.groupby("service")["cost"].sum().reset_index()
    svc_prev = prev_df.groupby("service")["cost"].sum().reset_index().rename(columns={"cost": "prev_cost"})
    svc = svc_curr.merge(svc_prev, on="service", how="left").fillna({"prev_cost": 0})
    svc["pct"] = (svc["cost"] / (total_cost + 1e-8)) * 100
    svc["change"] = ((svc["cost"] - svc["prev_cost"]) / (svc["prev_cost"] + 1e-8)) * 100
    svc = svc.sort_values("cost", ascending=False)

    service_breakdown = [
        ServiceBreakdown(
            service=row["service"],
            cost=round(row["cost"], 2),
            percentage=round(row["pct"], 1),
            change_pct=round(row["change"], 1),
        )
        for _, row in svc.head(10).iterrows()
    ]

    # ── Team breakdown ────────────────────────────────────────────────────
    team_df = df.groupby("team", dropna=True)["cost"].sum().reset_index()
    team_df["pct"] = (team_df["cost"] / (total_cost + 1e-8)) * 100
    team_df = team_df.sort_values("cost", ascending=False)

    team_breakdown = [
        TeamBreakdown(
            team=str(row["team"]) if row["team"] else "Untagged",
            cost=round(row["cost"], 2),
            percentage=round(row["pct"], 1),
        )
        for _, row in team_df.head(8).iterrows()
    ]

    # ── Daily trend ───────────────────────────────────────────────────────
    daily = df.groupby("date")["cost"].sum().reset_index().sort_values("date")

    # Get anomaly dates
    anomaly_dates = {a.date for a in anomalies}
    anomaly_score_map = {a.date: a.anomaly_score for a in anomalies}

    daily_trend = [
        DailyTrend(
            date=str(row["date"])[:10],
            cost=round(row["cost"], 2),
            is_anomaly=str(row["date"])[:10] in anomaly_dates,
            anomaly_score=anomaly_score_map.get(str(row["date"])[:10]),
        )
        for _, row in daily.iterrows()
    ]

    # ── AI executive summary ──────────────────────────────────────────────
    top_service = service_breakdown[0].service if service_breakdown else "N/A"
    summary_context = {
        "total_cost": total_cost,
        "period_days": total_days,
        "cost_change_pct": cost_change_pct,
        "anomaly_count": len(anomalies),
        "opportunity_count": len(findings),
        "potential_savings": potential_savings,
        "top_service": top_service,
    }

    ai_summary = "Analyzing cost data..."
    try:
        llm = get_llm_service()
        messages = build_dashboard_summary_prompt(summary_context)
        ai_summary = await llm.complete(messages, max_tokens=150)
    except Exception as e:
        logger.warning(f"AI summary generation failed: {e}")
        ai_summary = (
            f"Total spend of ${total_cost:,.0f} over {total_days} days "
            f"({'increased' if cost_change_pct > 0 else 'decreased'} {abs(cost_change_pct):.1f}% vs prior period). "
            f"{len(findings)} optimization opportunities identified with estimated potential savings of ${potential_savings:,.0f}/month."
        )

    return DashboardData(
        summary=summary,
        service_breakdown=service_breakdown,
        team_breakdown=team_breakdown,
        daily_trend=daily_trend,
        ai_summary=ai_summary,
    )
