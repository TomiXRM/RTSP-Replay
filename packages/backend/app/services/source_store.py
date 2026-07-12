"""動的映像ソース管理（SPEC 22.3, FR-006）。

UIから追加されたソース（永続/一時）をSQLiteで管理する。
一時ソースもここに保存するが、起動時に削除される。
重複URL検知を行う（FR-006）。
"""

from __future__ import annotations

import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

from ..config import settings
from ..db import get_conn, init_db
from .toml_loader import TomlSource, load_sources


def _new_id() -> str:
    # ULID的な衝突しにくいID
    return f"src-{uuid.uuid4().hex[:24]}"


class SourceStore:
    """TOML常設ソース + 動的ソースを統合管理する。

    重要: 認証情報付きRTSP URLは内部保持のみでAPIレスポンスへ出さない。
    """

    def __init__(self) -> None:
        self._toml_sources: dict[str, TomlSource] = {}
        self._dynamic_urls: dict[str, str] = {}  # source_id -> rtsp_url (動的)
        self.reload_toml()

    def reload_toml(self) -> None:
        """TOMLを再読込する。"""
        self._toml_sources = {s.id: s for s in load_sources() if s.enabled}

    def init_db(self) -> None:
        """DBを初期化し、一時ソースを破棄する（起動時）。"""
        init_db()
        with get_conn() as conn:
            conn.execute("DELETE FROM dynamic_sources WHERE persistent = 0")
        self._load_dynamic_urls()

    def _load_dynamic_urls(self) -> None:
        self._dynamic_urls = {}
        with get_conn() as conn:
            rows = conn.execute(
                "SELECT id, rtsp_url FROM dynamic_sources"
            ).fetchall()
            for r in rows:
                self._dynamic_urls[r["id"]] = r["rtsp_url"]

    def all_source_ids(self) -> list[str]:
        return list(self._toml_sources.keys()) + list(self._dynamic_urls.keys())

    def get_rtsp_url(self, source_id: str) -> str | None:
        """ソースIDからRTSP URLを取得する（内部用）。"""
        if source_id in self._toml_sources:
            return self._toml_sources[source_id].rtsp_url
        return self._dynamic_urls.get(source_id)

    def get_name(self, source_id: str) -> str | None:
        if source_id in self._toml_sources:
            return self._toml_sources[source_id].name
        with get_conn() as conn:
            row = conn.execute(
                "SELECT name FROM dynamic_sources WHERE id = ?", (source_id,)
            ).fetchone()
            return row["name"] if row else None

    def get_origin(self, source_id: str) -> str:
        if source_id in self._toml_sources:
            return "TOML"
        return "DYNAMIC"

    def find_duplicate(self, rtsp_url: str) -> str | None:
        """同一URLの既存ソースIDを返す（FR-006 重複検知）。TOML含む。"""
        for sid, s in self._toml_sources.items():
            if s.rtsp_url == rtsp_url:
                return sid
        with get_conn() as conn:
            row = conn.execute(
                "SELECT id FROM dynamic_sources WHERE rtsp_url = ?", (rtsp_url,)
            ).fetchone()
            if row:
                return row["id"]
        return None

    def create(
        self,
        name: str,
        rtsp_url: str,
        persistent: bool,
        description: str | None = None,
    ) -> str:
        """動的ソースを追加する。重複時は SOURCE_ALREADY_EXISTS。"""
        existing = self.find_duplicate(rtsp_url)
        if existing:
            from ..errors import AppError, ErrorCode

            raise AppError(
                ErrorCode.SOURCE_ALREADY_EXISTS,
                "同じRTSP URLの映像ソースが既に存在します",
                status_code=409,
                details={"existingSourceId": existing},
            )

        sid = _new_id()
        with get_conn() as conn:
            conn.execute(
                "INSERT INTO dynamic_sources (id, name, rtsp_url, persistent, description) "
                "VALUES (?, ?, ?, ?, ?)",
                (sid, name, rtsp_url, 1 if persistent else 0, description),
            )
        self._dynamic_urls[sid] = rtsp_url
        return sid

    def delete(self, source_id: str) -> bool:
        """動的ソースを削除する。TOMLソースは削除不可（SPEC 22.4）。"""
        if source_id in self._toml_sources:
            from ..errors import AppError, ErrorCode

            raise AppError(
                ErrorCode.SOURCE_NOT_FOUND,
                "常設ソース（TOML）は削除できません",
                status_code=403,
                details={"sourceId": source_id, "origin": "TOML"},
            )
        with get_conn() as conn:
            cur = conn.execute(
                "DELETE FROM dynamic_sources WHERE id = ?", (source_id,)
            )
            deleted = cur.rowcount > 0
        if deleted:
            self._dynamic_urls.pop(source_id, None)
        return deleted

    def is_toml(self, source_id: str) -> bool:
        return source_id in self._toml_sources

    def exists(self, source_id: str) -> bool:
        return source_id in self._toml_sources or source_id in self._dynamic_urls


# シングルトン
store = SourceStore()
