# Handoff Guide

Read this first, then read `SPEC.md`.

---

## Current State (as of 2026-07-12)

### Done
- Full-stack implementation based on `SPEC.md` (frontend / backend / MediaMTX / Docker)
- UI design faithfully reproduces `monitor_sample.html` (dark monitoring UI, `#c9ff05` accent)
- Local dummy camera environment via `./scripts/dev-mock.sh start` (one command)
- SYNCED synchronized replay implemented (time alignment, bulk seek, play/pause/rate sync)
- Tests: frontend 19 passed, backend 19 passed

### In Progress (where the previous session left off)
Fixing **past-video replay (REPLAY) playback** for MediaMTX v1.19:
- Root cause identified: MediaMTX v1.19 playback server endpoint is `GET /get?path={name}&start={JST}&duration={sec}` (returns MP4 progressive download, NOT HLS)
- Backend `mediamtx.py` `playback_url()` updated (v1.19 format, UTC→JST conversion)
- Frontend `useReplayPlayer.ts` rewritten (dropped hls.js, sets `<video>` src directly for MP4)
- `Pane.tsx` updated (REPLAY URL construction, added `utcToJst()` helper)
- **Typecheck passes. Runtime not yet verified.**

### Verified & fixed in browser session (2026-07-12, this session)

