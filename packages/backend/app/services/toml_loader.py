"""TOML設定読込（SPEC 7.1, 7.2）。

常設カメラを config/sources.toml から読み込む。
認証情報は環境変数から展開し、RTSP URLを構築する。
sources.toml は Web UI（カメラ設定ダイアログ、routers/config.py）からも
編集できる（SPEC 7.2 の「UIから書き換えない」はユーザー要望により変更）。
"""

from __future__ import annotations

import os
import tomllib
from dataclasses import dataclass
from pathlib import Path

from ..config import settings


@dataclass
class TomlSource:
    """TOML読込後の映像ソース（内部用・認証情報含む）。"""

    id: str
    name: str
    rtsp_url: str
    enabled: bool = True

    def __post_init__(self) -> None:
        # 認証情報がURLに含まれる場合でもログへ出力しないよう、str表現は制御しない。
        # このオブジェクトをレスポンスへ直接シリアライズしてはならない。
        pass


def _build_url_with_auth(
    host: str,
    path: str,
    port: int = 554,
    username_env: str | None = None,
    password_env: str | None = None,
) -> str:
    """環境変数から認証情報を取り出し、RTSP URLを構築する（SPEC 7.1推奨形式）。"""
    user = os.environ.get(username_env, "") if username_env else ""
    password = os.environ.get(password_env, "") if password_env else ""
    auth = f"{user}:{password}@" if (user or password) else ""
    return f"rtsp://{auth}{host}:{port}{path}"


def load_sources(path: Path | str | None = None) -> list[TomlSource]:
    """TOMLから有効な映像ソースを読み込む。"""
    p = Path(path) if path else Path(settings.sources_toml_path)
    if not p.exists():
        return []

    with p.open("rb") as f:
        data = tomllib.load(f)

    sources: list[TomlSource] = []
    for entry in data.get("sources", []):
        sid = entry.get("id")
        name = entry.get("name")
        enabled = entry.get("enabled", True)
        if not sid or not name:
            continue

        if "rtsp_url" in entry:
            # 形式1: 直接URL
            url = entry["rtsp_url"]
        else:
            # 形式2: host/path + 環境変数認証
            host = entry.get("host", "")
            path_part = entry.get("path", "/")
            port = int(entry.get("port", 554))
            url = _build_url_with_auth(
                host=host,
                path=path_part,
                port=port,
                username_env=entry.get("username_env"),
                password_env=entry.get("password_env"),
            )

        sources.append(TomlSource(id=sid, name=name, rtsp_url=url, enabled=enabled))

    return sources
