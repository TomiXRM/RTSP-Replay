---
name: verify
description: この repo の変更をモック環境で実機検証する手順（起動・操作・観測ポイント）
---

# Verify: replay monitor (mock environment)

## 起動

```bash
./scripts/dev-mock.sh start   # MediaMTX + ffmpeg ダミーカメラ4台 + backend + frontend
# 冪等: 起動済みプロセスはスキップされる。停止は stop。
```

- UI: http://localhost:5173 / API: :8000 / HLS: :8888 / Playback(MP4): :9996 / MediaMTX API: :9997
- 録画は起動後から蓄積。REPLAY 検証は起動後 2 分待つ。
- 録画範囲の確認: `curl -s localhost:8000/api/v1/sources/cam-02/recordings/ranges`

## 検証のコツ

- **cam-02（testsrc）を使う**: 画面中央に毎秒インクリメントするカウンタが出るため、
  「本当に過去映像か」「シーク量」「一時停止」「再生速度」が目視で検証できる。
  cam-01/04 は静止パターン（SMPTE bars）なので LIVE と REPLAY の区別がつかない。
- Pane の実状態は video 要素で観測する:
  - LIVE 正常 = `currentSrc` が `blob:`（hls.js/MSE）で `readyState=4`
  - REPLAY 正常 = `currentSrc` が `:9996/get?path=...&start=...+09:00&duration=300`
  - ヘッダー文言: 受信中 / 接続中 / 再接続中 / エラー / `❚❚ -m:ss`（REPLAY 一時停止）
- workspace 状態は localStorage `replay-workspace` に永続化される。
  クリーンな状態から始めるには `localStorage.removeItem('replay-workspace'); location.reload()`
  を **同一実行内で**行う（removeItem だけだと store が再保存する）。
- persist は playerState を INITIALIZING に正規化するので、localStorage から
  実行中の playerState は読めない。ヘッダー文言か video 要素を見る。

## 既知の正常挙動（バグと誤認しやすい）

- REPLAY は最大 300 秒の MP4。末尾（≒現在時刻）到達で ended → PAUSED 表示。ended 後の ▶ は同ウィンドウ先頭から。
- タイムラインの起動前時間帯は赤斜線（録画欠損）で正しい。LIVE 直前にも数秒の赤斜線が常に出る（録画範囲の更新遅延）。
- 録画欠損クリック → `RECORDING_NOT_AVAILABLE` の ERROR 画面が仕様。
- 接続テストなしで URL 追加は不可（テスト成功が追加ボタンの前提）。

## 落とし穴

- **Vite HMR がフック数変更で Pane をクラッシュさせる**: hooks を編集したら必ず
  フルリロードしてから判定する。HMR 直後の ERROR 表示は偽陽性のことがある。
- この環境のブラウザは `canPlayType('application/vnd.apple.mpegurl')` が "maybe" を
  返す Chromium。useLivePlayer は hls.js 優先（ネイティブHLSはフォールバック）を維持すること。
- ダミーカメラ4本の RTSP URL は全て sources.toml 登録済み → URL 追加の成功パスは
  この環境では踏めない（重複 409 になる）。エラー表示の検証には使える。