All buttons exercised end-to-end in the mock environment (browser automation).
REPLAY playback confirmed working (MP4 from :9996, verified visually with
cam-02's incrementing counter). Timeline click-seek, transport seek (±10s/±1min),
rates, SYNCED (align / bulk seek / pause / rate), incident save (DB row confirmed),
URL-tab connection test, 6-pane limit, empty-slot add: all working.

Bugs found & fixed (frontend only, tests 19/19 pass, tsc clean):
1. `useLivePlayer.ts` — native-HLS path was preferred over hls.js. Chromium
   answers `canPlayType("application/vnd.apple.mpegurl")` with "maybe" but can't
   demux HLS → newly added LIVE panes randomly showed ERROR
   (`DEMUXER_ERROR_COULD_NOT_PARSE`), with no retry. Now hls.js is preferred;
   native is the no-MSE (iOS Safari) fallback. Also logs fatal hls errors.
2. `Pane.tsx` — root div lacked `h-full`; in any non-stretching parent
   (maximized view, state-catalog cards) the pane collapsed to its 30px header
   → black screen (FR-013 violation). Maximize + catalog now render.
3. `useReplayPlayer.ts` — `paused` was in the load-effect deps, so pausing
   reloaded the MP4 from scratch; plus `<video autoPlay>` restarted it.
   Pause/resume now keeps position; `autoPlay` attribute removed
   ("N分前から一時停止で追加" now actually stays paused; load-effect no longer
   overwrites PAUSED with CONNECTING).
4. `Pane.tsx` — replay `ended` (end of 300s MP4 window / caught up to now) left
   store state PLAYING; now wired `onEnded` → PAUSED. Note: resuming after
   `ended` replays the same MP4 window from its start (known limitation).
5. `AddPaneDialog.tsx` / `IncidentDialog.tsx` — API failures (e.g. 409 duplicate
   RTSP URL) were silent; now shown as error boxes in the dialogs.
6. State catalog (`sourceId: "demo"` panes) no longer opens real network
   connections and now displays the designed states instead of spinners.

Known cosmetic leftovers (not bugs):
- S-02 catalog card shows the REC-STOP warning bar (demo source has no
  recordingStatus). Harmless in a demo showcase.
- Timeline shows a thin red "gap" at the live edge because recording ranges lag
  a few seconds behind now.

---

## What To Do Next (in priority order)

> 2026-07-12: Items 1–4 verified working (see "Verified & fixed" above).
> Item 5 (docs) done: README troubleshooting updated for mock-env behavior.

### 1. Verify and debug REPLAY playback (TOP PRIORITY)
**Goal**: make past-video replay work with dummy cameras.

Steps to verify:
```bash
cd /Users/tomixrm/newinov/replay
./scripts/dev-mock.sh stop     # stop existing processes
./scripts/dev-mock.sh start    # fresh start
# wait ~2 minutes for recordings to accumulate
```

In browser at http://localhost:5173:
1. Add Pane → dummy camera shows LIVE
2. Click the timeline bar at the bottom → switches to REPLAY (past video)
3. **Expected**: MP4 of that time starts playing
4. **If ERROR**: check browser DevTools Console and Network tabs

Checkpoints:
- In REPLAY mode, the `<video>` element's `src` should be `http://localhost:9996/get?path=cam-01&start=...&duration=300`
- Verify that URL is reachable via `curl`
- JST conversion correct (`utcToJst()` result is `+09:00` format)
- `useReplayPlayer`'s `loadeddata` event fires

Files to check if broken:
- `packages/frontend/src/hooks/useReplayPlayer.ts` (MP4 direct playback logic)
- `packages/frontend/src/features/pane/Pane.tsx` (REPLAY URL construction, `utcToJst()`)
- `packages/backend/app/services/mediamtx.py` (`playback_url()` method)
- `packages/backend/app/routers/playback.py` (API endpoint)

### 2. Verify REPLAY seek (time navigation)
- Use CommonControls ◀◀ ◀ ▶ ▶▶ buttons to move time
- In SYNCED mode, all panes should move together
- After changing time, video should reload

### 3. Verify SYNCED synchronized replay
- Switch 3+ panes to REPLAY → enable SYNCED
- All panes should align to the same time
- Timeline click / seek / play-pause should sync across panes

### 4. Regression test existing features
- LIVE display works
- Incident save dialog works
- Recording-stopped / offline detection displays correctly
- State catalog (12 states) displays correctly

### 5. Cleanup and docs
- If REPLAY is fixed, update `README.md` troubleshooting section
- Add notes about normal behavior in the mock environment

---

## Environment

### How to start
```bash
# Local mock environment (recommended)
./scripts/dev-mock.sh start    # start everything
./scripts/dev-mock.sh stop     # stop everything
```

### Ports
| Component | Port | Purpose |
| --- | --- | --- |
| Frontend | 5173 | Vite dev server |
| Backend | 8000 | FastAPI |
| MediaMTX HLS | 8888 | Live streaming |
| MediaMTX Playback | 9996 | Past-video replay (MP4) |
| MediaMTX API | 9997 | Control API |
| MediaMTX RTSP | 8554 | Camera ingest |

### Log files
```
.logs/mediamtx.log
.logs/backend.log
.logs/frontend.log
.logs/cam1.log ~ cam4.log
```

### Dummy camera setup
- `sources.toml` → mock version (copy of `sources.mock.toml`)
- Real-camera backup saved as `sources.real.toml`
- ffmpeg pushes 4 test patterns to MediaMTX (publish mode)
- Backend creates publish paths automatically on startup (for `localhost:8554` URLs)

---

## MediaMTX v1.19 Gotchas (things that required trial and error)

1. **Playback server serves MP4, not HLS**: `/get?path=...&start=...&duration=...` returns `video/mp4`
2. **`start` parameter must be JST (+09:00)**: UTC will be off by one day
3. **`recordPath` is `./recordings/` for local**: Docker overrides via `MTX_RECORDPATH` env to `/recordings`
4. **Publish requires a path definition**: without a path config, publish is rejected (404)
5. **API endpoint format**: `POST /v3/config/paths/add/{name}` (name is in the URL path)
6. **HLS uses `hlsVariant: mpegts`**: `lowLatency` mode causes cookieCheck issues with hls.js

---

## Key Files

### Frontend
| File | Role |
| --- | --- |
| `src/features/pane/Pane.tsx` | Pane component (LIVE/REPLAY playback, state display) |
| `src/hooks/useLivePlayer.ts` | LIVE playback (hls.js) |
| `src/hooks/useReplayPlayer.ts` | REPLAY playback (MP4 direct) ★ recently changed |
| `src/store/workspace.ts` | State management (incl. sync operations) |
| `src/features/timeline/Timeline.tsx` | Timeline (bulk seek) |
| `src/features/controls/CommonControls.tsx` | Playback controller |

### Backend
| File | Role |
| --- | --- |
| `app/services/mediamtx.py` | MediaMTX API wrapper (path registration, URL generation) ★ recently changed |
| `app/routers/playback.py` | Replay API endpoint |
| `app/services/recording_ranges.py` | Recording range retrieval |
| `app/main.py` | Startup logic (TOML→MediaMTX registration) |

### Config / Scripts
| File | Role |
| --- | --- |
| `config/mediamtx.yml` | MediaMTX config (v1.19 compatible) |
| `config/sources.toml` | Camera config (currently mock version) |
| `config/sources.mock.toml` | Dummy camera config template |
| `config/sources.real.toml` | Real camera config backup |
| `scripts/dev-mock.sh` | One-command mock environment launcher |
| `.env` | Auth credentials (gitignored) |
