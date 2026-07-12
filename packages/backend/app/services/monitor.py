"""状態監視（SPEC FR-034〜037）。

バックグラウンドで以下を監視する:
- カメラ切断（5秒警告 / 15秒オフライン: FR-034）
- 録画停止（FR-035）
- ディスク容量（80%警告 / 90%重大: FR-036）

監視結果はインメモリで保持し、/health と /sources へ反映する。
"""

from __future__ import annotations

import asyncio
import logging
import shutil
import time
from datetime import datetime, timezone
from typing import Any

from ..config import settings
from .mediamtx import mediamtx
from .source_store import store

logger = logging.getLogger(__name__)

# しきい値（FR-034, FR-036）
WARN_NO_FRAME_SECONDS = 5
OFFLINE_NO_FRAME_SECONDS = 15
DISK_WARN_PERCENT = 80
DISK_CRITICAL_PERCENT = 90


class MonitorState:
    """監視状態（インメモリ）。"""

    def __init__(self) -> None:
        self.last_frame_at: dict[str, datetime] = {}  # source_id -> 最終受信
        self.last_recording_at: dict[str, datetime] = {}  # source_id -> 最終録画
        self.media_server_online: bool = False
        self.disk: dict[str, Any] = {}
        self._task: asyncio.Task | None = None

    def update_frame(self, source_id: str) -> None:
        self.last_frame_at[source_id] = datetime.now(timezone.utc)

    def source_status(self, source_id: str) -> str:
        last = self.last_frame_at.get(source_id)
        if last is None:
            return "CONNECTING"
        age = (datetime.now(timezone.utc) - last).total_seconds()
        if age >= OFFLINE_NO_FRAME_SECONDS:
            return "OFFLINE"
        if age >= WARN_NO_FRAME_SECONDS:
            return "RECONNECTING"
        return "ONLINE"

    def recording_status(self, source_id: str) -> str:
        last = self.last_recording_at.get(source_id)
        if last is None:
            return "UNKNOWN"
        age = (datetime.now(timezone.utc) - last).total_seconds()
        return "STOPPED" if age > OFFLINE_NO_FRAME_SECONDS else "RECORDING"

    def disk_status(self) -> dict[str, Any]:
        return self.disk

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._loop())

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

    async def _loop(self) -> None:
        """5秒ごとに監視を実行。"""
        while True:
            try:
                await self._tick()
            except Exception:
                logger.exception("監視ループでエラー")
            await asyncio.sleep(5.0)

    async def _tick(self) -> None:
        # MediaMTX API 到達性
        self.media_server_online = await mediamtx.is_online()

        # ディスク容量（録画先）
        self.disk = _disk_usage(settings.recordings_dir)

        # 各ソースの出版状態を MediaMTX から取得（FR-034）
        if self.media_server_online:
            for sid in store.all_source_ids():
                ready = await mediamtx.path_ready(sid)
                if ready:
                    self.update_frame(sid)
                    self.last_recording_at[sid] = datetime.now(timezone.utc)


def _disk_usage(path: str) -> dict[str, Any]:
    try:
        total, used, free = shutil.disk_usage(path)
        used_percent = round(used / total * 100, 1) if total else 0
        return {
            "path": path,
            "totalBytes": total,
            "usedBytes": used,
            "freeBytes": free,
            "usedPercent": used_percent,
            "status": (
                "critical"
                if used_percent >= DISK_CRITICAL_PERCENT
                else "warning"
                if used_percent >= DISK_WARN_PERCENT
                else "ok"
            ),
        }
    except Exception as e:
        logger.warning("ディスク容量取得失敗 %s: %s", path, e)
        return {"path": path, "status": "unknown"}


monitor = MonitorState()
