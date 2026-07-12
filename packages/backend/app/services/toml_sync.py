"""TOML常設ソースのMediaMTX登録（起動時・TOML更新時に共用）。"""

from __future__ import annotations

import logging

from .mediamtx import mediamtx
from .source_store import store

logger = logging.getLogger(__name__)


async def register_toml_sources() -> None:
    """store 上の TOML ソースを MediaMTX へ登録する（冪等）。

    削除されたソースのパスは残るが実害はないため放置する。
    """
    # ponytail: 削除済みパスの掃除はしない。必要になったら paths/list と突き合わせて delete。
    for sid in store.all_source_ids():
        rtsp_url = store.get_rtsp_url(sid)
        if not rtsp_url or not store.is_toml(sid):
            continue
        try:
            if "localhost:8554" in rtsp_url or "127.0.0.1:8554" in rtsp_url:
                # ダミーカメラ: publish 受信用パス（source 無し）を作成。
                await mediamtx.register_publish_path(sid)
                logger.info("ダミーカメラ用 publish パス作成: %s", sid)
            else:
                # 実機カメラ: プロキシで RTSP を pull 取り込み
                await mediamtx.register_path(sid, rtsp_url)
        except Exception:
            logger.exception("TOMLソースのMediaMTX登録失敗: %s", sid)
