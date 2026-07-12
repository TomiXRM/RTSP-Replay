"""録画範囲取得（SPEC FR-016, 22.6）。

MediaMTX の録画ディレクトリを走査し、録画存在区間・欠損区間を計算する。
録画ファイルは fMP4 で、セグメント単位（既定1分）で保存される。
常に2時間分が存在すると仮定せず、欠損区間を扱えること（FR-016）。
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

from ..config import settings
from ..services.mediamtx import _mtx_path_name
from ..services.source_store import store

logger = logging.getLogger(__name__)

# MediaMTX録画ファイル名: %Y-%m-%d_%H-%M-%S-%f (例: 2026-07-10_19-32-10-123456.mp4)
SEGMENT_RE = re.compile(
    r"(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})-(\d{6})\.mp4$"
)

# 欠損とみなす隙間のしきい値（秒）。セグメント長より長ければ欠損区間。
GAP_THRESHOLD_SECONDS = 90


def _segment_start(name: str) -> datetime | None:
    m = SEGMENT_RE.search(name)
    if not m:
        return None
    y, mo, d, h, mi, s, us = (int(x) for x in m.groups())
    return datetime(y, mo, d, h, mi, s, us // 1000, tzinfo=timezone.utc)


def compute_ranges(source_id: str) -> dict:
    """録画ディレクトリを走査し、ranges/availableFrom/availableTo を返す。

    戻り値は RecordingRangesResponse 互換の dict（全て UTC ISO）。
    録画が無い場合は availableFrom/availableTo = None, ranges = []。
    """
    rtsp_url = store.get_rtsp_url(source_id)
    if rtsp_url is None:
        from ..errors import AppError, ErrorCode

        raise AppError(
            ErrorCode.SOURCE_NOT_FOUND,
            "映像ソースが見つかりません",
            status_code=404,
            details={"sourceId": source_id},
        )

    path_name = _mtx_path_name(source_id)
    rec_root = Path(settings.recordings_dir) / path_name

    if not rec_root.exists():
        return {
            "sourceId": source_id,
            "availableFrom": None,
            "availableTo": None,
            "ranges": [],
        }

    # セグメント開始時刻でソート
    starts: list[datetime] = []
    for f in rec_root.rglob("*.mp4"):
        st = _segment_start(f.name)
        if st:
            starts.append(st)
    starts.sort()

    if not starts:
        return {
            "sourceId": source_id,
            "availableFrom": None,
            "availableTo": None,
            "ranges": [],
        }

    # 隙間を検知して ranges を構築（GAP_THRESHOLD 以上の隙間は欠損）
    ranges: list[dict] = []
    seg_len = timedelta(seconds=settings.recording_segment_seconds)
    gap_thr = timedelta(seconds=GAP_THRESHOLD_SECONDS)

    range_start = starts[0]
    prev_end = starts[0] + seg_len
    for st in starts[1:]:
        if st - prev_end > gap_thr:
            ranges.append(
                {"start": range_start.isoformat(), "end": prev_end.isoformat()}
            )
            range_start = st
        prev_end = st + seg_len
    ranges.append({"start": range_start.isoformat(), "end": prev_end.isoformat()})

    return {
        "sourceId": source_id,
        "availableFrom": starts[0].isoformat(),
        "availableTo": prev_end.isoformat(),
        "ranges": ranges,
    }
