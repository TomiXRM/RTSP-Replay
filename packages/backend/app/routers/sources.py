"""映像ソース関連ルータ（SPEC 22.1〜22.4）。"""

from __future__ import annotations

import logging

from fastapi import APIRouter

from ..models.common import Origin
from ..models.sources import (
    ConnectionTestRequest,
    ConnectionTestResponse,
    Source,
    SourceCreateRequest,
    SourceCreateResponse,
    SourceListResponse,
)
from ..services.monitor import monitor
from ..services.source_store import store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sources", tags=["sources"])


def _to_source_model(source_id: str) -> Source:
    """内部ソースを公開モデルへ変換（RTSP URLを含めない: NFR-003）。"""
    name = store.get_name(source_id) or source_id
    origin = Origin.TOML if store.is_toml(source_id) else Origin.DYNAMIC
    return Source(
        id=source_id,
        name=name,
        origin=origin,
        status=monitor.source_status(source_id),
        recordingStatus=monitor.recording_status(source_id),
        lastFrameAt=monitor.last_frame_at.get(source_id),
        lastRecordingAt=monitor.last_recording_at.get(source_id),
    )


@router.get("", response_model=SourceListResponse)
async def list_sources() -> SourceListResponse:
    """映像ソース一覧（SPEC 22.1）。RTSP URL/認証は含めない。"""
    ids = store.all_source_ids()
    return SourceListResponse(sources=[_to_source_model(sid) for sid in ids])


@router.post("/test", response_model=ConnectionTestResponse)
async def test_connection(req: ConnectionTestRequest) -> ConnectionTestResponse:
    """RTSP接続テスト（SPEC 22.2, FR-005）。"""
    from ..services.rtsp_probe import probe

    result = await probe(req.rtspUrl)
    return ConnectionTestResponse(
        success=result.success,
        codec=result.codec,
        width=result.width,
        height=result.height,
        fps=result.fps,
        errorCode=result.error_code,
        message=result.message,
    )


@router.post("", response_model=SourceCreateResponse, status_code=201)
async def create_source(req: SourceCreateRequest) -> SourceCreateResponse:
    """一時/永続ソース追加（SPEC 22.3, FR-006）。"""
    sid = store.create(
        name=req.name,
        rtsp_url=req.rtspUrl,
        persistent=req.persistent,
        description=req.description,
    )
    # MediaMTX へパス登録（バックグラウンドで接続）
    from ..services.mediamtx import mediamtx

    try:
        rtsp_url = store.get_rtsp_url(sid)
        if rtsp_url:
            await mediamtx.register_path(sid, rtsp_url)
    except Exception:
        logger.exception("MediaMTXパス登録失敗: %s", sid)
        # 登録失敗でもソース自体は返す（接続中状態）

    return SourceCreateResponse(
        id=sid,
        name=req.name,
        status="CONNECTING",
    )


@router.delete("/{source_id}", status_code=204)
async def delete_source(source_id: str) -> None:
    """映像ソース削除（SPEC 22.4）。動的ソースのみ。"""
    deleted = store.delete(source_id)
    if deleted:
        from ..services.mediamtx import mediamtx

        await mediamtx.remove_path(source_id)
