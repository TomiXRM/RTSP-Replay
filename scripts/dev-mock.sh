#!/usr/bin/env bash
# =============================================================================
# ローカルダミーカメラ環境の起動スクリプト
# =============================================================================
# MediaMTX + ffmpeg（ダミーカメラ4台）+ バックエンド + フロントエンドを起動。
# カメラがなくてもローカルで映像表示・録画・リプレイを試せる。
#
# 使い方:
#   ./scripts/dev-mock.sh          # 全起動
#   ./scripts/dev-mock.sh stop     # 全停止
#
# 前提: mediamtx, ffmpeg がインストール済み（brew install mediamtx ffmpeg）
# =============================================================================

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$ROOT/.logs"
mkdir -p "$LOG_DIR"

# --- sources.toml をモック版へ差し替え ---
setup_mock_sources() {
  if [ ! -f "$ROOT/config/sources.real.toml" ] && [ -f "$ROOT/config/sources.toml" ]; then
    # 現在の実機版をバックアップ
    cp "$ROOT/config/sources.toml" "$ROOT/config/sources.real.toml"
    echo "✓ 実機版 sources.toml を sources.real.toml へバックアップ"
  fi
  cp "$ROOT/config/sources.mock.toml" "$ROOT/config/sources.toml"
  echo "✓ sources.toml をモック版へ切替"
}

start_mediamtx() {
  if pgrep -f "mediamtx" > /dev/null 2>&1; then
    echo "⚠ MediaMTX は既に起動中です（スキップ）"
    return
  fi
  echo "▶ MediaMTX 起動中..."
  cd "$ROOT"
  mediamtx config/mediamtx.yml > "$LOG_DIR/mediamtx.log" 2>&1 &
  echo $! > "$LOG_DIR/mediamtx.pid"
  sleep 3
  # API確認
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:9997/v3/paths/list | grep -q 200; then
    echo "✓ MediaMTX 起動完了 (API: 9997, HLS: 8888, RTSP: 8554)"
  else
    echo "✗ MediaMTX の起動に失敗しました。$LOG_DIR/mediamtx.log を確認してください"
    exit 1
  fi
}

start_dummy_cameras() {
  echo "▶ ダミーカメラ（ffmpeg ×4）起動中..."
  for i in 1 2 3 4; do
    if pgrep -f "rtsp://localhost:8554/cam-0${i}" > /dev/null 2>&1; then
      echo "  cam-0${i}: 既に起動中（スキップ）"
      continue
    fi
    # 各カメラごとに異なる「動きのある」テストパターン
    # 1: ライフゲーム（セル増殖） 2: カウンタ付きパターン
    # 3: アニメーションパターン   4: マンデルブロズーム
    case $i in
      1) SRC="life=size=1280x720:rate=15:mold=10:life_color=#c9ff05:death_color=#0a1020" ;;
      2) SRC="testsrc=size=1280x720:rate=15" ;;
      3) SRC="testsrc2=size=1280x720:rate=15" ;;
      4) SRC="mandelbrot=size=1280x720:rate=15" ;;
    esac
    ffmpeg -re -stream_loop -1 \
      -f lavfi \
      -i "$SRC" \
      -c:v libx264 -preset veryfast -tune zerolatency -pix_fmt yuv420p -g 30 -an \
      -f rtsp "rtsp://localhost:8554/cam-0${i}" \
      > "$LOG_DIR/cam${i}.log" 2>&1 &
    echo $! > "$LOG_DIR/cam${i}.pid"
    echo "  cam-0${i}: 起動完了 (rtsp://localhost:8554/cam-0${i})"
  done
  sleep 2
}

start_backend() {
  if pgrep -f "uvicorn app.main:app" > /dev/null 2>&1; then
    echo "⚠ バックエンドは既に起動中です（スキップ）"
    return
  fi
  echo "▶ バックエンド起動中..."
  cd "$ROOT/packages/backend"
  .venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 > "$LOG_DIR/backend.log" 2>&1 &
  echo $! > "$LOG_DIR/backend.pid"
  sleep 4
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/v1/health | grep -q 200; then
    echo "✓ バックエンド起動完了 (http://localhost:8000)"
  else
    echo "✗ バックエンドの起動に失敗しました。$LOG_DIR/backend.log を確認してください"
    exit 1
  fi
}

start_frontend() {
  if pgrep -f "vite" > /dev/null 2>&1; then
    echo "⚠ フロントエンドは既に起動中です（スキップ）"
    return
  fi
  echo "▶ フロントエンド起動中..."
  cd "$ROOT/packages/frontend"
  npm run dev > "$LOG_DIR/frontend.log" 2>&1 &
  echo $! > "$LOG_DIR/frontend.pid"
  sleep 3
  echo "✓ フロントエンド起動完了 (http://localhost:5173)"
}

stop_all() {
  echo "▶ 停止中..."
  for name in frontend backend cam4 cam3 cam2 cam1 mediamtx; do
    pidfile="$LOG_DIR/${name}.pid"
    if [ -f "$pidfile" ]; then
      pid=$(cat "$pidfile")
      if kill "$pid" 2>/dev/null; then
        echo "  $name (PID $pid) 停止"
      fi
      rm -f "$pidfile"
    fi
  done
  # 念のためプロセス名でもkill
  pkill -f "rtsp://localhost:8554/cam-0" 2>/dev/null || true
  echo "✓ 停止完了"
}

# --- メイン ---
case "${1:-start}" in
  start)
    echo "============================================"
    echo "  ローカルダミーカメラ環境を起動します"
    echo "============================================"
    setup_mock_sources
    start_mediamtx
    start_backend
    start_dummy_cameras
    start_frontend
    echo ""
    echo "============================================"
    echo "  ✅ 起動完了"
    echo "============================================"
    echo ""
    echo "  ブラウザで開く: http://localhost:5173"
    echo "  Paneを追加 → ダミーカメラの映像が表示されます"
    echo "  ログ: $LOG_DIR/"
    echo "  停止: ./scripts/dev-mock.sh stop"
    echo ""
    ;;
  stop)
    stop_all
    ;;
  *)
    echo "使い方: $0 [start|stop]"
    exit 1
    ;;
esac
