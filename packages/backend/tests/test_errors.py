"""エラー形式のテスト（SPEC 23章）。"""

from __future__ import annotations


def test_source_not_found_error_format(client):
    """存在しないソースで共通エラー形式。"""
    r = client.get("/api/v1/sources/no-such-id/live")
    assert r.status_code == 404
    body = r.json()
    err = body["error"]
    assert err["code"] == "SOURCE_NOT_FOUND"
    assert err["message"]  # メッセージあり
    assert "requestId" in err and err["requestId"].startswith("req-")
    assert "details" in err


def test_validation_error_format(client):
    """422 バリデーションエラーも共通形式。"""
    r = client.post("/api/v1/sources", json={"name": "x"})  # rtspUrl 欠落
    assert r.status_code == 422
    err = r.json()["error"]
    assert err["code"] == "VALIDATION_ERROR"
    assert "requestId" in err


def test_request_id_echoed(client):
    """X-Request-Id ヘッダがエコーされる。"""
    r = client.get(
        "/api/v1/sources/no-such/live", headers={"X-Request-Id": "req-test-123"}
    )
    assert r.headers.get("X-Request-Id") == "req-test-123"
    assert r.json()["error"]["requestId"] == "req-test-123"
