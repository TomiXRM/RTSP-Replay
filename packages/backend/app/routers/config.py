"""カメラ設定（sources.toml / .env）の閲覧・編集ルータ。

Web UI から config/sources.toml と .env を直接編集できるようにする。
保存時に検証し、成功したら store の再読込と MediaMTX への
パス再登録（冪等）まで行う。.env は os.environ へも即時反映するため、
TOML の username_env / password_env 参照分は再起動なしで効く。

注意: .env の内容（パスワード含む）は GET でそのままUIへ返る。
LAN内利用前提（NFR-003）。
"""

from __future__ import annotations

import logging
import os
import re
import tomllib
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel

from ..config import PROJECT_ROOT, settings
from ..errors import AppError, ErrorCode
from ..services.source_store import store
from ..services.toml_sync import register_toml_sources

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/config", tags=["config"])


class SourcesTomlResponse(BaseModel):
    content: str
    path: str


class SourcesTomlUpdateRequest(BaseModel):
    content: str


class SourcesTomlUpdateResponse(BaseModel):
    ok: bool
    sourceIds: list[str]


def _validate_sources_toml(content: str) -> list[str]:
    """TOML構文と必須項目を検証し、ソースID一覧を返す。不正なら AppError。"""
    try:
        data = tomllib.loads(content)
    except tomllib.TOMLDecodeError as e:
        raise AppError(
            ErrorCode.VALIDATION_ERROR,
            f"TOML構文エラー: {e}",
            status_code=422,
        )

    entries = data.get("sources", [])
    if not isinstance(entries, list):
        raise AppError(
            ErrorCode.VALIDATION_ERROR,
            "sources は [[sources]] の配列で定義してください",
            status_code=422,
        )

    ids: list[str] = []
    for i, entry in enumerate(entries):
        label = f"[[sources]] {i + 1}番目"
        sid = entry.get("id")
        name = entry.get("name")
        if not sid or not name:
            raise AppError(
                ErrorCode.VALIDATION_ERROR,
                f"{label}: id と name は必須です",
                status_code=422,
            )
        if "rtsp_url" not in entry and not entry.get("host"):
            raise AppError(
                ErrorCode.VALIDATION_ERROR,
                f"{label} ({sid}): rtsp_url または host のどちらかが必要です",
                status_code=422,
            )
        if sid in ids:
            raise AppError(
                ErrorCode.VALIDATION_ERROR,
                f"{label}: id '{sid}' が重複しています",
                status_code=422,
            )
        ids.append(sid)
    return ids


@router.get("/sources-toml", response_model=SourcesTomlResponse)
async def get_sources_toml() -> SourcesTomlResponse:
    """sources.toml の現在の内容を返す。"""
    p = Path(settings.sources_toml_path)
    content = p.read_text(encoding="utf-8") if p.exists() else ""
    return SourcesTomlResponse(content=content, path=str(p))


@router.put("/sources-toml", response_model=SourcesTomlUpdateResponse)
async def update_sources_toml(
    req: SourcesTomlUpdateRequest,
) -> SourcesTomlUpdateResponse:
    """sources.toml を検証して書き込み、ソース一覧とMediaMTXへ即時反映する。"""
    ids = _validate_sources_toml(req.content)

    p = Path(settings.sources_toml_path)
    # 直前の内容を .bak に退避（誤保存からの復旧用）
    if p.exists():
        p.with_suffix(".toml.bak").write_text(
            p.read_text(encoding="utf-8"), encoding="utf-8"
        )
    p.write_text(req.content, encoding="utf-8")
    logger.info("sources.toml をUIから更新: %d ソース", len(ids))

    # 再起動なしで反映
    store.reload_toml()
    await register_toml_sources()
    return SourcesTomlUpdateResponse(ok=True, sourceIds=ids)


# ===== .env =====

_ENV_LINE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*\s*=")
_ENV_PATH = PROJECT_ROOT / ".env"


class EnvResponse(BaseModel):
    content: str
    path: str


class EnvUpdateRequest(BaseModel):
    content: str


class EnvUpdateResponse(BaseModel):
    ok: bool
    keys: list[str]


def _validate_env(content: str) -> dict[str, str]:
    """KEY=VALUE 形式を検証し、キーと値の辞書を返す。不正行は AppError。"""
    values: dict[str, str] = {}
    for i, line in enumerate(content.splitlines(), start=1):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if not _ENV_LINE.match(stripped):
            raise AppError(
                ErrorCode.VALIDATION_ERROR,
                f"{i}行目: KEY=VALUE 形式ではありません: {stripped[:60]}",
                status_code=422,
            )
        k, v = stripped.split("=", 1)
        values[k.strip()] = v.strip().strip('"').strip("'")
    return values


@router.get("/env", response_model=EnvResponse)
async def get_env() -> EnvResponse:
    """.env の現在の内容を返す（パスワード含む・LAN内前提）。"""
    content = _ENV_PATH.read_text(encoding="utf-8") if _ENV_PATH.exists() else ""
    return EnvResponse(content=content, path=str(_ENV_PATH))


@router.put("/env", response_model=EnvUpdateResponse)
async def update_env(req: EnvUpdateRequest) -> EnvUpdateResponse:
    """.env を検証して書き込み、os.environ とソース定義へ即時反映する。

    TOML の username_env / password_env 参照分は再起動なしで効く。
    それ以外のサーバ設定（ポート等）は再起動が必要。
    """
    values = _validate_env(req.content)
    retention = _parse_retention(values.get("RECORDING_RETENTION_HOURS"))

    if _ENV_PATH.exists():
        (_ENV_PATH.parent / ".env.bak").write_text(
            _ENV_PATH.read_text(encoding="utf-8"), encoding="utf-8"
        )
    _ENV_PATH.write_text(req.content, encoding="utf-8")
    logger.info(".env をUIから更新: %d キー", len(values))

    # 認証情報の即時反映: 起動時と異なり既存値も上書きする
    for k, v in values.items():
        os.environ[k] = v
    store.reload_toml()
    await register_toml_sources()

    # 録画保持期間の即時反映（RECORDING_RETENTION_HOURS）
    if retention is not None:
        from ..services.mediamtx import mediamtx

        settings.recording_retention_hours = retention
        await mediamtx.set_record_delete_after(retention)

    return EnvUpdateResponse(ok=True, keys=list(values.keys()))


def _parse_retention(raw: str | None) -> float | None:
    """RECORDING_RETENTION_HOURS の検証。未指定なら None。"""
    if raw is None:
        return None
    try:
        hours = float(raw)
    except ValueError:
        raise AppError(
            ErrorCode.VALIDATION_ERROR,
            f"RECORDING_RETENTION_HOURS が数値ではありません: {raw}",
            status_code=422,
        )
    if not 0 < hours <= 168:
        raise AppError(
            ErrorCode.VALIDATION_ERROR,
            "RECORDING_RETENTION_HOURS は 0〜168（1週間）の範囲で指定してください",
            status_code=422,
        )
    return hours
