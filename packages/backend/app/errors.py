"""共通エラー処理（SPEC 23章）。

すべてのAPIエラーは共通形式で返す:
    {
      "error": {
        "code": "CAMERA_AUTH_FAILED",
        "message": "カメラの認証に失敗しました",
        "details": { ... },
        "requestId": "req-01J..."
      }
    }
"""

from __future__ import annotations

import uuid
from enum import StrEnum
from typing import Any

from fastapi import Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class ErrorCode(StrEnum):
    """SPEC 23章 代表的なエラーコード。"""

    SOURCE_NOT_FOUND = "SOURCE_NOT_FOUND"
    SOURCE_ALREADY_EXISTS = "SOURCE_ALREADY_EXISTS"
    INVALID_RTSP_URL = "INVALID_RTSP_URL"
    CAMERA_CONNECTION_TIMEOUT = "CAMERA_CONNECTION_TIMEOUT"
    CAMERA_AUTH_FAILED = "CAMERA_AUTH_FAILED"
    STREAM_NOT_FOUND = "STREAM_NOT_FOUND"
    UNSUPPORTED_CODEC = "UNSUPPORTED_CODEC"
    LIVE_STREAM_NOT_AVAILABLE = "LIVE_STREAM_NOT_AVAILABLE"
    RECORDING_NOT_AVAILABLE = "RECORDING_NOT_AVAILABLE"
    INVALID_TIME_RANGE = "INVALID_TIME_RANGE"
    MEDIA_SERVER_UNAVAILABLE = "MEDIA_SERVER_UNAVAILABLE"
    STORAGE_UNAVAILABLE = "STORAGE_UNAVAILABLE"
    STORAGE_FULL = "STORAGE_FULL"
    INCIDENT_EXPORT_FAILED = "INCIDENT_EXPORT_FAILED"
    INTERNAL_ERROR = "INTERNAL_ERROR"
    VALIDATION_ERROR = "VALIDATION_ERROR"
    PANE_LIMIT_REACHED = "PANE_LIMIT_REACHED"


class AppError(Exception):
    """アプリケーション例外。エラーコード・メッセージ・詳細・HTTPステータスを持つ。"""

    def __init__(
        self,
        code: ErrorCode,
        message: str,
        *,
        status_code: int = 400,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}


def _request_id(request: Request) -> str:
    # クライアントが X-Request-Id を渡せばそれを使い、無ければ生成
    return request.headers.get("X-Request-Id") or f"req-{uuid.uuid4().hex[:24]}"


def _error_body(
    code: str,
    message: str,
    details: dict[str, Any],
    request_id: str,
) -> dict[str, Any]:
    return {
        "error": {
            "code": code,
            "message": message,
            "details": details,
            "requestId": request_id,
        }
    }


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    request_id = _request_id(request)
    return JSONResponse(
        status_code=exc.status_code,
        content=jsonable_encoder(
            _error_body(exc.code.value, exc.message, exc.details, request_id)
        ),
        headers={"X-Request-Id": request_id},
    )


async def http_exception_handler(
    request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    request_id = _request_id(request)
    detail = exc.detail if isinstance(exc.detail, str) else "HTTPエラー"
    code = (
        ErrorCode.INTERNAL_ERROR.value
        if exc.status_code >= 500
        else ErrorCode.VALIDATION_ERROR.value
    )
    return JSONResponse(
        status_code=exc.status_code,
        content=_error_body(code, detail, {"status": exc.status_code}, request_id),
        headers={"X-Request-Id": request_id},
    )


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    request_id = _request_id(request)
    # exc.errors() に ValueError 等の非シリアライズ可能オブジェクトが
    # 含まれることがあるため、jsonable_encoder で文字列化する。
    safe_errors = jsonable_encoder(exc.errors())
    return JSONResponse(
        status_code=422,
        content=_error_body(
            ErrorCode.VALIDATION_ERROR.value,
            "リクエストの内容が不正です",
            {"errors": safe_errors},
            request_id,
        ),
        headers={"X-Request-Id": request_id},
    )


async def unhandled_exception_handler(
    request: Request, exc: Exception
) -> JSONResponse:
    request_id = _request_id(request)
    return JSONResponse(
        status_code=500,
        content=_error_body(
            ErrorCode.INTERNAL_ERROR.value,
            "サーバー内部でエラーが発生しました",
            {},
            request_id,
        ),
        headers={"X-Request-Id": request_id},
    )
