"""
Deterministic rule-based anomaly and optimization detection.
These rules are transparent and produce traceable evidence.
"""
from dataclasses import dataclass, field
from typing import List, Optional, Any
import pandas as pd
import numpy as np


@dataclass
class RuleResult:
    """A single finding from a deterministic rule."""
    rule_id: str
    finding_type: str
    title: str
    description: str
    service: str
    resource_id: Optional[str]
    resource_name: Optional[str]
    team: Optional[str]
    priority: str  # critical | high | medium | low
    confidence: float  # 0–100
    current_cost: float
    potential_saving: float
    annualized_saving: float
    evidence_metrics: List[dict]
    savings_calculation: dict
    assumption: str
    recommendation: str
    is_anomaly: bool = False
    anomaly_score: Optional[float] = None
    detection_method: str = "deterministic_rule"


# ─── Thresholds (tuneable) ────────────────────────────────────────────────────
CPU_LOW_THRESHOLD = 15.0          # avg CPU% below which a resource is "underutilized"
CPU_VERY_LOW_THRESHOLD = 5.0      # near-idle
IDLE_HOURS_MIN = 168              # 7 days of continuous runtime = potentially idle
SPIKE_MULTIPLIER = 2.5            # cost > 2.5× rolling average = spike
SPIKE_MIN_DELTA = 50.0            # minimum $50 delta to flag as spike
SUSTAINED_HIGH_COST_PERCENTILE = 90  # resource in top 10% cost for >50% of period
HIGH_COST_LOW_UTIL_RATIO = 3.0    # cost rank / utilization rank threshold


def detect_underutilization(df: pd.DataFrame) -> List[RuleResult]:
    """
    Flag resources with high continuous cost but consistently low CPU utilization.
    Requires cpu_utilization_avg to be present.
    """
    results: List[RuleResult] = []

    util_df = df.dropna(subset=["cpu_utilization_avg", "resource_id"])
    if util_df.empty:
        return results

    grouped = util_df.groupby(["service", "resource_id", "resource_name", "team"]).agg(
        total_cost=("cost", "sum"),
        avg_cpu=("cpu_utilization_avg", "mean"),
        min_cpu=("cpu_utilization_avg", "min"),
        max_cpu=("cpu_utilization_avg", "max"),
        days=("date", "nunique"),
        usage_qty=("usage_quantity", "sum"),
    ).reset_index()

    # Only evaluate resources that ran for at least 7 days
    grouped = grouped[grouped["days"] >= 7]

    for _, row in grouped.iterrows():
        avg_cpu = row["avg_cpu"]
        if avg_cpu > CPU_LOW_THRESHOLD:
            continue

        cost = row["total_cost"]
        if cost < 50:  # skip tiny resources
            continue

        # Savings estimate: rightsizing down reduces cost proportionally
        # Conservative assumption: halving instance size saves ~40%
        if avg_cpu <= CPU_VERY_LOW_THRESHOLD:
            saving_pct = 0.65
            priority = "high"
            confidence = 91.0
            rec = "Consider stopping or scheduling this resource. CPU never exceeds 5% — strong candidate for termination or serverless migration."
        else:
            saving_pct = 0.35
            priority = "medium"
            confidence = 78.0
            rec = "Rightsize to a smaller instance type. Average CPU below 15% suggests over-provisioning."

        saving = cost * saving_pct
        optimized_cost = cost - saving

        results.append(RuleResult(
            rule_id="underutil_cpu",
            finding_type="underutilization",
            title=f"Underutilized Resource: {row['resource_name'] or row['resource_id']}",
            description=(
                f"{row['service']} resource running for {int(row['days'])} days "
                f"with average CPU utilization of {avg_cpu:.1f}%."
            ),
            service=str(row["service"]),
            resource_id=str(row["resource_id"]) if row["resource_id"] else None,
            resource_name=str(row["resource_name"]) if pd.notna(row["resource_name"]) else None,
            team=str(row["team"]) if pd.notna(row["team"]) else None,
            priority=priority,
            confidence=confidence,
            current_cost=round(cost, 2),
            potential_saving=round(saving, 2),
            annualized_saving=round(saving * 12, 2),
            evidence_metrics=[
                {"label": "Average CPU Utilization", "observed_value": round(avg_cpu, 1),
                 "unit": "%", "threshold": CPU_LOW_THRESHOLD, "flagged": True},
                {"label": "Min CPU Utilization", "observed_value": round(row["min_cpu"], 1),
                 "unit": "%", "flagged": avg_cpu <= CPU_VERY_LOW_THRESHOLD},
                {"label": "Max CPU Utilization", "observed_value": round(row["max_cpu"], 1),
                 "unit": "%", "flagged": False},
                {"label": "Days Running", "observed_value": int(row["days"]),
                 "unit": "days", "flagged": False},
                {"label": "Total Cost (Period)", "observed_value": round(cost, 2),
                 "unit": "USD", "flagged": False},
            ],
            savings_calculation={
                "current_cost": round(cost, 2),
                "optimized_cost": round(optimized_cost, 2),
                "potential_saving": round(saving, 2),
                "saving_pct": round(saving_pct * 100, 1),
                "annualized_saving": round(saving * 12, 2),
                "assumption": f"Rightsizing reduces cost by {saving_pct*100:.0f}% based on observed CPU utilization pattern.",
            },
            assumption=(
                f"Estimated {saving_pct*100:.0f}% cost reduction achievable through rightsizing or scheduling, "
                f"based on observed average CPU of {avg_cpu:.1f}%. Actual savings depend on instance pricing and workload variability."
            ),
            recommendation=rec,
            detection_method="deterministic_rule:underutilization",
        ))

    return results


