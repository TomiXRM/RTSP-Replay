"""システム状態ルータ（SPEC 22.9, FR-034〜036）。"""

from __future__ import annotations

from fastapi import APIRouter

from ..config import settings
from ..models.common import HealthResponse
from ..services.monitor import monitor
from ..services.source_store import store

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """システム状態（SPEC 22.9）。"""
    disk = monitor.disk_status()
    disk_percent = disk.get("usedPercent", 0)
    disk_status = disk.get("status", "unknown")

    # ソース集計
    online = offline = recording = stopped = 0
    for sid in store.all_source_ids():
        s = monitor.source_status(sid)
        r = monitor.recording_status(sid)
        if s == "ONLINE":
            online += 1
        elif s in ("OFFLINE", "ERROR"):
            offline += 1
        if r == "RECORDING":
            recording += 1
        elif r == "STOPPED":
            stopped += 1

    media = "online" if monitor.media_server_online else "offline"
    overall = "ok"
    if not monitor.media_server_online or offline > 0 or disk_status == "critical":
        overall = "degraded"
    if disk_status == "critical" and offline == len(store.all_source_ids()):
        overall = "down"

    return HealthResponse(
        status=overall,
        mediaServer=media,
        disk=disk,
        sources={
            "online": online,
            "offline": offline,
            "recording": recording,
            "stopped": stopped,
            "total": len(store.all_source_ids()),
        },
        retentionHours=settings.recording_retention_hours,
    )
