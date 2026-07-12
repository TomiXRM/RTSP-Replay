"""テスト共通フィクスチャ。"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

import pytest

# テスト環境設定: 外部コマンド無効化・テンポラリDB
_tmp = Path(tempfile.mkdtemp(prefix="replay-test-"))
os.environ["DATABASE_PATH"] = str(_tmp / "test.db")
os.environ["INCIDENTS_DIR"] = str(_tmp / "incidents")
os.environ["RECORDINGS_DIR"] = str(_tmp / "recordings")
os.environ["SOURCES_TOML_PATH"] = str(_tmp / "sources.toml")
os.environ["ENABLE_RTSP_PROBE"] = "false"
os.environ["ENABLE_MEDIAMTX_CONTROL"] = "false"

# テスト用TOML
(_tmp / "sources.toml").write_text(
    '[[sources]]\n'
    'id = "robot-overview"\n'
    'name = "ロボット全体"\n'
    'rtsp_url = "rtsp://testsrc-1:8554/cam1"\n'
    'enabled = true\n'
)

# バックエンドパッケージをインポート可能に
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import create_app  # noqa: E402


@pytest.fixture(scope="session")
def app():
    application = create_app()
    return application


@pytest.fixture(scope="session")
def client(app):
    with TestClient(app) as c:
        yield c
