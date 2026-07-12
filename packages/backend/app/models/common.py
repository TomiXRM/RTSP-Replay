"""共通スキーマと列挙型。"""

from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import BaseModel


class Origin(StrEnum):
    """映像ソースの登録元（SPEC 4.2, 7.3）。"""

    TOML = "TOML"
    DYNAMIC = "DYNAMIC"  # UIから永続登録したソース
    TEMP = "TEMP"  # 一時ソース（実行中のみ）


class SourceStatus(StrEnum):
    """映像ソースの接続状態（SPEC 22.1, FR-037）。"""

    ONLINE = "ONLINE"
    CONNECTING = "CONNECTING"
    RECONNECTING = "RECONNECTING"
    OFFLINE = "OFFLINE"
    ERROR = "ERROR"


class RecordingStatus(StrEnum):
    """録画状態（FR-035）。"""

    RECORDING = "RECORDING"
    STOPPED = "STOPPED"
    UNKNOWN = "UNKNOWN"


class HealthResponse(BaseModel):
    """システム状態（SPEC 22.9, FR-034〜036）。"""

    status: str = "ok"  # ok / degraded / down
    mediaServer: str = "unknown"  # online / offline
    disk: dict[str, Any] = {}  # { usedPercent, totalBytes, freeBytes }
    sources: dict[str, Any] = {}  # { online, offline, recording, stopped }
    retentionHours: float = 2  # 録画保持期間（タイムライン表示幅と連動）