def detect_cost_spikes(df: pd.DataFrame) -> List[RuleResult]:
    """
    Flag sudden cost spikes per service: cost > SPIKE_MULTIPLIER × 30-day rolling average.
    """
    results: List[RuleResult] = []

    if df.empty or "date" not in df.columns:
        return results

    daily = df.groupby(["date", "service"])["cost"].sum().reset_index()
    daily = daily.sort_values("date")

    for service, sdf in daily.groupby("service"):
        if len(sdf) < 7:
            continue

        sdf = sdf.set_index("date").sort_index()
        rolling_mean = sdf["cost"].rolling(window=14, min_periods=3).mean().shift(1)
        rolling_std = sdf["cost"].rolling(window=14, min_periods=3).std().shift(1)

        for dt, row in sdf.iterrows():
            expected = rolling_mean.get(dt)
            std = rolling_std.get(dt)
            actual = row["cost"]

            if pd.isna(expected) or expected <= 0:
                continue

            delta = actual - expected
            ratio = actual / expected

            if ratio < SPIKE_MULTIPLIER or delta < SPIKE_MIN_DELTA:
                continue

            z_score = (delta / std) if (std and std > 0) else ratio
            confidence = min(95.0, 60 + z_score * 5)
            priority = "critical" if ratio >= 4.0 else "high" if ratio >= 3.0 else "medium"

            results.append(RuleResult(
                rule_id="cost_spike",
                finding_type="cost_spike",
                title=f"Cost Spike: {service}",
                description=(
                    f"{service} cost on {str(dt)[:10]} was ${actual:.2f}, "
                    f"{ratio:.1f}× the prior 14-day average of ${expected:.2f}."
                ),
                service=str(service),
                resource_id=None,
                resource_name=None,
                team=None,
                priority=priority,
                confidence=round(confidence, 1),
                current_cost=round(actual, 2),
                potential_saving=round(delta * 0.8, 2),  # conservative: 80% of spike is recoverable
                annualized_saving=0.0,  # spikes are point-in-time, not recurring
                evidence_metrics=[
                    {"label": "Actual Cost", "observed_value": round(actual, 2),
                     "unit": "USD", "flagged": True},
                    {"label": "Expected Cost (14-day avg)", "observed_value": round(expected, 2),
                     "unit": "USD", "flagged": False},
                    {"label": "Cost Ratio", "observed_value": round(ratio, 2),
                     "unit": "×", "threshold": SPIKE_MULTIPLIER, "flagged": True},
                    {"label": "Absolute Increase", "observed_value": round(delta, 2),
                     "unit": "USD", "flagged": True},
                    {"label": "Spike Date", "observed_value": str(dt)[:10],
                     "flagged": True},
                ],
                savings_calculation={
                    "current_cost": round(actual, 2),
                    "optimized_cost": round(expected, 2),
                    "potential_saving": round(delta, 2),
                    "saving_pct": round((delta / actual) * 100, 1),
                    "annualized_saving": 0.0,
                    "assumption": "If the spike is non-recurring, restoring to baseline removes the excess cost.",
                },
                assumption=(
                    "Spike is assumed to be non-recurring excess spend. "
                    "Investigation needed to determine root cause (deployment, misconfiguration, data egress, etc.)."
                ),
                recommendation=(
                    f"Investigate {service} usage on {str(dt)[:10]}. "
                    "Review deployment logs, auto-scaling events, and data transfer records for this period."
                ),
                is_anomaly=True,
                anomaly_score=round(min(1.0, ratio / 5.0), 3),
                detection_method="deterministic_rule:cost_spike",
            ))

    return results


