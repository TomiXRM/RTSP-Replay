"""LIVE再生情報ルータ（SPEC 22.5）。"""

from __future__ import annotations

from fastapi import APIRouter

from ..errors import AppError, ErrorCode
from ..models.sources import LiveInfoResponse
from ..services.mediamtx import mediamtx
from ..services.monitor import monitor
from ..services.source_store import store

router = APIRouter(prefix="/sources", tags=["live"])


@router.get("/{source_id}/live", response_model=LiveInfoResponse)
async def get_live(source_id: str) -> LiveInfoResponse:
    """LIVE再生情報（SPEC 22.5）。

    フロントがMediaMTX固有URLを組み立てないよう、バックエンドが生成して返す。
    """
    if not store.exists(source_id):
        raise AppError(
            ErrorCode.SOURCE_NOT_FOUND,
            "映像ソースが見つかりません",
            status_code=404,
            details={"sourceId": source_id},
        )
    status = monitor.source_status(source_id)
    available = status in ("ONLINE", "RECONNECTING", "CONNECTING")
    return LiveInfoResponse(
        sourceId=source_id,
        mode="HLS",
        url=mediamtx.live_hls_url(source_id),
        available=available,
    )
