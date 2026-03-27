from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_metadata_contains_groups():
    response = client.get("/api/metadata")
    assert response.status_code == 200
    data = response.json()
    assert "technology_groups" in data
    assert any(group["group_key"] == "solar" for group in data["technology_groups"])


def test_generation_yearly_works():
    response = client.get("/api/generation", params={"grain": "year", "technology_view": "normalized"})
    assert response.status_code == 200
    rows = response.json()["rows"]
    assert rows
    assert rows[0]["period"].endswith("-01-01")


def test_exchanges_monthly_net_returns_values():
    response = client.get("/api/exchanges", params={"grain": "month", "direction": "net"})
    assert response.status_code == 200
    rows = response.json()["rows"]
    assert rows
    assert "value_gwh" in rows[0]
    assert "country" in rows[0]


def test_coverage_stats_respects_threshold():
    response = client.get(
        "/api/coverage-stats",
        params=[
            ("source_set", "solar"),
            ("source_set", "wind"),
            ("threshold", "45"),
            ("start", "2024-01-01T00:00:00"),
            ("end", "2024-12-31T23:00:00"),
        ],
    )
    assert response.status_code == 200
    data = response.json()
    assert data["hours_total"] > 0
    assert 0 <= data["share_matching"] <= 100


def test_marginal_cutoff_unavailable_after_source_cutoff():
    response = client.get(
        "/api/marginal-technology",
        params={"start": "2025-03-19T00:00:00", "end": "2025-03-19T03:00:00"},
    )
    assert response.status_code == 200
    rows = response.json()["rows"]
    assert all(row["availability_status"] == "not_available_from_source" for row in rows)
