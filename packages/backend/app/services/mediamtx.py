"""MediaMTX REST API ラッパ（SPEC 5章, 22.5, 22.7）。

MediaMTX v1.x の管理APIへ接続し、パス定義・録画設定・状態取得を行う。
バックエンドが配信URLを生成し、フロントがMediaMTX固有URLを組み立てない（SPEC 22.7注記）。

参考: https://github.com/bluenviron/mediamtx
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from ..config import settings
from ..errors import AppError, ErrorCode

logger = logging.getLogger(__name__)


def _mtx_path_name(source_id: str) -> str:
    """MediaMTX上のパス名（ソースIDを正規化）。"""
    # パス名は英数字・ハイフン・アンダースコア限定
    return "".join(c if c.isalnum() or c in "-_" else "-" for c in source_id)


class MediaMTXClient:
    """MediaMTX 管理API クライアント。"""

    def __init__(self, base_url: str | None = None) -> None:
        self.base_url = (base_url or settings.mediamtx_api).rstrip("/")
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(base_url=self.base_url, timeout=5.0)
        return self._client

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def set_record_delete_after(self, hours: float) -> None:
        """録画保持期間（recordDeleteAfter）をグローバル設定へ反映する（冪等）。"""
        if not settings.enable_mediamtx_control:
            return
        try:
            client = await self._get_client()
            r = await client.patch(
                "/v3/config/global/patch",
                json={"recordDeleteAfter": f"{int(hours * 3600)}s"},
            )
            if r.status_code == 200:
                logger.info("mediamtx recordDeleteAfter を %sh に設定", hours)
            else:
                logger.warning(
                    "recordDeleteAfter 設定失敗: %d %s", r.status_code, r.text[:200]
                )
        except httpx.HTTPError:
            logger.exception("recordDeleteAfter 設定失敗")

    async def is_online(self) -> bool:
        """MediaMTX API が応答するか。"""
        if not settings.enable_mediamtx_control:
            return False
        try:
            client = await self._get_client()
            # v1.19: パス一覧エンドポイントで到達性を確認
            r = await client.get("/v3/paths/list")
            return r.status_code == 200
        except Exception:
            return False

    async def register_publish_path(self, source_id: str) -> None:
        """publish 受信用パス（source 無し）を作成する。

        ダミーカメラなど、外部から RTSP push される場合に使用。
        MediaMTX v1.19 はパス定義がないと publish を拒否するため、
        空のパス定義を作成しておく。録画（record: true）も有効化。
        """
        if not settings.enable_mediamtx_control:
            logger.info("mediamtx制御無効: %s のpublishパス作成をスキップ", source_id)
            return

        path = _mtx_path_name(source_id)
        client = await self._get_client()
        config: dict[str, Any] = {
            "name": path,
            "record": True,
        }
        try:
            r = await client.post(f"/v3/config/paths/add/{path}", json=config)
            if r.status_code in (200, 201):
                logger.info("mediamtx publish パス作成: %s", path)
                return
            if r.status_code in (400, 409):
                r = await client.patch(
                    f"/v3/config/paths/patch/{path}", json=config
                )
                if r.status_code == 200:
                    logger.info("mediamtx publish パス更新: %s", path)
                    return
            logger.warning("publish パス作成失敗 %s: %s %s", path, r.status_code, r.text[:200])
        except Exception as e:
            logger.warning("publish パス作成エラー %s: %s", path, e)

    async def register_path(self, source_id: str, rtsp_url: str) -> None:
        """パスを定義する（RTSP取り込み元を指定）。

        MediaMTX v1.19 API: POST /v3/config/paths/add/{name}
        パス名は URL に含み、body には source 等のみ指定する。
        録画（record: true）もあわせて有効化する（SPEC FR-014）。
        """
        if not settings.enable_mediamtx_control:
            logger.info("mediamtx制御無効: %s の登録をスキップ", source_id)
            return

        path = _mtx_path_name(source_id)
        client = await self._get_client()
        config: dict[str, Any] = {
            "name": path,
            "source": rtsp_url,
            "sourceProtocol": "tcp",
            "sourceOnDemand": False,
            "record": True,
        }
        try:
            # v1.19: パス名をURLに含む。既存時は上書きできる add を使う。
            r = await client.post(f"/v3/config/paths/add/{path}", json=config)
            if r.status_code in (200, 201):
                logger.info("mediamtx パス登録: %s", path)
                return
            # 既存の場合は patch で更新
            if r.status_code in (400, 409):
                r = await client.patch(
                    f"/v3/config/paths/patch/{path}", json=config
                )
                if r.status_code == 200:
                    logger.info("mediamtx パス更新: %s", path)
                    return
            raise AppError(
                ErrorCode.MEDIA_SERVER_UNAVAILABLE,
                "MediaMTXへのパス登録に失敗しました",
                status_code=502,
                details={
                    "sourceId": source_id,
                    "status": r.status_code,
                    "body": r.text[:300],
                },
            )
        except httpx.HTTPError as e:
            raise AppError(
                ErrorCode.MEDIA_SERVER_UNAVAILABLE,
                "MediaMTXへ接続できません",
                status_code=502,
                details={"sourceId": source_id},
            ) from e

    async def remove_path(self, source_id: str) -> None:
        """パス定義を削除する。"""
        if not settings.enable_mediamtx_control:
            return
        path = _mtx_path_name(source_id)
        client = await self._get_client()
        try:
            await client.delete(f"/v3/config/paths/delete/{path}")
            logger.info("mediamtx パス削除: %s", path)
        except Exception as e:
            logger.warning("mediamtx パス削除失敗 %s: %s", path, e)

    async def path_ready(self, source_id: str) -> bool:
        """パスにストリームが存在するか（出版済みか）。"""
        if not settings.enable_mediamtx_control:
            return False
        path = _mtx_path_name(source_id)
        client = await self._get_client()
        try:
            r = await client.get("/v3/paths/list")
            if r.status_code != 200:
                return False
            data = r.json()
            items = data.get("items", [])
            for item in items:
                if item.get("name") == path and item.get("ready"):
                    return True
            return False
        except Exception:
            return False

    def live_hls_url(self, source_id: str) -> str:
        """LIVE配信のHLS URLを生成する（SPEC 22.5）。

        フロントのプロキシ経由を想定し、相対パスで返す。
        Viteプロキシが /streams/* を MediaMTX HLS(8888) へ転送する。
        """
        path = _mtx_path_name(source_id)
        return f"/streams/{path}/index.m3u8"

    def playback_url(self, source_id: str, start_iso: str, duration: int) -> str:
        """過去映像再生URLを生成する（SPEC 22.7）。

        MediaMTX v1.19 playback server のエンドポイント:
          GET /get?path={name}&start={ISO8601 JST}&duration={seconds}

        start は MediaMTX のローカルタイム（JST）で指定する必要がある。
        フロントのプロキシ経由（/playback/* → 9996）を想定し、相対パスで返す。
        """
        path = _mtx_path_name(source_id)
        from urllib.parse import quote
        from datetime import timedelta

        # UTC → JST へ変換（MediaMTX はサーバーローカルタイムで録画時刻を管理）
        # start_iso は "2026-07-12T04:10:00Z" 形式（UTC）
        from datetime import datetime
        dt = datetime.fromisoformat(start_iso.replace("Z", "+00:00"))
        jst = dt + timedelta(hours=9)
        start_jst = jst.strftime("%Y-%m-%dT%H:%M:%S+09:00")

        return (
            f"/playback/get"
            f"?path={quote(path)}&start={quote(start_jst)}&duration={duration}"
        )


mediamtx = MediaMTXClient()
