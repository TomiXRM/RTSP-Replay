# ロボット監視・リプレイシステム

RTSP カメラ映像を複数 Pane で監視し、直近 2 時間を任意時刻から再生できる Web システム。
要件は [SPEC.md](./SPEC.md) を参照。

## アーキテクチャ

```
RTSPカメラ → MediaMTX（取り込み/HLS配信/録画/再生）→ FastAPI バックエンド → React フロントエンド
```

| レイヤ | 技術 | ディレクトリ | 担当 |
| --- | --- | --- | --- |
| フロントエンド | Vite + React 18 + TS, Tailwind, shadcn/ui, Zustand, HLS.js, MSW | `packages/frontend` | ClaudeDesign |
| バックエンド | Python + FastAPI, SQLite, httpx | `packages/backend` | Codex |
| 映像基盤 | MediaMTX (RTSP/HLS/録画/再生) | `docker-compose.yml`, `config/mediamtx.yml` | Codex |

### ディレクトリ構成

```
replay/
├── SPEC.md                         要件定義書
├── docker-compose.yml              MediaMTX + ffmpegテストソース
├── config/
│   ├── mediamtx.yml                MediaMTX設定（HLS/録画/リング削除）
│   └── sources.toml                常設カメラ（SPEC 7.1）
├── .env.example                    環境変数（認証情報）
├── recordings/                     録画先（gitignore）
├── packages/
│   ├── frontend/                   フロントエンド
│   │   ├── src/
│   │   │   ├── types/              SPEC 10/14/22/23章の型（手書き）
│   │   │   ├── api/client.ts       APIクライアント（エラー正規化）
│   │   │   ├── store/              Zustand: workspace, system
│   │   │   ├── hooks/              useLivePlayer, useReplayPlayer (HLS.js)
│   │   │   ├── features/           画面機能別（workspace/pane/add-pane/timeline/controls/incident/status）
│   │   │   ├── components/ui/      shadcn/ui プリミティブ
│   │   │   └── mocks/              MSWハンドラ（22章全API + 25章18状態）
│   │   └── tests/                  Vitest
│   └── backend/                    バックエンド
│       ├── app/
│       │   ├── main.py             FastAPI app（/api/v1, CORS, エラーハンドラ）
│       │   ├── errors.py           SPEC 23章 共通エラー形式
│       │   ├── models/             Pydanticスキーマ（22章）
│       │   ├── routers/            sources/live/recordings/playback/incidents/health
│       │   └── services/           toml_loader/source_store/mediamtx/rtsp_probe/recording_ranges/monitor/incident
│       └── tests/                  pytest
```

## クイックスタート

### 一番簡単: ローカルダミーカメラで試す（Docker 不要）

カメラがなくても、ffmpeg のテストパターン映像4本で録画・リプレイ・同期再生まで全部試せます。
**MediaMTX と ffmpeg のインストールが前提**（`brew install mediamtx ffmpeg` / Ubuntu は後述）。

```bash
./scripts/dev-mock.sh start
```

これだけで MediaMTX + ダミーカメラ4台 + バックエンド + フロントエンドが全て起動します。

1. http://localhost:5173 を開く
2. 「Paneを追加」→ 登録済みカメラから選んで「追加」
3. テストパターン映像が表示される（SMPTEカラーバー等）
4. タイムラインバーをクリック → 過去映像へリプレイ

停止: `./scripts/dev-mock.sh stop`

### Docker 版クイックスタート

#### 1. 映像基盤を起動（MediaMTX + ダミーカメラ3本）

```bash
docker compose up -d
```

ダミーカメラ3本が MediaMTX へ配信を開始します。
- RTSP取り込み: `rtsp://localhost:8554/cam1` `cam2` `cam3`
- HLS配信: http://localhost:8888/cam1/index.m3u8
- 管理API: http://localhost:9997

> 実機カメラを使う場合は `config/sources.toml` を編集してください（下記「設定」参照）。

#### 2. バックエンドを起動

```bash
cd packages/backend
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API仕様（Swagger UI）: http://localhost:8000/docs

### 3. フロントエンドを起動

```bash
cd packages/frontend
npm install
npm run dev
```

http://localhost:5173 を開きます。

### 4. モックでUIだけ確認したい場合（バックエンド不要）

```bash
cd packages/frontend
VITE_USE_MOCKS=true npm run dev
```

MSW がバックエンド API をモックします。SPEC 25章の各状態（接続失敗・録画停止・容量不足等）の確認も可能です。

## Docker を使わずに動かす（MediaMTX 単体バイナリ）

Docker が使えない環境では、MediaMTX を単体バイナリとしてインストールして動かせます。
3 プロセス（MediaMTX / バックエンド / フロントエンド）をそれぞれ独立したターミナルで起動します。

### 必要なもの

| ソフトウェア | 用途 | インストール方法 |
| --- | --- | --- |
| **MediaMTX** | RTSP中継 / HLS配信 / 録画 | 下記参照 |
| ffmpeg / ffprobe | RTSP接続テスト（FR-005） | 下記参照 |
| Python 3.11+ | バックエンド | 下記参照 |
| Node.js 20+ | フロントエンド | 下記参照 |

### インストール（macOS）

```bash
# MediaMTX
brew install mediamtx

