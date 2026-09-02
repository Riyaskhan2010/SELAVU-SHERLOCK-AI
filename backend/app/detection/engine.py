"""
Main analysis engine — orchestrates rule-based + statistical detection,
persists findings, and returns structured results.
"""
import logging
from typing import List
from sqlalchemy.orm import Session
import pandas as pd

from app.detection.rules import run_all_rules, RuleResult
from app.detection.statistical import run_statistical_detection
from app.models.finding import Finding, Anomaly, FindingType, Priority
from app.models.dataset import Dataset

logger = logging.getLogger(__name__)


def _priority_to_enum(p: str) -> Priority:
    return Priority(p.lower()) if p.lower() in Priority.__members__ else Priority.medium


def _finding_type_to_enum(t: str) -> FindingType:
    return FindingType(t.lower()) if t.lower() in FindingType.__members__ else FindingType.anomaly


def run_full_analysis(
    db: Session,
    dataset: Dataset,
    df: pd.DataFrame,
) -> dict:
    """
    Full analysis pipeline:
    1. Rule-based detection
    2. Statistical/ML detection
    3. Persist findings and anomalies
    4. Return summary stats
    """
    logger.info(f"Running analysis on dataset {dataset.id} ({len(df)} rows)")

    # Clear previous findings for this dataset
    db.query(Finding).filter(Finding.dataset_id == dataset.id).delete()
    db.query(Anomaly).filter(Anomaly.dataset_id == dataset.id).delete()
    db.flush()

    # ── 1. Rule-based ─────────────────────────────────────────────────────
    rule_results: List[RuleResult] = run_all_rules(df)
    logger.info(f"Rule-based detection: {len(rule_results)} findings")

    persisted_findings = []
    for r in rule_results:
        finding = Finding(
            dataset_id=dataset.id,
            finding_type=_finding_type_to_enum(r.finding_type),
            title=r.title,
            description=r.description,
            service=r.service,
            resource_id=r.resource_id,
            resource_name=r.resource_name,
            team=r.team,
            priority=_priority_to_enum(r.priority),
            confidence=r.confidence,
            current_cost=r.current_cost,
            potential_saving=r.potential_saving,
            annualized_saving=r.annualized_saving,
            evidence_metrics=r.evidence_metrics,
            savings_calculation=r.savings_calculation,
            assumption=r.assumption,
            recommendation=r.recommendation,
            is_anomaly=r.is_anomaly,
            anomaly_score=r.anomaly_score,
            detection_method=r.detection_method,
        )
        db.add(finding)
        persisted_findings.append(finding)

    # ── 2. Statistical/ML anomalies ───────────────────────────────────────
    statistical_anomalies = run_statistical_detection(df)
    logger.info(f"Statistical detection: {len(statistical_anomalies)} anomalies")

    persisted_anomalies = []
    for a in statistical_anomalies:
        anomaly = Anomaly(
            dataset_id=dataset.id,
            date=a["date"],
            service=a["service"],
            cost=a["cost"],
            expected_cost=a["expected_cost"],
            deviation_pct=a["deviation_pct"],
            anomaly_score=a["anomaly_score"],
            severity=_priority_to_enum(a["severity"]),
            detection_method=a["detection_method"],
            description=a["description"],
        )
        db.add(anomaly)
        persisted_anomalies.append(anomaly)

        # Also create a Finding for high/critical statistical anomalies
        if a["severity"] in ("critical", "high") and abs(a["deviation_pct"]) > 50:
            delta = abs(a["cost"] - a["expected_cost"])
            finding = Finding(
                dataset_id=dataset.id,
                finding_type=FindingType.anomaly,
                title=f"Statistical Anomaly: {a['service']}",
                description=a["description"],
                service=a["service"],
                priority=_priority_to_enum(a["severity"]),
                confidence=round(a["anomaly_score"] * 100, 1),
                current_cost=a["cost"],
                potential_saving=round(delta * 0.8, 2),
                annualized_saving=0.0,
                evidence_metrics=[
                    {"label": "Actual Cost", "observed_value": a["cost"], "unit": "USD", "flagged": True},
                    {"label": "Expected Cost", "observed_value": a["expected_cost"], "unit": "USD"},
                    {"label": "Deviation", "observed_value": a["deviation_pct"], "unit": "%", "flagged": True},
                    {"label": "Anomaly Score", "observed_value": a["anomaly_score"], "flagged": True},
                ],
                savings_calculation={
                    "current_cost": a["cost"],
                    "optimized_cost": a["expected_cost"],
                    "potential_saving": round(delta, 2),
                    "saving_pct": round(abs(a["deviation_pct"]), 1),
                    "annualized_saving": 0.0,
                    "assumption": "Returning to baseline eliminates the anomalous excess cost.",
                },
                assumption="Statistical outlier detected. Root cause investigation required before acting.",
                recommendation="Investigate the root cause of this anomalous cost pattern before taking remediation action.",
                is_anomaly=True,
                anomaly_score=a["anomaly_score"],
                detection_method=a["detection_method"],
            )
            db.add(finding)
            persisted_findings.append(finding)

    db.commit()

    # ── 3. Refresh objects ────────────────────────────────────────────────
    db.refresh(dataset)

    total_savings = sum(f.potential_saving for f in persisted_findings)
    return {
        "findings_count": len(persisted_findings),
        "anomalies_count": len(persisted_anomalies),
        "total_potential_savings": round(total_savings, 2),
    }
