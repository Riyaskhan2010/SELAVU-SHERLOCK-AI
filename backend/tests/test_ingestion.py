"""Basic tests for the ingestion pipeline."""
import pytest
from app.services.ingestion import parse_file, normalize_dataframe
from app.services.sample_data import get_sample_csv


def test_parse_csv():
    csv_bytes = b"date,service,cost\n2024-01-01,Compute / EC2,10.50\n2024-01-02,Storage / S3,2.25"
    df = parse_file(csv_bytes, "test.csv")
    assert len(df) == 2
    assert "date" in df.columns


def test_normalize_basic():
    csv_bytes = b"date,service,cost\n2024-01-01,Compute / EC2,10.50\n2024-01-02,Storage / S3,2.25"
    df_raw = parse_file(csv_bytes, "test.csv")
    df_norm, warnings = normalize_dataframe(df_raw)
    assert len(df_norm) == 2
    assert df_norm["cost"].sum() == pytest.approx(12.75)


def test_sample_data_generates():
    csv_bytes = get_sample_csv()
    assert len(csv_bytes) > 1000
    df = parse_file(csv_bytes, "sample.csv")
    assert len(df) > 100


def test_normalize_missing_cost_col():
    csv_bytes = b"date,service\n2024-01-01,EC2"
    df_raw = parse_file(csv_bytes, "bad.csv")
    with pytest.raises(ValueError, match="Missing required columns"):
        normalize_dataframe(df_raw)


def test_normalize_column_aliases():
    csv_bytes = b"usage_date,service_name,charge_amount\n2024-01-01,EC2,5.0"
    df_raw = parse_file(csv_bytes, "aliased.csv")
    df_norm, _ = normalize_dataframe(df_raw)
    assert "date" in df_norm.columns
    assert "service" in df_norm.columns
    assert "cost" in df_norm.columns
