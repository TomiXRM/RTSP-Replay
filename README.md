# ロボット監視・リプレイシステム

RTSP カメラの映像を最大 8 画面（Pane）で同時監視し、録画された直近の映像を任意の時刻から再生（リプレイ）できる Web システムです。

![main](docs/assets/main.png "main")

![デモ](docs/assets/demo.gif "リプレイ・同期再生のデモ")


## 主な機能

- **ライブ監視** — RTSP カメラを最大 8 Pane で同時表示（LIVE は赤バッジ）
- **リプレイ** — タイムラインのクリック / ドラッグ、または ◀◀ ◀ ▶ ▶▶ ボタンで過去映像へ移動（REPLAY は青枠＋青バッジ）。再生速度 0.5〜4×
- **同期再生** — SYNCED モードで複数 Pane を同一時刻に揃えて一括シーク・再生・停止
- **イベントマーカー** — HTTP / UDP / ROS 2 から記録したイベントをタイムラインに ▲ 表示（入力方法は画面上部の「イベント」タブに記載）
- **事故映像保存** — 基準時刻の前後 5 分（計 10 分）を自動削除の対象外として保存
- **異常検知** — カメラ切断・録画停止・ディスク容量をトップバーに常時表示
- **Web からの設定変更** — カメラ定義（sources.toml）と認証情報（.env）をトップバーの ⚙ ボタンから編集。保存すると再起動なしで反映

## 構成

```
RTSPカメラ → MediaMTX（取り込み / HLS配信 / 録画 / 再生）→ FastAPI バックエンド → React フロントエンド
```

| ポート | 用途 |
| --- | --- |
| 5173 | Web UI（Vite） |
| 8000 | バックエンド API（Swagger UI: /docs） |
| 8888 | HLS 配信（ライブ映像） |
| 9996 | 過去映像再生（MP4） |
| 9997 | MediaMTX 管理 API |
| 8554 | RTSP 取り込み |
| 8600/udp | イベント受信 |

録画は直近 N 時間（既定 2 時間、`.env` の `RECORDING_RETENTION_HOURS` で変更可）をリング保持し、古いものから自動削除されます。

## 動かし方

### 必要なもの

| ソフトウェア | 用途 |
| --- | --- |
| MediaMTX | RTSP 中継 / HLS 配信 / 録画 |
| ffmpeg / ffprobe | 接続テスト・ダミーカメラ |
| Python 3.11+ | バックエンド |
| Node.js 20+ | フロントエンド |

**macOS**

```bash
brew install mediamtx ffmpeg
```

**Ubuntu**

```bash
# MediaMTX（最新版: https://github.com/bluenviron/mediamtx/releases）
ARCH=$(dpkg --print-architecture)
MTX_VER=1.19.2
curl -L "https://github.com/bluenviron/mediamtx/releases/download/v${MTX_VER}/mediamtx_v${MTX_VER}_linux_${ARCH}.tar.gz" -o /tmp/mediamtx.tar.gz
sudo tar -xzf /tmp/mediamtx.tar.gz -C /usr/local/bin mediamtx
sudo chmod +x /usr/local/bin/mediamtx

sudo apt install -y ffmpeg python3 python3-venv nodejs npm
```

### 初回セットアップ

```bash
# バックエンド
cd packages/backend
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
cd ../..

# フロントエンド
cd packages/frontend
npm install
cd ../..

# 認証情報（Git 管理外）
cp .env.example .env
```

### 一番簡単: ダミーカメラで全機能を試す

カメラがなくても、ffmpeg のテストパターン映像 4 本で録画・リプレイ・同期再生まで全部試せます。

```bash
./scripts/dev-mock.sh start
```

MediaMTX + ダミーカメラ 4 台 + バックエンド + フロントエンドがまとめて起動します。

1. http://localhost:5173 を開く
2. 「Paneを追加」→ 登録済みカメラから選んで「追加」
3. テストパターン映像が表示される
4. 数分待って録画が溜まったら、タイムラインの緑区間をクリック → リプレイ

停止: `./scripts/dev-mock.sh stop`

> ダミー起動時は `config/sources.toml` がモック版に差し替えられます（実機版は `sources.real.toml` へ自動バックアップ）。

### 実機カメラで動かす（3 プロセスを個別起動）