def detect_idle_resources(df: pd.DataFrame) -> List[RuleResult]:
    """
    Detect resources with near-zero usage quantity but ongoing cost.
    """
    results: List[RuleResult] = []

    util_df = df.dropna(subset=["usage_quantity", "resource_id"])
    if util_df.empty:
        return results

    grouped = util_df.groupby(["service", "resource_id", "resource_name", "team"]).agg(
        total_cost=("cost", "sum"),
        avg_usage=("usage_quantity", "mean"),
        max_usage=("usage_quantity", "max"),
        days=("date", "nunique"),
    ).reset_index()

    for _, row in grouped.iterrows():
        cost = row["total_cost"]
        max_usage = row["max_usage"]
        avg_usage = row["avg_usage"]

        if cost < 20:
            continue

        # Resource with significant cost but near-zero usage
        if max_usage > 0.1 or avg_usage > 0.01:
            continue

        saving = cost * 0.95  # near-full saving if stopped

        results.append(RuleResult(
            rule_id="idle_resource",
            finding_type="idle_resource",
            title=f"Idle Resource: {row['resource_name'] or row['resource_id']}",
            description=(
                f"{row['service']} resource incurring ${cost:.2f} with "
                f"average usage of {avg_usage:.4f} {row.get('usage_unit', 'units')}."
            ),
            service=str(row["service"]),
            resource_id=str(row["resource_id"]) if row["resource_id"] else None,
            resource_name=str(row["resource_name"]) if pd.notna(row["resource_name"]) else None,
            team=str(row["team"]) if pd.notna(row["team"]) else None,
            priority="high",
            confidence=88.0,
            current_cost=round(cost, 2),
            potential_saving=round(saving, 2),
            annualized_saving=round(saving * 12, 2),
            evidence_metrics=[
                {"label": "Average Usage", "observed_value": round(avg_usage, 4),
                 "threshold": 0.01, "flagged": True},
                {"label": "Max Usage", "observed_value": round(max_usage, 4),
                 "flagged": max_usage < 0.05},
                {"label": "Days Active", "observed_value": int(row["days"]), "unit": "days"},
                {"label": "Total Cost", "observed_value": round(cost, 2), "unit": "USD"},
            ],
            savings_calculation={
                "current_cost": round(cost, 2),
                "optimized_cost": round(cost * 0.05, 2),
                "potential_saving": round(saving, 2),
                "saving_pct": 95.0,
                "annualized_saving": round(saving * 12, 2),
                "assumption": "Decommissioning idle resource eliminates ongoing costs.",
            },
            assumption=(
                "Resource is assumed decommissionable based on near-zero usage. "
                "Verify there are no scheduled jobs or backup tasks before deletion."
            ),
            recommendation="Verify with resource owner and decommission if confirmed unused. Tag resources with owner and purpose.",
            detection_method="deterministic_rule:idle_resource",
        ))

    return results


