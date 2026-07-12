"""事故映像保存スキーマ（SPEC 19章, 22.8）。"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field, model_validator


class IncidentReason(StrEnum):
    """事故保存理由（SPEC 19章）。"""

    ROBOT_ERROR = "ROBOT_ERROR"
    QUALITY_DEFECT = "QUALITY_DEFECT"
    SAFETY_ISSUE = "SAFETY_ISSUE"
    COMMUNICATION_FAILURE = "COMMUNICATION_FAILURE"
    OPERATION_CHECK = "OPERATION_CHECK"
    OTHER = "OTHER"


class IncidentCreateRequest(BaseModel):
    """事故映像保存要求（SPEC 22.8）。"""

    title: str = Field(..., min_length=1)
    reason: IncidentReason
    note: str | None = None
    start: datetime
    end: datetime
    sourceIds: list[str] = Field(..., min_length=1)

    @model_validator(mode="after")
    def _check_range(self) -> "IncidentCreateRequest":
        if self.end <= self.start:
            raise ValueError("end は start より後の時刻にしてください")
        return self


class IncidentExportResult(BaseModel):
    """1ソース分の事故保存結果。"""

    sourceId: str
    success: bool
    url: str | None = None
    path: str | None = None  # サーバー上の絶対パス
    errorCode: str | None = None
    message: str | None = None


class IncidentCreateResponse(BaseModel):
    """事故保存レスポンス（FR-031, FR-032, FR-033）。"""

    id: str
    title: str
    reason: IncidentReason
    start: datetime
    end: datetime
    sourceIds: list[str]
    dir: str  # 保存先ディレクトリ（サーバー上の絶対パス）
    results: list[IncidentExportResult]
