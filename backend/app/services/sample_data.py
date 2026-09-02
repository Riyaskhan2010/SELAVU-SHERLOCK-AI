"""
Realistic sample dataset generator.
Creates 90 days of synthetic cloud billing data with:
- Natural cost patterns (weekday/weekend variation)
- Injected anomalies (cost spikes, idle resources)
- Resource utilization data for underutilization detection
- Multiple services, teams, and environments
"""
import random
import json
from datetime import date, timedelta
from typing import List, Dict
import numpy as np

random.seed(42)
np.random.seed(42)

SERVICES = [
    "Compute / EC2",
    "Compute / ECS",
    "Storage / S3",
    "Storage / EBS",
    "Database / RDS",
    "Database / DynamoDB",
    "Networking / CloudFront",
    "Networking / Data Transfer",
    "AI / SageMaker",
    "Analytics / Athena",
    "Monitoring / CloudWatch",
    "Serverless / Lambda",
]

TEAMS = ["platform", "data", "backend", "frontend", "ml", "devops"]
ENVIRONMENTS = ["production", "staging", "development"]
REGIONS = ["us-east-1", "us-west-2", "eu-west-1"]

# Baseline monthly cost per service (USD)
SERVICE_BASELINES = {
    "Compute / EC2": 4200,
    "Compute / ECS": 1800,
    "Storage / S3": 620,
    "Storage / EBS": 380,
    "Database / RDS": 2100,
    "Database / DynamoDB": 480,
    "Networking / CloudFront": 290,
    "Networking / Data Transfer": 440,
    "AI / SageMaker": 1650,
    "Analytics / Athena": 310,
    "Monitoring / CloudWatch": 180,
    "Serverless / Lambda": 95,
}

SERVICE_TEAMS = {
    "Compute / EC2": "platform",
    "Compute / ECS": "backend",
    "Storage / S3": "data",
    "Storage / EBS": "platform",
    "Database / RDS": "backend",
    "Database / DynamoDB": "backend",
    "Networking / CloudFront": "frontend",
    "Networking / Data Transfer": "data",
    "AI / SageMaker": "ml",
    "Analytics / Athena": "data",
    "Monitoring / CloudWatch": "devops",
    "Serverless / Lambda": "backend",
}

# Resources per service: (id, name, cpu_util_range or None)
SERVICE_RESOURCES = {
    "Compute / EC2": [
        ("i-0a1b2c3d4e5f6a7b8", "prod-api-server-01", (6, 14)),   # underutilized
        ("i-0b2c3d4e5f6a7b8c9", "prod-api-server-02", (45, 75)),  # healthy
        ("i-0c3d4e5f6a7b8c9d0", "prod-worker-01", (3, 8)),         # very underutilized
        ("i-0d4e5f6a7b8c9d0e1", "staging-server-01", (2, 5)),      # idle
    ],
    "Compute / ECS": [
        ("ecs-svc-prod-api", "prod-ecs-api", (30, 60)),
        ("ecs-svc-prod-worker", "prod-ecs-worker", (8, 18)),        # underutilized
    ],
    "Database / RDS": [
        ("db-prod-postgres-01", "prod-postgres-primary", (25, 55)),
        ("db-staging-postgres", "staging-postgres", (1, 4)),        # idle staging
    ],
    "AI / SageMaker": [
        ("sagemaker-endpoint-v2", "recommendation-endpoint", (5, 12)),  # underutilized
        ("sagemaker-notebook-ml", "ml-research-notebook", (2, 6)),      # idle
    ],
    "Storage / S3": [
        ("bucket-prod-assets", "prod-assets-bucket", None),
        ("bucket-data-lake", "data-lake-main", None),
        ("bucket-backup-cold", "cold-backup-2021", None),
    ],
}


def _daily_factor(day: date) -> float:
    """Simulate weekday/weekend variation."""
    dow = day.weekday()
    if dow >= 5:  # weekend
        return random.uniform(0.55, 0.75)
    return random.uniform(0.88, 1.12)


def _trend_factor(days_from_start: int, total_days: int) -> float:
    """Simulate a slight upward cost trend over time."""
    return 1.0 + (days_from_start / total_days) * 0.15


def generate_sample_records(days: int = 90) -> List[Dict]:
    """Generate realistic billing records for `days` days."""
    records = []
    start = date.today() - timedelta(days=days)

    # Inject anomaly on day ~60 (cost spike for Data Transfer)
    spike_day = start + timedelta(days=60)
    # Inject a second spike on day ~75 for SageMaker
    spike_day2 = start + timedelta(days=75)

    for d in range(days):
        current_date = start + timedelta(days=d)
        day_factor = _daily_factor(current_date)
        trend = _trend_factor(d, days)

        for service in SERVICES:
            baseline_monthly = SERVICE_BASELINES[service]
            baseline_daily = baseline_monthly / 30

            resources = SERVICE_RESOURCES.get(service, [(None, None, None)])

            for resource_id, resource_name, cpu_range in resources:
                # Split cost among resources
                resource_count = len(SERVICE_RESOURCES.get(service, [(None, None, None)]))
                resource_cost = (baseline_daily / resource_count) * day_factor * trend
                resource_cost *= random.uniform(0.9, 1.1)  # random noise

                # Inject spike anomaly
                if current_date == spike_day and service == "Networking / Data Transfer":
                    resource_cost *= random.uniform(4.5, 6.0)  # big spike
                if current_date == spike_day2 and service == "AI / SageMaker":
                    resource_cost *= random.uniform(3.5, 4.5)

                # Usage quantity (hours for compute, GB for storage, etc.)
                if "Compute" in service or "Database" in service:
                    usage_quantity = 24.0  # hours
                    usage_unit = "hours"
                elif "Storage" in service:
                    usage_quantity = random.uniform(500, 5000)
                    usage_unit = "GB"
                elif "Serverless" in service:
                    usage_quantity = random.uniform(1e5, 5e6)
                    usage_unit = "invocations"
                else:
                    usage_quantity = random.uniform(10, 500)
                    usage_unit = "GB"

                # CPU utilization (only for compute-type resources)
                cpu_util = None
                if cpu_range:
                    base_cpu = random.uniform(cpu_range[0], cpu_range[1])
                    # Add some daily variation
                    cpu_util = round(max(0.5, base_cpu * day_factor), 1)

                team = SERVICE_TEAMS.get(service, "platform")
                env = "production" if "prod" in (resource_name or "") else (
                    "staging" if "staging" in (resource_name or "") else "development"
                )
                region = random.choice(REGIONS[:2])  # mostly us regions

                record = {
                    "date": current_date.isoformat(),
                    "service": service,
                    "resource_id": resource_id,
                    "resource_name": resource_name,
                    "team": team,
                    "environment": env,
                    "region": region,
                    "cost": round(resource_cost, 4),
                    "usage_quantity": round(usage_quantity, 2),
                    "usage_unit": usage_unit,
                    "cpu_utilization_avg": cpu_util,
                }
                records.append(record)

    return records


def get_sample_csv() -> bytes:
    """Return sample data as CSV bytes."""
    import io
    import pandas as pd
    records = generate_sample_records(90)
    df = pd.DataFrame(records)
    return df.to_csv(index=False).encode("utf-8")


def get_sample_json() -> bytes:
    """Return sample data as JSON bytes."""
    records = generate_sample_records(90)
    return json.dumps({"records": records}, indent=2).encode("utf-8")