def detect_high_cost_services(df: pd.DataFrame) -> List[RuleResult]:
    """
    Surface services with disproportionate spend growth (month-over-month).
    """
    results: List[RuleResult] = []

    if df.empty:
        return results

    df = df.copy()
    df["month"] = df["date"].dt.to_period("M")
    monthly = df.groupby(["month", "service"])["cost"].sum().reset_index()

    months = sorted(monthly["month"].unique())
    if len(months) < 2:
        return results

    prev_month, curr_month = months[-2], months[-1]
    prev = monthly[monthly["month"] == prev_month].set_index("service")["cost"]
    curr = monthly[monthly["month"] == curr_month].set_index("service")["cost"]

    for service in curr.index:
        if service not in prev.index:
            continue
        p = prev[service]
        c = curr[service]
        if p < 100 or c < 100:
            continue
        growth = (c - p) / p
        if growth < 0.30:  # only flag >30% growth
            continue

        saving = (c - p) * 0.7  # conservative: can recover 70% of unexpected growth
        priority = "critical" if growth > 1.0 else "high" if growth > 0.5 else "medium"

        results.append(RuleResult(
            rule_id="high_growth_service",
            finding_type="cost_spike",
            title=f"High Spend Growth: {service}",
            description=(
                f"{service} spend grew {growth*100:.0f}% month-over-month "
                f"(${p:.0f} → ${c:.0f})."
            ),
            service=str(service),
            resource_id=None,
            resource_name=None,
            team=None,
            priority=priority,
            confidence=82.0,
            current_cost=round(c, 2),
            potential_saving=round(saving, 2),
            annualized_saving=round(saving * 12, 2),
            evidence_metrics=[
                {"label": "Previous Month Cost", "observed_value": round(p, 2), "unit": "USD"},
                {"label": "Current Month Cost", "observed_value": round(c, 2), "unit": "USD"},
                {"label": "Month-over-Month Growth", "observed_value": round(growth * 100, 1),
                 "unit": "%", "threshold": 30, "flagged": True},
                {"label": "Absolute Increase", "observed_value": round(c - p, 2), "unit": "USD", "flagged": True},
            ],
            savings_calculation={
                "current_cost": round(c, 2),
                "optimized_cost": round(p * 1.05, 2),  # target: 5% above prior month
                "potential_saving": round(c - p * 1.05, 2),
                "saving_pct": round(((c - p * 1.05) / c) * 100, 1),
                "annualized_saving": round((c - p * 1.05) * 12, 2),
                "assumption": "Cost growth beyond 5% over prior month is considered recoverable with optimization.",
            },
            assumption=(
                f"Growth beyond a 5% baseline over prior month (${p*1.05:.0f}) is flagged as excess. "
                "Actual recoverable savings depend on root cause analysis."
            ),
            recommendation=(
                f"Audit {service} usage growth. Review new resource deployments, data transfer increases, "
                "and auto-scaling configurations from this period."
            ),
            detection_method="deterministic_rule:spend_growth",
        ))

    return results


def run_all_rules(df: pd.DataFrame) -> List[RuleResult]:
    """Run all deterministic rules and return combined results."""
    if df.empty:
        return []

    results: List[RuleResult] = []
    results.extend(detect_underutilization(df))
    results.extend(detect_cost_spikes(df))
    results.extend(detect_idle_resources(df))
    results.extend(detect_high_cost_services(df))

    # Deduplicate by (service, resource_id, finding_type) — keep highest confidence
    seen: dict = {}
    deduped = []
    for r in results:
        key = (r.service, r.resource_id or "", r.finding_type)
        if key not in seen or r.confidence > seen[key].confidence:
            seen[key] = r
    deduped = list(seen.values())

    # Sort by potential saving descending
    deduped.sort(key=lambda x: x.potential_saving, reverse=True)
    return deduped
