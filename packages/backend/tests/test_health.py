"""システム状態APIのテスト（SPEC 22.9）。"""

from __future__ import annotations


def test_health_response_shape(client):
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    data = r.json()
    assert "status" in data
    assert "mediaServer" in data
    assert "disk" in data
    assert "sources" in data


def test_health_sources_count(client):
    r = client.get("/api/v1/health")
    data = r.json()
    # TOMLに1ソース定義済み
    assert data["sources"]["total"] >= 1
