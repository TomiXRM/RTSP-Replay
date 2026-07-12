"""映像ソース関連スキーマ（SPEC 22.1〜22.4）。"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from .common import Origin, RecordingStatus, SourceStatus


class Source(BaseModel):
    """映像ソース（RTSP URL/認証情報は含めない: NFR-003）。"""

    id: str
    name: str
    origin: Origin
    status: SourceStatus = SourceStatus.CONNECTING
    recordingStatus: RecordingStatus = RecordingStatus.UNKNOWN
    lastFrameAt: datetime | None = None
    lastRecordingAt: datetime | None = None
    # 任意のメタ情報
    location: str | None = None
    resolution: str | None = None

    def to_public_dict(self) -> dict:
        """認証情報を含まない公開用辞書。"""
        return self.model_dump(mode="json")


class SourceListResponse(BaseModel):
    sources: list[Source]


class ConnectionTestRequest(BaseModel):
    """RTSP接続テスト要求（SPEC 22.2）。"""

    rtspUrl: str = Field(..., min_length=1)


class ConnectionTestResponse(BaseModel):
    """RTSP接続テスト結果（SPEC 22.2）。"""

    success: bool
    codec: str | None = None
    width: int | None = None
    height: int | None = None
    fps: float | None = None
    # 失敗時の詳細
    errorCode: str | None = None
    message: str | None = None


class SourceCreateRequest(BaseModel):
    """映像ソース追加要求（SPEC 22.3）。RTSP URL/認証はここで受けるが保存しない。"""

    name: str = Field(..., min_length=1)
    rtspUrl: str = Field(..., min_length=1)
    persistent: bool = False
    description: str | None = None


class SourceCreateResponse(BaseModel):
    id: str
    name: str
    status: SourceStatus


class LiveInfoResponse(BaseModel):
    """LIVE再生情報（SPEC 22.5）。フロントがMediaMTX固有URLを組まない。"""

    sourceId: str
    mode: str = "HLS"
    url: str
    available: bool
