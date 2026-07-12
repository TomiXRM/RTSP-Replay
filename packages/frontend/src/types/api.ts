/**
 * API リクエスト型（SPEC 22章）。
 * フロントは RTSP URL/認証を保持し続けず、即バックエンドへ送信する（FR-004, NFR-003）。
 */

/** RTSP 接続テスト要求（SPEC 22.2）。 */
export interface ConnectionTestRequest {
  rtspUrl: string;
}

/** 映像ソース追加要求（SPEC 22.3）。 */
export interface SourceCreateRequest {
  name: string;
  rtspUrl: string;
  persistent: boolean;
  description?: string;
}

/** 映像ソース追加レスポンス（SPEC 22.3）。 */
export interface SourceCreateResponse {
  id: string;
  name: string;
  status: SourceStatusLike;
}

type SourceStatusLike = "CONNECTING" | "ONLINE" | "OFFLINE" | "ERROR";

/** 事故保存要求（SPEC 22.8, 19章）。 */
export interface IncidentCreateRequest {
  title: string;
  reason: IncidentReason;
  note?: string | null;
  start: string;
  end: string;
  sourceIds: string[];
}

/** 事故保存理由（SPEC 19章）。 */
export type IncidentReason =
  | "ROBOT_ERROR"
  | "QUALITY_DEFECT"
  | "SAFETY_ISSUE"
  | "COMMUNICATION_FAILURE"
  | "OPERATION_CHECK"
  | "OTHER";

/** 事故保存結果（1ソース分）。 */
export interface IncidentExportResult {
  sourceId: string;
  success: boolean;
  url?: string | null;
  /** サーバー上の絶対パス */
  path?: string | null;
  errorCode?: string | null;
  message?: string | null;
}

/** 事故保存レスポンス。 */
export interface IncidentCreateResponse {
  id: string;
  title: string;
  reason: IncidentReason;
  start: string;
  end: string;
  sourceIds: string[];
  /** 保存先ディレクトリ（サーバー上の絶対パス） */
  dir?: string;
  results: IncidentExportResult[];
}

/** システム状態（SPEC 22.9）。 */
export interface HealthResponse {
  status: "ok" | "degraded" | "down";
  mediaServer: "online" | "offline" | string;
  disk: {
    path?: string;
    usedPercent?: number;
    totalBytes?: number;
    freeBytes?: number;
    status?: "ok" | "warning" | "critical" | "unknown";
  };
  sources: {
    online: number;
    offline: number;
    recording: number;
    stopped: number;
    total: number;
  };
  /** 録画保持期間（時間）。タイムライン表示幅と連動 */
  retentionHours?: number;
}

/** タイムラインイベント（マーカー）。 */
export interface TimelineEvent {
  id: number;
  ts: string;
  label: string;
  sourceId: string | null;
  origin: string;
}
