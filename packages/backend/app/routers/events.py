"""イベントAPI（タイムラインマーカー）。"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..errors import AppError, ErrorCode
from ..services.events import list_events, record_event

router = APIRouter(prefix="/events", tags=["events"])


class EventCreateRequest(BaseModel):
    label: str = Field(min_length=1, max_length=200)
    ts: str | None = None
    sourceId: str | None = None


class Event(BaseModel):
    id: int
    ts: str
    label: str
    sourceId: str | None
    origin: str


class EventListResponse(BaseModel):
    events: list[Event]


@router.post("", response_model=Event, status_code=201)
async def create_event(req: EventCreateRequest) -> Event:
    """イベントを記録する。ts 省略時は受信時刻。"""
    try:
        return Event(**record_event(label=req.label, ts=req.ts, source_id=req.sourceId))
    except ValueError as e:
        raise AppError(ErrorCode.VALIDATION_ERROR, str(e), status_code=422)


@router.get("", response_model=EventListResponse)
async def get_events(hours: float = 2.0) -> EventListResponse:
    """直近 hours 時間のイベント一覧（新しい順）。"""
    return EventListResponse(events=[Event(**e) for e in list_events(hours)])
