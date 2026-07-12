"""過去映像再生ルータ（SPEC 22.7, FR-017〜020）。"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Query

from ..errors import AppError, ErrorCode
from ..models.recordings import PlaybackInfoResponse
from ..services.mediamtx import mediamtx
from ..services.source_store import store

router = APIRouter(prefix="/sources", tags=["playback"])


@router.get("/{source_id}/playback", response_model=PlaybackInfoResponse)
async def get_playback(
    source_id: str,
    start: str = Query(..., description="再生開始時刻 ISO8601 (UTC)"),
    duration: int = Query(..., gt=0, le=7200, description="再生時間（秒）"),
) -> PlaybackInfoResponse:
    """過去映像再生情報（SPEC 22.7）。

    フロントがMediaMTX固有URLを組み立ててはならないため、バックエンドが生成する。
    """
    if not store.exists(source_id):
        raise AppError(
            ErrorCode.SOURCE_NOT_FOUND,
            "映像ソースが見つかりません",
            status_code=404,
            details={"sourceId": source_id},
        )

    # start をパース（ISO8601）
    try:
        start_dt = datetime.fromisoformat(start.replace("Z", "+00:00"))
    except ValueError as e:
        raise AppError(
            ErrorCode.INVALID_TIME_RANGE,
            "開始時刻の形式が不正です（ISO8601）",
            status_code=400,
            details={"start": start},
        ) from e

    if start_dt.tzinfo is None:
        start_dt = start_dt.replace(tzinfo=timezone.utc)

    start_iso = start_dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    url = mediamtx.playback_url(source_id, start_iso, duration)
    return PlaybackInfoResponse(
        sourceId=source_id,
        start=start_dt,
        duration=duration,
        url=url,
    )
