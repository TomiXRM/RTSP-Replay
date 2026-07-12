"""イベント記録サービス。

タイムラインへマーカー表示するイベントを記録・取得する。
入力経路:
  1. HTTP: POST /api/v1/events（routers/events.py）
  2. UDP: JSON または プレーンテキストのデータグラム（ブロードキャスト可）
ROS 2 からは上記いずれかへブリッジする（UIのイベントタブに手順を記載）。
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from ..config import settings
from ..db import get_conn

logger = logging.getLogger(__name__)

MAX_LABEL_LEN = 200


def record_event(
    label: str,
    ts: str | None = None,
    source_id: str | None = None,
    origin: str = "api",
) -> dict[str, Any]:
    """イベントを1件記録して返す。ts 省略時は現在時刻（UTC）。"""
    label = label.strip()[:MAX_LABEL_LEN]
    if not label:
        raise ValueError("label が空です")
    iso = ts or datetime.now(timezone.utc).isoformat()
    # ts の妥当性検証（不正なら現在時刻へフォールバックせずエラー）
    datetime.fromisoformat(iso.replace("Z", "+00:00"))
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO events (ts, label, source_id, origin) VALUES (?, ?, ?, ?)",
            (iso, label, source_id, origin),
        )
        eid = cur.lastrowid
    logger.info("イベント記録 [%s] %s (%s)", origin, label, iso)
    return {"id": eid, "ts": iso, "label": label, "sourceId": source_id, "origin": origin}


def list_events(hours: float = 2.0) -> list[dict[str, Any]]:
    """直近 hours 時間のイベントを新しい順に返す。"""
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, ts, label, source_id, origin FROM events "
            "WHERE ts >= ? ORDER BY ts DESC LIMIT 500",
            (since,),
        ).fetchall()
    return [
        {
            "id": r["id"],
            "ts": r["ts"],
            "label": r["label"],
            "sourceId": r["source_id"],
            "origin": r["origin"],
        }
        for r in rows
    ]


class _EventUdpProtocol(asyncio.DatagramProtocol):
    """UDPイベント受信。

    ペイロード形式:
      - JSON: {"label": "...", "ts": "ISO8601(省略可)", "sourceId": "(省略可)"}
      - プレーンテキスト: そのまま label として現在時刻で記録
    """

    def datagram_received(self, data: bytes, addr: tuple[str, int]) -> None:
        try:
            text = data.decode("utf-8", errors="replace").strip()
            if not text:
                return
            if text.startswith("{"):
                obj = json.loads(text)
                record_event(
                    label=str(obj.get("label", "")),
                    ts=obj.get("ts"),
                    source_id=obj.get("sourceId"),
                    origin="udp",
                )
            else:
                record_event(label=text, origin="udp")
        except Exception:
            logger.exception("UDPイベントの解析に失敗: %r from %s", data[:100], addr)


_udp_transport: asyncio.DatagramTransport | None = None


async def start_udp_listener() -> None:
    """UDPイベントリスナーを起動する（event_udp_port=0 で無効）。"""
    global _udp_transport
    port = settings.event_udp_port
    if not port:
        logger.info("イベントUDPリスナー無効 (EVENT_UDP_PORT=0)")
        return
    loop = asyncio.get_running_loop()
    try:
        _udp_transport, _ = await loop.create_datagram_endpoint(
            _EventUdpProtocol,
            local_addr=("0.0.0.0", port),
            allow_broadcast=True,
        )
        logger.info("イベントUDPリスナー起動: 0.0.0.0:%d", port)
    except OSError:
        logger.exception("イベントUDPリスナーの起動失敗 (port=%d)", port)


def stop_udp_listener() -> None:
    global _udp_transport
    if _udp_transport is not None:
        _udp_transport.close()
        _udp_transport = None
