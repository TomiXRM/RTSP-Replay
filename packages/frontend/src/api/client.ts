/**
 * API クライアント（SPEC 22章, 23章）。
 *
 * セキュリティ要件（FR-004, NFR-003）:
 *  - RTSP URL や認証情報をフロントで保持し続けない
 *  - 認証情報付き RTSP URL を localStorage / URLクエリ / ログへ残さない
 *
 * すべてのエラーは ApiError（SPEC 23章 共通形式）へ正規化する。
 */

import { ApiError, type ApiErrorBody } from "@/types/errors";

const BASE = "/api/v1";

interface RequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  /** X-Request-Id を明示指定（テスト用）。 */
  requestId?: string;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (opts.requestId) headers["X-Request-Id"] = opts.requestId;

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
      // 認証情報付きURLを履歴に残さないため、全て相対パス + POST body で送る
    });
  } catch (e) {
    // ネットワークエラー（バックエンド停止: SPEC 21.6）
    throw new ApiError("MEDIA_SERVER_UNAVAILABLE", "監視サーバーと通信できません", {
      status: 0,
    });
    void e; // 元の例外を意図的に破棄（URL漏洩防止）
  }

  if (!res.ok) {
    let body: ApiErrorBody | null = null;
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {
      // JSON 以外のレスポンス
    }
    if (body?.error) {
      throw ApiError.fromBody(body, res.status);
    }
    throw new ApiError("INTERNAL_ERROR", `通信エラー (${res.status})`, {
      status: res.status,
    });
  }

  // 204 No Content
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export const api = {
  // --- 映像ソース（SPEC 22.1〜22.4） ---
  listSources: (signal?: AbortSignal) =>
    request<{ sources: import("@/types/source").Source[] }>("/sources", { signal }),

  testConnection: (rtspUrl: string) =>
    // RTSP URL はここでのみ使い、保存しない（FR-004）
    request<import("@/types/source").ConnectionTestResult>("/sources/test", {
      method: "POST",
      body: { rtspUrl },
    }),

  createSource: (body: import("@/types/api").SourceCreateRequest) =>
    request<import("@/types/api").SourceCreateResponse>("/sources", {
      method: "POST",
      body,
    }),

  deleteSource: (sourceId: string) =>
    request<void>(`/sources/${encodeURIComponent(sourceId)}`, {
      method: "DELETE",
    }),

  // --- LIVE再生情報（SPEC 22.5） ---
  getLive: (sourceId: string) =>
    request<import("@/types/source").LiveInfo>(
      `/sources/${encodeURIComponent(sourceId)}/live`,
    ),

  // --- 録画範囲（SPEC 22.6） ---
  getRecordingRanges: (sourceId: string) =>
    request<import("@/types/source").RecordingRanges>(
      `/sources/${encodeURIComponent(sourceId)}/recordings/ranges`,
    ),

  // --- 過去映像再生（SPEC 22.7） ---
  getPlayback: (sourceId: string, start: string, duration: number) =>
    request<import("@/types/source").PlaybackInfo>(
      `/sources/${encodeURIComponent(sourceId)}/playback?start=${encodeURIComponent(
        start,
      )}&duration=${duration}`,
    ),

  // --- 事故保存（SPEC 22.8） ---
  createIncident: (body: import("@/types/api").IncidentCreateRequest) =>
    request<import("@/types/api").IncidentCreateResponse>("/incidents", {
      method: "POST",
      body,
    }),

  // --- システム状態（SPEC 22.9） ---
  getHealth: (signal?: AbortSignal) =>
    request<import("@/types/api").HealthResponse>("/health", { signal }),

  // --- イベント（タイムラインマーカー） ---
  getEvents: (hours = 2) =>
    request<{ events: import("@/types/api").TimelineEvent[] }>(
      `/events?hours=${hours}`,
    ),

  postEvent: (body: { label: string; ts?: string; sourceId?: string }) =>
    request<import("@/types/api").TimelineEvent>("/events", {
      method: "POST",
      body,
    }),

  // --- カメラ設定TOML ---
  getSourcesToml: () =>
    request<{ content: string; path: string }>("/config/sources-toml"),

  putSourcesToml: (content: string) =>
    request<{ ok: boolean; sourceIds: string[] }>("/config/sources-toml", {
      method: "PUT",
      body: { content },
    }),

  // --- 中継カメラ定義（relays.conf） ---
  getRelaysConf: () =>
    request<{ content: string; path: string }>("/config/relays-conf"),

  putRelaysConf: (content: string) =>
    request<{ ok: boolean; names: string[]; relayStarted: boolean }>(
      "/config/relays-conf",
      { method: "PUT", body: { content } },
    ),

  // --- .env（認証情報。LAN内利用前提） ---
  getEnv: () => request<{ content: string; path: string }>("/config/env"),

  putEnv: (content: string) =>
    request<{ ok: boolean; keys: string[] }>("/config/env", {
      method: "PUT",
      body: { content },
    }),
};