# ffmpeg / ffprobe
brew install ffmpeg

# Python（システム Python が 3.11+ なら不要）
brew install python@3.14

# Node.js（mise / nodenv / 公式インストーラ 等）
# 既にインストール済みなら不要
```

### インストール（Ubuntu）

```bash
# MediaMTX（バイナリを直接ダウンロード）
# 最新版は https://github.com/bluenviron/mediamtx/releases で確認
ARCH=$(dpkg --print-architecture)  # amd64 または arm64
MTX_VER=1.19.2
curl -L "https://github.com/bluenviron/mediamtx/releases/download/v${MTX_VER}/mediamtx_v${MTX_VER}_linux_${ARCH}.tar.gz" \
  -o /tmp/mediamtx.tar.gz
sudo tar -xzf /tmp/mediamtx.tar.gz -C /usr/local/bin mediamtx
sudo chmod +x /usr/local/bin/mediamtx
mediamtx --version  # 確認

# ffmpeg / ffprobe
sudo apt update
sudo apt install -y ffmpeg

# Python 3.11+
sudo apt install -y python3 python3-venv python3-pip

# Node.js 20+（NodeSource 経由）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

> MediaMTX のバイナリは GitHub Releases から各OS/アーキテクチャ向けが配布されています。
> `mediamtx_darwin_arm64.tar.gz`（Mac Apple Silicon）、`mediamtx_darwin_amd64.tar.gz`（Mac Intel）、
> `mediamtx_linux_amd64.tar.gz` / `mediamtx_linux_arm64.tar.gz`（Linux）から選択してください。

### 初回セットアップ

```bash
# バックエンド依存関係
cd packages/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
deactivate
cd ../..

# フロントエンド依存関係
cd packages/frontend
npm install
cd ../..

# 認証情報（.env を作成。Git 管理外）
cp .env.example .env
# .env にカメラの認証情報を記載
```

### 起動（3つのターミナル）

設定ファイル（`config/mediamtx.yml` / `config/sources.toml` / `.env`）は Docker 版と共通です。

**ターミナル1 — MediaMTX**

```bash
cd /path/to/replay
mediamtx config/mediamtx.yml
```

起動確認:
- HLS: http://localhost:8888
- 管理API: http://localhost:9997

**ターミナル2 — バックエンド**

```bash
cd packages/backend
.venv/bin/python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

起動確認:
- API: http://localhost:8000/api/v1/sources に4ソース表示
- Swagger UI: http://localhost:8000/docs

> 録画先・DB・事故保存先は、環境変数未設定時にプロジェクト内の
> `recordings/` `data/` を自動使用します（Docker 不要版の推奨）。
> Docker 版を使う時だけ `.env` で `/recordings` `/data/...` へ上書きします。

**ターミナル3 — フロントエンド**

```bash
cd packages/frontend
npm run dev
```

http://localhost:5173 を開きます。Pane を追加すると、カメラの LIVE 映像が表示されます。

### 停止

各ターミナルで `Ctrl+C` を押してください。録画ファイル（`recordings/`）と DB（`data/`）は残ります。

### Docker 版との違い

| 項目 | Docker 版 | 単体バイナリ版 |
| --- | --- | --- |
| MediaMTX 起動 | `docker compose up -d mediamtx` | `mediamtx config/mediamtx.yml` |
| ダミーカメラ | `docker compose --profile mock up` | 別途 ffmpeg で配信（下記） |
| 録画先 | Docker ボリューム | プロセスのファイルシステム（相対パス） |
| 設定ファイル | 共通（`config/`） | 共通 |

### ダミーカメラでテストしたい場合（実機カメラがない時）

Docker 版の `testsrc` の代わりに、ffmpeg でテストパターンを配信できます。
MediaMTX 起動後に別ターミナルで:

```bash
# カメラ1（SMPTExカラーバー + タイムスタンプ）
ffmpeg -re -stream_loop -1 \
  -i smptebars=size=1280x720:rate=15 \
  -vf "drawtext=text='%{localtime}':x=10:y=10:fontsize=48:fontcolor=white:box=1:boxcolor=black@0.5" \
  -c:v libx264 -preset veryfast -tune zerolatency -pix_fmt yuv420p -g 30 -an \
  -f rtsp rtsp://localhost:8554/cam1
