"""事故映像保存（SPEC 19章, FR-031〜033）。

指定時刻範囲の映像を、リング削除対象外の独立MP4として保存する。
MediaMTXの playback API を経由して該当区間を取得し、
事故保管ディレクトリへコピーする（FR-033）。
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path

import httpx

from ..config import settings
from ..errors import AppError, ErrorCode
from ..services.mediamtx import _mtx_path_name, mediamtx
from ..services.source_store import store

logger = logging.getLogger(__name__)


async def save_incident(
    title: str,
    reason: str,
    note: str | None,
    start: datetime,
    end: datetime,
    source_ids: list[str],
) -> dict:
    """事故保存を実行する。

    各ソースについて MediaMTX playback から区間映像を取得し、
    事故保管ディレクトリへ独立MP4として保存する（FR-033）。
    """
    incident_id = f"inc-{uuid.uuid4().hex[:24]}"
    out_dir = settings.incidents_path / incident_id
    out_dir.mkdir(parents=True, exist_ok=True)

    # 終端が未来の場合は現在時刻へクランプ（未来分は録画が存在せず404になるため）。
    # 「事故の後N分」を確実に残したい場合は、その時間が経過してから保存する。
    now = datetime.now(timezone.utc)
    if end > now:
        end = now

    results = []
    duration = int((end - start).total_seconds())

    for sid in source_ids:
        if not store.exists(sid):
            results.append(
                {
                    "sourceId": sid,
                    "success": False,
                    "errorCode": ErrorCode.SOURCE_NOT_FOUND.value,
                    "message": "映像ソースが見つかりません",
                }
            )
            continue
        try:
            url, path = await _export_segment(sid, start, end, out_dir)
            results.append(
                {
                    "sourceId": sid,
                    "success": True,
                    "url": url,
                    "path": path,
                }
            )
        except AppError as e:
            results.append(
                {
                    "sourceId": sid,
                    "success": False,
                    "errorCode": e.code.value,
                    "message": e.message,
                }
            )
        except Exception as e:
            logger.exception("事故保存失敗 %s", sid)
            results.append(
                {
                    "sourceId": sid,
                    "success": False,
                    "errorCode": ErrorCode.INCIDENT_EXPORT_FAILED.value,
                    "message": "映像の保存に失敗しました",
                }
            )

    # メタデータ保存（DB）
    from ..db import get_conn

    with get_conn() as conn:
        conn.execute(
            "INSERT INTO incidents (id, title, reason, note, start, end) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (incident_id, title, reason, note, start.isoformat(), end.isoformat()),
        )
        for r in results:
            conn.execute(
                "INSERT OR REPLACE INTO incident_sources (incident_id, source_id, url) "
                "VALUES (?, ?, ?)",
                (incident_id, r["sourceId"], r.get("url")),
            )

    return {
        "id": incident_id,
        "title": title,
        "reason": reason,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "sourceIds": source_ids,
        "dir": str(out_dir),
        "results": results,
    }


async def _export_segment(
    source_id: str, start: datetime, end: datetime, out_dir: Path
) -> tuple[str, str]:
    """MediaMTX playback から映像を取得し、事故保管へ保存する。

    MediaMTX の録画からの切り出し機能を利用する。MVPでは playback API へ
    クライアントアクセス用URLを生成し、ffmpeg で独立MP4へ変換・保存する。
    """
    if not settings.enable_mediamtx_control:
        # テスト環境: 疎通確認のみ。プレースホルダファイルを作成。
        placeholder = out_dir / f"{_mtx_path_name(source_id)}.mp4"
        placeholder.write_bytes(b"")
        return f"/incidents/{out_dir.name}/{placeholder.name}", str(placeholder)

    # MediaMTX playback のダウンロードURLを構築。
    # playback_url() はフロント用の相対URL（/playback/get?...）を返すため、
    # playback サーバーへ直接アクセスする際はプレフィックスを外す。
    start_iso = start.strftime("%Y-%m-%dT%H:%M:%SZ")
    duration = int((end - start).total_seconds())
    download_url = mediamtx.playback_url(source_id, start_iso, duration)
    fetch_url = settings.mediamtx_playback_base + download_url.removeprefix(
        "/playback"
    )

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            r = await client.get(fetch_url)
            if r.status_code != 200:
                raise AppError(
                    ErrorCode.RECORDING_NOT_AVAILABLE,
                    "該当時刻の録画が取得できませんでした",
                    status_code=404,
                    details={"sourceId": source_id, "status": r.status_code},
                )
            out_file = out_dir / f"{_mtx_path_name(source_id)}.mp4"
            out_file.write_bytes(r.content)
            # フロント公開用の相対URL（プロキシ経由で配信）と、サーバー上の絶対パス
            return f"/incidents/{out_dir.name}/{out_file.name}", str(out_file)
    except httpx.HTTPError as e:
        raise AppError(
            ErrorCode.INCIDENT_EXPORT_FAILED,
            "事故映像の取得に失敗しました",
            status_code=502,
            details={"sourceId": source_id},
        ) from e