`config/sources.toml` にカメラを登録した上で、3 つのターミナルで起動します。

```bash
# ターミナル1 — MediaMTX
mediamtx config/mediamtx.yml

# ターミナル2 — バックエンド
cd packages/backend
.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000

# ターミナル3 — フロントエンド
cd packages/frontend
npm run dev
```

http://localhost:5173 を開き、Pane を追加するとライブ映像が表示されます。
停止は各ターミナルで `Ctrl+C`（録画 `recordings/` と DB `data/` は残ります）。

### Docker 版（MediaMTX + ダミーカメラ）

```bash
docker compose up -d          # MediaMTX + ダミーカメラ
# バックエンド・フロントエンドは上記と同じ手順で起動
```

## カメラの登録

Web UI のトップバー **⚙ ボタン → sources.toml タブ**から編集できます（ファイル直接編集でも可）。保存すると再起動なしで反映されます。

```toml
# 形式1: URL 直接指定
[[sources]]
id = "robot-overview"
name = "ロボット全体"
rtsp_url = "rtsp://192.168.1.20:554/main"
enabled = true

# 形式2: 認証情報を .env の環境変数で参照（推奨。パスワードが設定画面に出ない）
[[sources]]
id = "robot-overview"
name = "ロボット全体"
host = "192.168.1.20"
port = 554
path = "/main"
username_env = "CAM_USERNAME"
password_env = "CAM_PASSWORD"
enabled = true
```

認証情報は **⚙ ボタン → .env タブ**（または `.env` ファイル）で設定します：

```bash
CAM_USERNAME=ユーザー名
CAM_PASSWORD=パスワード
```

> **注意**: 認証が必要なカメラを形式1（`rtsp_url` 直書き）で登録する場合は
> `rtsp://ユーザー名:パスワード@192.168.1.20:554/main` のように URL 内へ含める必要があります。
> URL に認証を書き忘れると、MediaMTX 側で `401 (Unauthorized)` になり映像が永遠に出ません。
> 実カメラは形式2（`username_env` / `password_env`）を使うのが安全です（書き忘れが起きず、
> パスワードが設定画面や Git に露出しません）。

### 例: AtomCam2（atomcam_tools 導入済み）を登録する

AtomCam2 の RTSP 配信は、ユーザー名 `6199`・パスワード `4003`・パス `/live` が公式の既定値です。

```toml
[[sources]]
id = "atomcam-01"
name = "AtomCam2（作業エリア）"
host = "192.168.1.30"    # カメラのIPアドレスに置き換える
port = 554
path = "/live"
username_env = "CAM_USERNAME"
password_env = "CAM_PASSWORD"
enabled = true
```

```bash
# .env（AtomCam2 の既定値）
CAM_USERNAME=6199
CAM_PASSWORD=4003
```

複数台ある場合は `[[sources]]` ブロックを IP を変えて並べるだけです（認証は全台で同じ `.env` を参照）。
`id` はこのシステム内での配信・録画の名前で、カメラ側のパス `/live` と一致させる必要はありません。

> **AtomCam2 のタイムスタンプ問題（重要）**: AtomCam2 は映像を「20fps」として
> タイムスタンプを刻みながら実際は約14fpsしか送らないため、上記の直接取り込みでは
> 録画・保存した動画が「途中から映像が消えて音声だけになる」症状が出ます。
> 対策として、ffmpeg で受信時刻ベースにタイムスタンプを打ち直して中継する
> スクリプトを用意しています（再エンコード無し・カメラ1台あたり ffmpeg 1プロセス）:
>
> ```bash
> cp config/relays.conf.example config/relays.conf   # カメラのIP・パス名を記載
> ./scripts/camera-relay.sh start                     # 中継開始（自動再接続つき）
> ```
>
> この場合 sources.toml の該当カメラは中継の受け口を指す publish 形式にします:
>
> ```toml
> [[sources]]
> id = "sm-01"
> name = "AtomCam2（作業エリア）"
> rtsp_url = "rtsp://localhost:8554/sm-01"   # relays.conf のパス名と一致させる
> enabled = true
> ```

一時的なカメラは「Paneを追加 → URLを入力」からも追加できます（TOML は変更されず、SQLite に保存）。

## 主な設定（.env）

