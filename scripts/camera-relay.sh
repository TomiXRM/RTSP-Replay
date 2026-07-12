#!/usr/bin/env bash
# =============================================================================
# カメラ中継（タイムスタンプ打ち直し）
# =============================================================================
# AtomCam2 などタイムスタンプが不正なカメラを、ffmpeg で受信時刻ベースへ
# 打ち直して MediaMTX へ push する。再エンコード無し（-c copy）。
#
# 背景: AtomCam2 は「20fps」としてタイムスタンプを刻みながら実際は
# 約14fpsしか送らないため、直接 pull すると録画の映像だけが実時間より
# 先に尽き、「途中から音声だけの動画」になる。
#
# 使い方:
#   1. config/relays.conf を作成（config/relays.conf.example 参照）
#   2. sources.toml の該当カメラを rtsp_url = "rtsp://localhost:8554/<パス名>"
#      の publish 形式へ変更（バックエンドが受け口パスを自動作成する）
#   3. ./scripts/camera-relay.sh start   # 全中継を起動（自動再接続つき）
#      ./scripts/camera-relay.sh stop
#
# 認証情報は .env の CAM_USERNAME / CAM_PASSWORD を使用する。
# =============================================================================

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$ROOT/.logs"
CONF="$ROOT/config/relays.conf"
mkdir -p "$LOG_DIR"

# .env から認証情報を読み込む
if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.env"
  set +a
fi

start_relays() {
  if [ ! -f "$CONF" ]; then
    echo "✗ $CONF がありません。config/relays.conf.example を参考に作成してください"
    exit 1
  fi
  # 形式: <パス名> <カメラIP> <カメラ側パス>   （# 行・空行は無視）
  grep -Ev '^\s*(#|$)' "$CONF" | while read -r name ip campath; do
    if pgrep -f "rtsp://localhost:8554/${name}\$" > /dev/null 2>&1; then
      echo "  ${name}: 既に起動中（スキップ）"
      continue
    fi
    src="rtsp://${CAM_USERNAME:-}:${CAM_PASSWORD:-}@${ip}${campath}"
    # 自動再接続ループ（カメラ再起動・ネットワーク断からの復帰）
    (
      while true; do
        ffmpeg -nostdin -rtsp_transport tcp \
          -use_wallclock_as_timestamps 1 \
          -i "$src" \
          -c copy \
          -f rtsp "rtsp://localhost:8554/${name}" \
          >> "$LOG_DIR/relay-${name}.log" 2>&1
        echo "$(date '+%F %T') relay ${name} 終了 → 3秒後に再接続" >> "$LOG_DIR/relay-${name}.log"
        sleep 3
      done
    ) &
    echo $! > "$LOG_DIR/relay-${name}.pid"
    echo "  ${name}: 中継開始 (${ip}${campath} → rtsp://localhost:8554/${name})"
  done || true  # 定義0件時の grep 終了コード1 を失敗扱いにしない
}

stop_relays() {
  for pidfile in "$LOG_DIR"/relay-*.pid; do
    [ -f "$pidfile" ] || continue
    name=$(basename "$pidfile" .pid)
    pid=$(cat "$pidfile")
    # 再接続ループごと止める（プロセスグループ）
    kill "$pid" 2>/dev/null && echo "  ${name} (PID $pid) 停止"
    rm -f "$pidfile"
  done
  pkill -f "rtsp://localhost:8554/.*" -x 2>/dev/null || true
  pkill -f "use_wallclock_as_timestamps" 2>/dev/null || true
  echo "✓ 中継停止"
}

case "${1:-start}" in
  start) echo "▶ カメラ中継起動中..."; start_relays ;;
  stop)  stop_relays ;;
  *) echo "使い方: $0 [start|stop]"; exit 1 ;;
esac
