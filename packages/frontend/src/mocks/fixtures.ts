/**
 * MSW ハンドラ（SPEC 22章 全エンドポイント + 25章の各状態）。
 *
 * フロント単体で動作確認できるよう、バックエンド不要で状態を再現する。
 * ClaudeDesign が「正常状態だけをデザインしない（SPEC 25章）」を満たすため、
 * 接続失敗・録画停止・容量不足・API停止などの異常系も網羅する。
 */

import { http, HttpResponse, delay } from "msw";

const NOW = () => new Date();
const iso = (d: Date) => d.toISOString();
const ago = (seconds: number) => new Date(NOW().getTime() - seconds * 1000);

// --- 固定モックソース ---
const mockSources = [
  {
    id: "robot-overview",
    name: "ロボット全体",
    origin: "TOML",
    status: "ONLINE",
    recordingStatus: "RECORDING",
    lastFrameAt: iso(ago(1)),
    lastRecordingAt: iso(ago(2)),
  },
  {
    id: "part-unit",
    name: "部品供給部",
    origin: "TOML",
    status: "ONLINE",
    recordingStatus: "RECORDING",
    lastFrameAt: iso(ago(1)),
    lastRecordingAt: iso(ago(2)),
  },
  {
    id: "conveyor",
    name: "搬送部",
    origin: "TOML",
    status: "RECONNECTING",
    recordingStatus: "STOPPED",
    lastFrameAt: iso(ago(20)),
    lastRecordingAt: iso(ago(25)),
  },
];

// 録画区間（直近2時間、1箇所欠損あり）
function mockRanges(sourceId: string) {
  const to = NOW();
  const from = ago(7200);
  const gapStart = ago(5400);
  const gapEnd = ago(5100);
  return {
    sourceId,
    availableFrom: iso(from),
    availableTo: iso(to),
    ranges: [
      { start: iso(from), end: iso(gapStart) },
      { start: iso(gapEnd), end: iso(to) },
    ],
  };
}

function errorBody(code: string, message: string, requestId = "req-mock-001") {
  return { error: { code, message, details: {}, requestId } };
}

export const handlers = [
  // --- 22.1 映像ソース一覧 ---
  http.get("/api/v1/sources", async () => {
    await delay(150);
    return HttpResponse.json({ sources: mockSources });
  }),

  // --- 22.2 接続テスト ---
  http.post("/api/v1/sources/test", async ({ request }) => {
    const body = (await request.json()) as { rtspUrl?: string };
    await delay(800);
    if (!body.rtspUrl?.startsWith("rtsp://")) {
      return HttpResponse.json(
        {
          success: false,
          errorCode: "INVALID_RTSP_URL",
          message: "RTSP URLの形式が不正です",
        },
        { status: 200 },
      );
    }
    // 認証失敗のデモ
    if (body.rtspUrl.includes("fail-auth")) {
      return HttpResponse.json(
        {
          success: false,
          errorCode: "CAMERA_AUTH_FAILED",
          message: "カメラの認証に失敗しました",
        },
        { status: 200 },
      );
    }
    return HttpResponse.json({
      success: true,
      codec: "H264",
      width: 1920,
      height: 1080,
      fps: 15,
    });
  }),

  // --- 22.3 ソース追加 ---
  http.post("/api/v1/sources", async ({ request }) => {
    const body = (await request.json()) as { name: string; rtspUrl: string };
    await delay(400);
    return HttpResponse.json(
      {
        id: `src-${Math.random().toString(36).slice(2, 10)}`,
        name: body.name,
        status: "CONNECTING",
      },
      { status: 201 },
    );
  }),

  // --- 22.4 ソース削除 ---
  http.delete("/api/v1/sources/:id", async () => {
    return new HttpResponse(null, { status: 204 });
  }),

  // --- 22.5 LIVE ---
  http.get("/api/v1/sources/:id/live", async ({ params }) => {
    const knownIds = mockSources.map((s) => s.id);
    if (!knownIds.includes(params.id as string)) {
      return HttpResponse.json(
        errorBody("SOURCE_NOT_FOUND", "映像ソースが見つかりません"),
        { status: 404 },
      );
    }
    return HttpResponse.json({
      sourceId: params.id as string,
      mode: "HLS",
      url: `/streams/${params.id}/index.m3u8`,
      available: true,
    });
  }),

  // --- 22.6 録画範囲 ---
  http.get("/api/v1/sources/:id/recordings/ranges", async ({ params }) => {
    await delay(200);
    return HttpResponse.json(mockRanges(params.id as string));
  }),

  // --- 22.7 過去映像再生 ---
  http.get("/api/v1/sources/:id/playback", async ({ request, params }) => {
    const url = new URL(request.url);
    const start = url.searchParams.get("start") ?? "";
    const duration = url.searchParams.get("duration") ?? "300";
    return HttpResponse.json({
      sourceId: params.id as string,
      start,
      duration: Number(duration),
      url: `/playback/${params.id}?start=${encodeURIComponent(start)}&duration=${duration}`,
    });
  }),

  // --- 22.8 事故保存 ---
  http.post("/api/v1/incidents", async ({ request }) => {
    const body = (await request.json()) as { sourceIds: string[] };
    await delay(1000);
    return HttpResponse.json(
      {
        id: `inc-${Math.random().toString(36).slice(2, 10)}`,
        title: "事故",
        reason: "ROBOT_ERROR",
        start: iso(ago(300)),
        end: iso(ago(0)),
        sourceIds: body.sourceIds,
        results: body.sourceIds.map((sid) => ({
          sourceId: sid,
          success: true,
          url: `/incidents/demo/${sid}.mp4`,
        })),
      },
      { status: 201 },
    );
  }),

  // --- 22.9 システム状態 ---
  http.get("/api/v1/health", async () => {
    return HttpResponse.json({
      status: "ok",
      mediaServer: "online",
      disk: {
        path: "/recordings",
        usedPercent: 42,
        totalBytes: 500_000_000_000,
        freeBytes: 290_000_000_000,
        status: "ok",
      },
      sources: { online: 2, offline: 1, recording: 2, stopped: 1, total: 3 },
    });
  }),
];

/**
 * 異常系ハンドラ（SPEC 25章）。テストやデザイン確認で差し替えて使う。
 * 例: server.use(...offlineHandlers)
 */
export const errorScenarios = {
  // API 停止（21.6）: ネットワークエラー
  apiDown: http.get("/api/v1/health", () => HttpResponse.error()),
  // 容量不足（21.5）
  storageFull: http.get("/api/v1/health", () =>
    HttpResponse.json({
      status: "degraded",
      mediaServer: "online",
      disk: { usedPercent: 93, status: "critical" },
      sources: { online: 3, offline: 0, recording: 3, stopped: 0, total: 3 },
    }),
  ),
  // 録画停止（21.3）
  recordingStopped: http.get("/api/v1/sources", () =>
    HttpResponse.json({
      sources: mockSources.map((s) => ({
        ...s,
        recordingStatus: "STOPPED",
        lastRecordingAt: iso(ago(120)),
      })),
    }),
  ),
  // ソース重複（22.3）
  sourceExists: http.post("/api/v1/sources", () =>
    HttpResponse.json(errorBody("SOURCE_ALREADY_EXISTS", "同じURLが既に存在します"), {
      status: 409,
    }),
  ),
};
