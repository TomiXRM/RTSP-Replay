"""録画範囲・過去映像再生スキーマ（SPEC 22.6, 22.7）。"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class RecordingRange(BaseModel):
    """録画が存在する区間。"""

    start: datetime
    end: datetime


class RecordingRangesResponse(BaseModel):
    """録画範囲（SPEC 22.6, FR-016）。

    ranges は録画存在区間、それ以外は欠損区間として扱う。
    """

    sourceId: str
    availableFrom: datetime | None
    availableTo: datetime | None
    ranges: list[RecordingRange]


class PlaybackInfoResponse(BaseModel):
    """過去映像再生情報（SPEC 22.7）。

    フロントエンドがMediaMTX固有URLを組み立ててはならないため、
    バックエンドが再生URLを生成して返す。
    """

    sourceId: str
    start: datetime
    duration: int
    url: str
