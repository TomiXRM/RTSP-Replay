"""アプリケーション設定。

環境変数（.env 含む）から読み込む。優先順位: 環境変数 > .env > 既定値。
SPEC 7.1, 24章(NFR), FR-014〜016 関連。
"""

from __future__ import annotations

import os
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# プロジェクトルート（backend パッケージの2階層上）
PROJECT_ROOT = Path(__file__).resolve().parents[3]

# .env を os.environ へ展開する。
# pydantic-settings は Settings フィールドのみ読み込むが、TOML の
# username_env/password_env（SPEC 7.1）は任意の環境変数名を動的参照するため、
# os.environ から取得できる必要がある。.env の値で既存環境変数を上書きしない。
_ENV_FILE = PROJECT_ROOT / ".env"
if _ENV_FILE.exists():
    for _line in _ENV_FILE.read_text(encoding="utf-8").splitlines():
        _line = _line.strip()
        if not _line or _line.startswith("#") or "=" not in _line:
            continue
        _k, _v = _line.split("=", 1)
        _k = _k.strip()
        _v = _v.strip().strip('"').strip("'")
        if _k and _k not in os.environ:
            os.environ[_k] = _v


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(PROJECT_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # MediaMTX
    mediamtx_api: str = "http://localhost:9997"
    mediamtx_hls_base: str = "http://localhost:8888"
    mediamtx_playback_base: str = "http://localhost:9996"

    # 録画（デフォルトはプロジェクトルート基準。Docker時は .env で /recordings へ上書き）
    recordings_dir: str = str(PROJECT_ROOT / "recordings")
    recording_retention_hours: float = 2
    recording_segment_seconds: int = 60

    # 事故保存
    incidents_dir: str = str(PROJECT_ROOT / "data" / "incidents")

    # DB
    database_path: str = str(PROJECT_ROOT / "data" / "replay.db")

    # サーバ
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: str = ""

    # イベント受信UDPポート（0で無効）。ブロードキャスト宛も受信できる。
    event_udp_port: int = 8600

    # TOML 設定ファイルパス（プロジェクトルート基準）
    sources_toml_path: str = str(PROJECT_ROOT / "config" / "sources.toml")

    # テスト用: 外部コマンド依存を無効化する
    enable_rtsp_probe: bool = True
    enable_mediamtx_control: bool = True

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def db_path(self) -> Path:
        p = Path(self.database_path)
        p.parent.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def incidents_path(self) -> Path:
        p = Path(self.incidents_dir)
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def recordings_path(self) -> Path:
        p = Path(self.recordings_dir)
        return p


settings = Settings()
