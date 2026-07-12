"""SQLite データベース（動的ソース・事故メタデータ）。

Python標準の sqlite3 を使用し、外部依存を最小化する。
"""

from __future__ import annotations

import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path

from .config import settings

_local = threading.local()


SCHEMA = """
CREATE TABLE IF NOT EXISTS dynamic_sources (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    rtsp_url    TEXT NOT NULL,
    persistent  INTEGER NOT NULL DEFAULT 0,
    description TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS incidents (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL,
    reason     TEXT NOT NULL,
    note       TEXT,
    start      TEXT NOT NULL,
    end        TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS incident_sources (
    incident_id TEXT NOT NULL,
    source_id   TEXT NOT NULL,
    url         TEXT,
    PRIMARY KEY (incident_id, source_id)
);

CREATE TABLE IF NOT EXISTS events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ts         TEXT NOT NULL,
    label      TEXT NOT NULL,
    source_id  TEXT,
    origin     TEXT NOT NULL DEFAULT 'api',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events (ts);
"""


def init_db(path: Path | None = None) -> None:
    """スキーマを初期化する。"""
    p = path or settings.db_path
    p.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(p) as conn:
        conn.executescript(SCHEMA)
        conn.commit()


@contextmanager
def get_conn():
    """接続を取得するコンテキストマネージャ。

    同一スレッド内で接続を再利用する。
    """
    if not hasattr(_local, "conn") or _local.conn is None:
        _local.conn = sqlite3.connect(settings.db_path, check_same_thread=False)
        _local.conn.row_factory = sqlite3.Row
        _local.conn.execute("PRAGMA journal_mode=WAL")
    try:
        yield _local.conn
        _local.conn.commit()
    except Exception:
        _local.conn.rollback()
        raise


def close_conn() -> None:
    conn = getattr(_local, "conn", None)
    if conn is not None:
        conn.close()
        _local.conn = None