| 変数 | 既定値 | 説明 |
| --- | --- | --- |
| `CAM_USERNAME` / `CAM_PASSWORD` | - | カメラ認証情報（TOML の `username_env` / `password_env` が参照） |
| `RECORDING_RETENTION_HOURS` | `2` | 録画保持時間。タイムライン表示幅・シーク範囲も連動。⚙ から保存すると即時反映 |
| `EVENT_UDP_PORT` | `8600` | イベント受信 UDP ポート（0 で無効） |
| `MEDIAMTX_API` | `http://localhost:9997` | MediaMTX 管理 API |
| `RECORDINGS_DIR` | `recordings/` | 録画保存先（Docker 時は `/recordings` へ上書き） |
| `DATABASE_PATH` | `data/replay.db` | 動的ソース・事故・イベントの保存先 |

認証情報と保持時間は ⚙ ダイアログからの保存で即時反映されます。それ以外（ポート等）はバックエンド再起動が必要です。

### ポートを変更するには

ブラウザは Web UI（5173）としか通信しません（映像も `/streams` `/playback` として UI 経由でプロキシされます）。そのためポートの定義は次の 2 ファイルで完結します：

1. **`config/mediamtx.yml`** — MediaMTX の待受ポート（`rtspAddress` / `hlsAddress` / `playbackAddress` / `apiAddress`）
2. **`.env`** — それを参照する URL（`MEDIAMTX_API` / `MEDIAMTX_HLS_BASE` / `MEDIAMTX_PLAYBACK_BASE`）と `API_PORT` / `UI_PORT` / `EVENT_UDP_PORT`

両者を揃えて変更し、各プロセスを再起動してください。フロントエンドのコード変更・再ビルドは不要です。

## トラブルシューティング

### カメラがずっと CONNECTING / 映像が出ない

MediaMTX がカメラへ接続できていません。

```bash
# 1. カメラへの到達性
ping 192.168.1.20

# 2. RTSP 接続テスト
ffprobe -v error -rtsp_transport tcp -rw_timeout 5000000 \
  -show_entries stream=codec_name,width,height \
  "rtsp://USER:PASS@192.168.1.20/main"

# 3. MediaMTX のログ
docker compose logs mediamtx --tail 20   # Docker 版
# 単体バイナリ版は起動したターミナルのログを確認
```

よくあるエラー:

- `i/o timeout` → ネットワーク到達不可。VPN・Wi-Fi・ルーティングを確認
- `401 Unauthorized` → `.env` の認証情報が未設定か誤り。⚙ → .env タブで確認
- `no stream is available` → パスは登録されたがカメラから映像が来ていない

「Paneを追加 → URLを入力 → 接続テスト」でも UI から疎通確認できます。

### REPLAY（過去映像）が始まらない / すぐ止まる

- 録画は起動後から蓄積されます。起動直後は数分待ってから、タイムラインの緑（録画あり）区間をクリックしてください。
- リプレイは最大 300 秒の MP4 を取得します。直近の時刻から再生すると、録画済み分（≒現在時刻）まで再生し終えた時点で自動的に一時停止します（▶ で先頭から再再生、または「ライブへ戻る」）。
- 赤斜線（録画欠損）区間をクリックすると「録画を取得できません」表示になります。これは正常な挙動です。

### タイムラインの見え方

- 起動前の時間帯が赤斜線（録画欠損）になるのは正常です。
- 右端（LIVE 直前）の細い赤斜線は、録画範囲情報が数秒遅れて更新されるためです。

### 古いソース ID の 404 エラーが出る

ブラウザの localStorage に古い状態が残っています。存在しない Pane は起動時に自動削除されますが、完全にリセットする場合は DevTools → Application → Local Storage → `replay-workspace` を削除してリロードしてください。

### Read-only file system エラーで起動しない

バックエンドが Docker 用パス（`/data`）へ書き込もうとしています。`.env` に古い `DATABASE_PATH=/data/replay.db` が残っていれば削除してください（未設定ならプロジェクト内 `data/` を自動使用します）。

## 補足

- **時刻**: 内部（API・DB・録画ファイル名）は UTC、画面表示は日本時間（JST）です。
- **セキュリティ**: LAN 内での利用を前提としています。RTSP URL・認証情報はフロントエンドの API レスポンス・localStorage・ログへ出力されません。ただし ⚙ の .env タブにはパスワードが表示されるため、画面共有中の操作には注意してください。
