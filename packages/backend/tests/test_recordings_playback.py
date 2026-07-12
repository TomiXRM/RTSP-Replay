"""録画範囲・過去映像再生のテスト（SPEC 22.6, 22.7）。"""

from __future__ import annotations


def test_recording_ranges_empty(client):
    """22.6: 録画なしソースは availableFrom/To = None。"""
    r = client.get("/api/v1/sources/robot-overview/recordings/ranges")
    assert r.status_code == 200
    data = r.json()
    assert data["sourceId"] == "robot-overview"
    # テスト環境では録画ディレクトリ無し
    assert data["availableFrom"] is None
    assert data["availableTo"] is None
    assert data["ranges"] == []


def test_recording_ranges_source_not_found(client):
    r = client.get("/api/v1/sources/no-such/recordings/ranges")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "SOURCE_NOT_FOUND"


def test_playback_url_is_relative(client):
    """22.7: フロントがMediaMTX固有URLを組まない。相対URLを返す。"""
    r = client.get(
        "/api/v1/sources/robot-overview/playback",
        params={"start": "2026-07-10T10:00:00Z", "duration": 300},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["sourceId"] == "robot-overview"
    assert data["duration"] == 300
    # 相対URL（プロキシ想定）
    assert data["url"].startswith("/playback/")
    assert "start=" in data["url"]


def test_playback_invalid_time(client):
    """22.7: 不正な時刻形式。"""
    r = client.get(
        "/api/v1/sources/robot-overview/playback",
        params={"start": "not-a-date", "duration": 300},
    )
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "INVALID_TIME_RANGE"
