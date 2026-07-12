"""映像ソースAPIのテスト（SPEC 22.1〜22.4）。"""

from __future__ import annotations


def test_list_sources_includes_toml(client):
    """22.1: TOML登録済みソースが一覧へ表示される。RTSP URLを含めない。"""
    r = client.get("/api/v1/sources")
    assert r.status_code == 200
    data = r.json()
    ids = [s["id"] for s in data["sources"]]
    assert "robot-overview" in ids
    # NFR-003: RTSP URLや認証を含めない
    for s in data["sources"]:
        assert "rtsp_url" not in s
        assert "rtspUrl" not in s
        assert "rtspUrl" not in str(s)


def test_source_has_origin_field(client):
    """22.1: origin（TOML/DYNAMIC）を持つ。"""
    r = client.get("/api/v1/sources")
    sources = {s["id"]: s for s in r.json()["sources"]}
    assert sources["robot-overview"]["origin"] == "TOML"


def test_create_temp_source(client):
    """22.3: 一時ソース追加。重複検知。"""
    r = client.post(
        "/api/v1/sources",
        json={
            "name": "実験カメラ",
            "rtspUrl": "rtsp://192.168.1.30:554/main",
            "persistent": False,
        },
    )
    assert r.status_code == 201
    data = r.json()
    assert data["id"].startswith("src-")
    assert data["status"] == "CONNECTING"

    # 一覧に表示される
    r2 = client.get("/api/v1/sources")
    ids = [s["id"] for s in r2.json()["sources"]]
    assert data["id"] in ids


def test_create_duplicate_source_conflict(client):
    """22.3: 同一URL重複で SOURCE_ALREADY_EXISTS。"""
    payload = {
        "name": "dup",
        "rtspUrl": "rtsp://192.168.1.99:554/cam",
        "persistent": False,
    }
    r1 = client.post("/api/v1/sources", json=payload)
    assert r1.status_code == 201
    r2 = client.post("/api/v1/sources", json=payload)
    assert r2.status_code == 409
    assert r2.json()["error"]["code"] == "SOURCE_ALREADY_EXISTS"


def test_delete_dynamic_source(client):
    """22.4: 動的ソース削除。"""
    r = client.post(
        "/api/v1/sources",
        json={
            "name": "一時",
            "rtspUrl": "rtsp://192.168.1.40:554/cam",
            "persistent": False,
        },
    )
    sid = r.json()["id"]
    d = client.delete(f"/api/v1/sources/{sid}")
    assert d.status_code == 204


def test_delete_toml_source_forbidden(client):
    """22.4: TOMLソースは削除不可。"""
    d = client.delete("/api/v1/sources/robot-overview")
    assert d.status_code == 403
    assert d.json()["error"]["code"] == "SOURCE_NOT_FOUND"


def test_connection_test_invalid_url(client):
    """22.2: URL形式不正。"""
    r = client.post("/api/v1/sources/test", json={"rtspUrl": "not-a-url"})
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is False
    assert data["errorCode"] == "INVALID_RTSP_URL"
