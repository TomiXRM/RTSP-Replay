"""FastAPI アプリケーション（SPEC 22章, 23章）。

API基底パス: /api/v1
CORS: LAN内許可（SPEC NFR-003）
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import settings
from .db import init_db
from .errors import (
    AppError,
    app_error_handler,
    http_exception_handler,
    unhandled_exception_handler,
    validation_exception_handler,
)
from .routers import ALL_ROUTERS
from .services.events import start_udp_listener, stop_udp_listener
from .services.mediamtx import mediamtx
from .services.monitor import monitor
from .services.source_store import store
from .services.toml_sync import register_toml_sources

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """起動・終了処理。"""
    logger.info("起動: DB初期化・TOML読込・一時ソース破棄")
    store.init_db()
    store.reload_toml()
    # 常設ソース（TOML）を MediaMTX へ登録
    await register_toml_sources()
    # 録画保持期間を MediaMTX へ反映（mediamtx.yml の値より優先される）
    await mediamtx.set_record_delete_after(settings.recording_retention_hours)
    await start_udp_listener()
    monitor.start()
    logger.info("常設ソース数: %d", len(store.all_source_ids()))
    yield
    logger.info("終了: MediaMTX・モニタ停止")
    stop_udp_listener()
    await monitor.stop()
    await mediamtx.close()


def create_app() -> FastAPI:
    app = FastAPI(
        title="ロボット監視・リプレイシステム API",
        version="0.1.0",
        lifespan=lifespan,
    )

    # CORS（NFR-003: 原則LAN内のみ）
    origins = settings.cors_origin_list or ["*"]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # エラーハンドラ（SPEC 23章）
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)

    # ルータ（/api/v1 プレフィックス）
    api_prefix = "/api/v1"
    for router in ALL_ROUTERS:
        app.include_router(router, prefix=api_prefix)

    @app.get("/api/v1")
    async def api_root():
        return {"name": "replay-api", "version": "0.1.0"}

    # 事故映像（独立MP4）の配信。保存レスポンスの url からダウンロードできる
    from fastapi.staticfiles import StaticFiles

    app.mount(
        "/incidents",
        StaticFiles(directory=str(settings.incidents_path)),
        name="incidents",
    )

    return app


app = create_app()
