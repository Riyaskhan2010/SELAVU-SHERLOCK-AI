# Sample Datasets

The application generates sample data programmatically via `app/services/sample_data.py`.

Use the "Load sample data" button in the UI, or hit the API endpoint:

```
POST /api/datasets/sample
Authorization: Bearer <token>
```

## What it generates

- 90 days of synthetic cloud billing
- 12 services across compute, storage, database, networking, AI
- 6 teams with realistic cost distribution
- Injected anomalies: data transfer spike (~day 60), SageMaker spike (~day 75)
- Underutilized resources with CPU utilization data
- Idle staging resources with near-zero usage

## Column schema

| Column | Type | Description |
|--------|------|-------------|
| date | YYYY-MM-DD | Billing date |
| service | string | Service name |
| resource_id | string | Resource identifier |
| resource_name | string | Human-readable name |
| team | string | Owning team |
| environment | string | production / staging / development |
| region | string | Cloud region |
| cost | float | USD cost for that day |
| usage_quantity | float | Usage amount |
| usage_unit | string | hours / GB / invocations |
| cpu_utilization_avg | float | Average CPU % (compute only) |
