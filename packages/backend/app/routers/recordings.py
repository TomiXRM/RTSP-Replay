"""録画範囲ルータ（SPEC 22.6, FR-016）。"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from ..errors import AppError, ErrorCode
from ..models.recordings import RecordingRange, RecordingRangesResponse
from ..services.recording_ranges import compute_ranges
from ..services.source_store import store

router = APIRouter(prefix="/sources", tags=["recordings"])


@router.get(
    "/{source_id}/recordings/ranges",
    response_model=RecordingRangesResponse,
)
async def get_recording_ranges(source_id: str) -> RecordingRangesResponse:
    """録画範囲（SPEC 22.6, FR-016）。"""
    if not store.exists(source_id):
        raise AppError(
            ErrorCode.SOURCE_NOT_FOUND,
            "映像ソースが見つかりません",
            status_code=404,
            details={"sourceId": source_id},
        )
    data = compute_ranges(source_id)
    return RecordingRangesResponse(
        sourceId=data["sourceId"],
        availableFrom=data["availableFrom"],
        availableTo=data["availableTo"],
        ranges=[RecordingRange(**r) for r in data["ranges"]],
    )
