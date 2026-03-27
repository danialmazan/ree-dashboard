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


def test_exchanges_split_direction_differs_from_net():
    imports_response = client.get("/api/exchanges", params={"grain": "month", "direction": "imports", "country": "France"})
    exports_response = client.get("/api/exchanges", params={"grain": "month", "direction": "exports", "country": "France"})
    net_response = client.get("/api/exchanges", params={"grain": "month", "direction": "net", "country": "France"})
    assert imports_response.status_code == 200
    assert exports_response.status_code == 200
    assert net_response.status_code == 200
    imports_rows = imports_response.json()["rows"]
    exports_rows = exports_response.json()["rows"]
    net_rows = net_response.json()["rows"]
    assert any(row["value_gwh"] > 0 for row in imports_rows)
    assert any(row["value_gwh"] > 0 for row in exports_rows)
    assert any(
        round(import_row["value_gwh"] - export_row["value_gwh"], 2) == round(net_row["value_gwh"], 2)
        and round(import_row["value_gwh"], 2) != round(net_row["value_gwh"], 2)
        for import_row, export_row, net_row in zip(imports_rows, exports_rows, net_rows)
    )


def test_coverage_stats_respects_threshold():
    response = client.get(
        "/api/coverage-stats",
        params=[
            ("source_set", "solar"),
            ("source_set", "wind"),
            ("threshold", "45"),
            ("start", "2019-01-01T00:00:00"),
            ("end", "2019-12-31T23:00:00"),
        ],
    )
    assert response.status_code == 200
    data = response.json()
    assert data["hours_total"] > 0
    assert 0 <= data["share_matching"] <= 100


def test_marginal_technology_is_available_across_sample_horizon():
    response = client.get(
        "/api/marginal-technology",
        params={"start": "2019-01-01T00:00:00", "end": "2019-01-01T03:00:00"},
    )
    assert response.status_code == 200
    rows = response.json()["rows"]
    assert all(row["availability_status"] == "available" for row in rows)
