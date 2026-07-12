"""事故映像保存APIのテスト（SPEC 22.8, 19章）。"""

from __future__ import annotations


def test_create_incident(client):
    """22.8: 事故保存。FR-033 独立保存。"""
    r = client.post(
        "/api/v1/incidents",
        json={
            "title": "搬送停止",
            "reason": "ROBOT_ERROR",
            "note": "C3付近で停止",
            "start": "2026-07-10T10:20:00Z",
            "end": "2026-07-10T10:30:00Z",
            "sourceIds": ["robot-overview"],
        },
    )
    assert r.status_code == 201
    data = r.json()
    assert data["id"].startswith("inc-")
    assert data["title"] == "搬送停止"
    assert len(data["results"]) == 1
    assert data["results"][0]["sourceId"] == "robot-overview"


def test_create_incident_invalid_range(client):
    """22.8: end <= start は拒否。"""
    r = client.post(
        "/api/v1/incidents",
        json={
            "title": "bad",
            "reason": "OTHER",
            "start": "2026-07-10T10:30:00Z",
            "end": "2026-07-10T10:20:00Z",
            "sourceIds": ["robot-overview"],
        },
    )
    assert r.status_code == 422


def test_create_incident_unknown_source(client):
    """22.8: 存在しないソースは結果で失敗扱い。"""
    r = client.post(
        "/api/v1/incidents",
        json={
            "title": "x",
            "reason": "OTHER",
            "start": "2026-07-10T10:20:00Z",
            "end": "2026-07-10T10:21:00Z",
            "sourceIds": ["no-such-source"],
        },
    )
    assert r.status_code == 201
    res = r.json()["results"][0]
    assert res["success"] is False
    assert res["errorCode"] == "SOURCE_NOT_FOUND"