```

この場合 `config/sources.toml` は上記の `rtsp://localhost:8554/cam1` を指すように編集してください。

## トラブルシューティング

### カメラの状態がずっと CONNECTING / 画像が出ない

MediaMTX が RTSP カメラへ接続できていません。以下を確認してください。

**1. カメラネットワークへの到達性**

```bash
# カメラへ ping
ping 172.16.0.140

# RTSP 接続テスト（ffprobe）
ffprobe -v error -rtsp_transport tcp -rw_timeout 5000000 \
  -show_entries stream=codec_name,width,height \
  "rtsp://USER:PASS@172.16.0.140/live"
```

ping が通らない場合、カメラと同じネットワークに接続していません。
VPN の接続状態、Wi-Fi のネットワーク、ルーティングを確認してください。

**2. MediaMTX のログ確認**

```bash
# Docker 版
docker compose logs mediamtx --tail 20

# 単体バイナリ版
# 起動したターミナルのログを確認
```

よくあるエラー:
- `i/o timeout` → ネットワーク到達不可（上記 1 を確認）
- `401 Unauthorized` → `.env` の認証情報（`CAM_USERNAME`/`CAM_PASSWORD`）が未設定か誤り
- `no stream is available` → パスは登録されたがカメラから映像が来ていない

**3. 認証情報の確認**

`.env` にカメラの認証情報が正しく設定されているか確認:

```bash
cat .env  # CAM_USERNAME / CAM_PASSWORD の値を確認
```

`config/sources.toml` の `username_env` / `password_env` が `.env` の変数名と一致しているか確認してください。

### 前端で 404 エラーが出る（古いソース ID へのアクセス）

`GET /api/v1/sources/conveyor/recordings/ranges HTTP/1.1 404` のようなエラーが出る場合、
ブラウザの localStorage に古い workspace 状態（別のソース ID）が残っています。
フロントは起動時に存在しないソースの Pane を自動クリーンアップしますが、
完全にリセットしたい場合は:

```bash
# ブラウザの DevTools → Application → Local Storage → http://localhost:5173
# "replay-workspace" を削除してリロード
```

### REPLAY（過去映像）が始まらない / すぐ止まる

- 録画はモック環境の起動後から蓄積されます。起動直後は数分待ってから
  タイムラインの緑（録画あり）区間をクリックしてください。
- REPLAY は MediaMTX playback（9996）から **最大300秒の MP4** を取得します。
  直近の時刻（例: 1分前）から再生すると、録画済み分（末尾＝ほぼ現在まで）を
  再生し終えた時点で自動的に一時停止します（自動で LIVE には切り替わりません。
  ▶ で先頭から再再生、または「ライブへ戻る」を使用）。
- 赤斜線（録画欠損）区間をクリックすると `RECORDING_NOT_AVAILABLE` エラー表示に
  なります。これは正常な挙動です。

### モック環境での正常な表示

- タイムラインの大部分が赤斜線になるのは、`dev-mock.sh start` 以前の時間帯に
  録画が存在しないためです（異常ではありません）。
- タイムライン右端（LIVE 位置直前）に細い赤斜線が出るのは、録画範囲情報が
  数秒遅れて更新されるためです。

### Read-only file system エラーで起動しない

```
OSError: [Errno 30] Read-only file system: '/data'
```

バックエンドが Docker 用のパス（`/data`）へ書き込もうとしています。
環境変数未設定時は自動的にプロジェクト内 `data/` を使いますが、
`.env` に古い `DATABASE_PATH=/data/replay.db` が残っている場合は削除してください。

## 設定

### 映像ソース（常設カメラ）— SPEC 7.1

`config/sources.toml` を編集します。

```toml
# 形式1: 直接URL
[[sources]]
id = "robot-overview"
name = "ロボット全体"
rtsp_url = "rtsp://192.168.1.20:554/main"
enabled = true

# 形式2: 認証情報を環境変数で参照（推奨）
[[sources]]
id = "robot-overview"
name = "ロボット全体"
host = "192.168.1.20"
path = "/main"
username_env = "ROBOT_CAMERA_USERNAME"
password_env = "ROBOT_CAMERA_PASSWORD"
enabled = true
```

> UIから追加した映像ソースは TOML を書き換えず、SQLite（動的設定ストア）へ保存されます（SPEC 7.2）。

### 環境変数

`.env.example` を `.env` へコピーして編集します。

| 変数 | 既定値 | 説明 |
| --- | --- | --- |
| `MEDIAMTX_API` | `http://localhost:9997` | MediaMTX 管理API |
| `RECORDINGS_DIR` | `/recordings` | 録画保存先 |
| `RECORDING_RETENTION_HOURS` | `2` | 直近保持時間（SPEC FR-015） |
| `RECORDING_SEGMENT_SECONDS` | `60` | 録画セグメント長 |
| `INCIDENTS_DIR` | `/data/incidents` | 事故映像保存先（リング保護） |
| `DATABASE_PATH` | `/data/replay.db` | 動的ソース・事故メタデータ |
| `*_CAMERA_USERNAME/PASSWORD` | - | カメラ認証情報（環境変数経由） |

