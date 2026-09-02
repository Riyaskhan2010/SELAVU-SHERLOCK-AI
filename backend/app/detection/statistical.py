"""
Statistical and ML-based anomaly detection using scikit-learn.
Complements deterministic rules with unsupervised detection.
"""
import logging
from typing import List, Dict, Tuple
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from sklearn.neighbors import LocalOutlierFactor
from scipy import stats

logger = logging.getLogger(__name__)


def _build_daily_service_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Aggregate to daily-service level and engineer features for anomaly detection.
    """
    daily = (
        df.groupby(["date", "service"])
        .agg(
            cost=("cost", "sum"),
            record_count=("cost", "count"),
            avg_cpu=("cpu_utilization_avg", "mean"),
        )
        .reset_index()
        .sort_values("date")
    )

    daily["date_ordinal"] = pd.to_datetime(daily["date"]).map(pd.Timestamp.toordinal)
    daily["day_of_week"] = pd.to_datetime(daily["date"]).dt.dayofweek

    # Rolling stats per service
    result_dfs = []
    for service, sdf in daily.groupby("service"):
        sdf = sdf.sort_values("date").copy()
        sdf["cost_rolling_mean"] = sdf["cost"].rolling(7, min_periods=2).mean().fillna(sdf["cost"].mean())
        sdf["cost_rolling_std"] = sdf["cost"].rolling(7, min_periods=2).std().fillna(sdf["cost"].std() + 1e-8)
        sdf["cost_z_score"] = (sdf["cost"] - sdf["cost_rolling_mean"]) / (sdf["cost_rolling_std"] + 1e-8)
        sdf["cost_change_pct"] = sdf["cost"].pct_change().fillna(0).clip(-10, 10)
        result_dfs.append(sdf)

    if not result_dfs:
        return pd.DataFrame()

    return pd.concat(result_dfs, ignore_index=True)


def detect_with_isolation_forest(
    df: pd.DataFrame,
    contamination: float = 0.05,
) -> List[Dict]:
    """
    Apply IsolationForest to cost time series per service.
    Returns list of anomaly dicts with scores.
    """
    anomalies = []

    if df.empty:
        return anomalies

    features_df = _build_daily_service_features(df)
    if features_df.empty:
        return anomalies

    feature_cols = ["cost", "cost_rolling_mean", "cost_z_score", "cost_change_pct", "day_of_week"]
    available = [c for c in feature_cols if c in features_df.columns]

    if len(features_df) < 10:
        return anomalies

    for service, sdf in features_df.groupby("service"):
        if len(sdf) < 8:
            continue

        X = sdf[available].fillna(0).values
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)

        # IsolationForest
        clf = IsolationForest(
            n_estimators=100,
            contamination=contamination,
            random_state=42,
        )
        preds = clf.fit_predict(X_scaled)
        scores = clf.score_samples(X_scaled)
        # Normalize scores to [0,1] — more negative = more anomalous
        norm_scores = 1 - (scores - scores.min()) / (scores.max() - scores.min() + 1e-8)

        for i, (_, row) in enumerate(sdf.iterrows()):
            if preds[i] == -1:  # anomaly
                expected = float(row.get("cost_rolling_mean", row["cost"]))
                actual = float(row["cost"])
                dev_pct = ((actual - expected) / (expected + 1e-8)) * 100

                severity = _score_to_severity(norm_scores[i])
                anomalies.append({
                    "date": str(row["date"])[:10],
                    "service": str(service),
                    "cost": round(actual, 2),
                    "expected_cost": round(expected, 2),
                    "deviation_pct": round(dev_pct, 1),
                    "anomaly_score": round(float(norm_scores[i]), 4),
                    "severity": severity,
                    "detection_method": "isolation_forest",
                    "description": (
                        f"{service} cost of ${actual:.2f} on {str(row['date'])[:10]} "
                        f"deviates {abs(dev_pct):.0f}% from expected ${expected:.2f} "
                        f"(IsolationForest score: {norm_scores[i]:.3f})"
                    ),
                })

    return anomalies


def detect_with_zscore(
    df: pd.DataFrame,
    threshold: float = 2.5,
) -> List[Dict]:
    """
    Z-score based anomaly detection on daily costs per service.
    Simple, interpretable, and complementary to IsolationForest.
    """
    anomalies = []

    if df.empty:
        return anomalies

    features_df = _build_daily_service_features(df)
    if features_df.empty:
        return anomalies

    for service, sdf in features_df.groupby("service"):
        if len(sdf) < 5:
            continue

        for _, row in sdf.iterrows():
            z = float(row.get("cost_z_score", 0))
            if abs(z) < threshold:
                continue

            actual = float(row["cost"])
            expected = float(row.get("cost_rolling_mean", actual))
            dev_pct = ((actual - expected) / (expected + 1e-8)) * 100
            norm_score = min(1.0, abs(z) / 6.0)
            severity = _score_to_severity(norm_score)

            anomalies.append({
                "date": str(row["date"])[:10],
                "service": str(service),
                "cost": round(actual, 2),
                "expected_cost": round(expected, 2),
                "deviation_pct": round(dev_pct, 1),
                "anomaly_score": round(norm_score, 4),
                "severity": severity,
                "detection_method": "zscore",
                "description": (
                    f"{service} cost z-score of {z:.2f} on {str(row['date'])[:10]} "
                    f"(${actual:.2f} vs expected ${expected:.2f})"
                ),
            })

    return anomalies


def _score_to_severity(score: float) -> str:
    if score >= 0.85:
        return "critical"
    if score >= 0.65:
        return "high"
    if score >= 0.45:
        return "medium"
    return "low"


def run_statistical_detection(df: pd.DataFrame) -> List[Dict]:
    """
    Run all statistical detection methods and merge results.
    Deduplicate by (date, service), keeping highest anomaly score.
    """
    if df.empty:
        return []

    all_anomalies = []

    try:
        all_anomalies.extend(detect_with_isolation_forest(df))
    except Exception as e:
        logger.warning(f"IsolationForest detection failed: {e}")

    try:
        all_anomalies.extend(detect_with_zscore(df))
    except Exception as e:
        logger.warning(f"Z-score detection failed: {e}")

    # Deduplicate: keep highest anomaly_score per (date, service)
    seen: Dict[Tuple, dict] = {}
    for a in all_anomalies:
        key = (a["date"], a["service"])
        if key not in seen or a["anomaly_score"] > seen[key]["anomaly_score"]:
            seen[key] = a

    result = list(seen.values())
    result.sort(key=lambda x: x["anomaly_score"], reverse=True)
    return result
