"""ルータパッケージ。"""

from . import config, events, health, incidents, live, playback, recordings, sources

ALL_ROUTERS = [
    sources.router,
    live.router,
    recordings.router,
    playback.router,
    incidents.router,
    health.router,
    config.router,
    events.router,
]

__all__ = ["ALL_ROUTERS"]