## 開発フロー（分担）

### ClaudeDesign（フロントエンド）

`packages/frontend/src/features/` 以下の画面コンポーネントをデザイン・実装します。

- **置き換え対象**: `features/` 配下のコンポーネント（Pane, AddPaneDialog, Timeline, CommonControls, IncidentDialog, StatusBar, WorkspaceShell）
- **前提（既存）**: 型（`types/`）・状態（`store/`）・APIクライアント（`api/client.ts`）・HLS.jsフック（`hooks/`）・MSWモック（`mocks/`）は実装済み。これらを利用してください
- **状態設計**: SPEC 10章の `PaneState`（真偽値の組み合わせで状態を推測しない）と 14章の `WorkspaceState` に従う
- **状態バリエーション**: SPEC 25章の18状態（正常系だけでなく接続失敗・録画停止・容量不足・API停止等）を作成すること

### Codex（バックエンド）

`packages/backend/app/` 以下のサービス・ルータを実装します。

- **API**: SPEC 22章の9エンドポイント。22.5/22.7は MediaMTX の相対URLを生成（フロントがMediaMTX固有URLを組まない）
- **エラー**: SPEC 23章 共通形式（`errors.py`）
- **MediaMTX**: 独自の配信基盤を作らず MediaMTX へ任せる（SPEC 26章）

## テスト

```bash
# バックエンド
cd packages/backend && .venv/bin/python -m pytest

# フロントエンド
cd packages/frontend && npm test
```

## 完了条件マップ（SPEC 28章）

| # | 完了条件 | 状態 | 実装箇所 |
| --- | --- | --- | --- |
| 1 | TOML登録済みカメラをPaneへ追加 | ✅ 足場 | `toml_loader.py`, `AddPaneDialog` 登録済みタブ |
| 2 | RTSP URLを直接入力してPaneへ追加 | ✅ 足場 | `AddPaneDialog` URLタブ |
| 3 | RTSP接続テスト | ✅ 足場 | `rtsp_probe.py` (ffprobe), FR-005 |
| 4 | 1〜6 Paneを同時表示 | ✅ | `WorkspaceShell`（9章レイアウト） |
| 5 | PaneごとにLIVE/REPLAY | ✅ | `PaneVideo`, `useLivePlayer/useReplayPlayer` |
| 6 | 同一ソースを複数Paneへ追加 | ✅ | `addPane`（sourceId 重複許可） |
| 7 | 複数REPLAY Paneを同期 | ✅ | `applySyncedOperation`, `CommonControls` |
| 8 | 直近2時間を録画 | ✅ 足場 | `mediamtx.yml` (recordDeleteAfter: 2h) |
| 9 | 任意の録画時刻から再生 | ✅ 足場 | `playback.py`, `useReplayPlayer` |
| 10 | 録画欠損を表示 | ✅ | `recording_ranges.py`, `Timeline` |
| 11 | 事故映像を自動削除対象外へ保存 | ✅ 足場 | `incident.py`（独立MP4）, `IncidentDialog` |
| 12 | カメラ切断を検知 | ✅ 足場 | `monitor.py`（5s/15sしきい値） |
| 13 | 録画停止を検知 | ✅ 足場 | `monitor.py` |
| 14 | ディスク容量不足を検知 | ✅ 足場 | `monitor.py`（80%/90%） |
| 15 | プロセス再起動後に自動復旧 | ✅ 足場 | `main.py` lifespan, 一時ソース破棄 |
| 16 | 異常系テスト | ✅ 一部 | pytest + MSW errorScenarios（網羅は次フェーズ） |
| 17 | READMEへセットアップ手順 | ✅ | 本ファイル |

> ✅ 足場 = 基盤実装済み、実機での長期検証・網羅的異常系テストは次フェーズ。

## セキュリティ（SPEC NFR-003）

- RTSP URL / 認証情報をフロントへ返さない（`sources.py` レスポンスに URL を含めない）
- 認証情報を Git へコミットしない（`.env` は gitignore、TOMLは環境変数参照）
- 認証情報をログへ出力しない
- RTSP URL をブラウザ URL / localStorage へ保存しない（`api/client.ts` で保持しない、`workspace.ts` persist で URL を含めない）
- API は原則 LAN 内のみで公開

## 時刻（SPEC NFR-005）

- 内部時刻は UTC（API・DB・録画ファイル名）
- ユーザー表示は Asia/Tokyo（`lib/utils.ts` の `formatTimeJST` / `formatDateTimeJST`）
