/**
 * 映像ソース・録画関連の型（SPEC 22.1, 22.2, 22.5, 22.6）。
 * RTSP URL や認証情報は一切含めない（NFR-003）。
 */

/** 映像ソースの登録元（SPEC 4.2, 7.3）。 */
export type Origin = "TOML" | "DYNAMIC" | "TEMP";

/** 映像ソースの接続状態（SPEC 22.1）。 */
export type SourceStatus =
  | "ONLINE"
  | "CONNECTING"
  | "RECONNECTING"
  | "OFFLINE"
  | "ERROR";

/** 録画状態（SPEC 22.1）。 */
export type RecordingStatus = "RECORDING" | "STOPPED" | "UNKNOWN";

/** 映像ソース（SPEC 22.1）。RTSP URL/認証を含めない。 */
export interface Source {
  id: string;
  name: string;
  origin: Origin;
  status: SourceStatus;
  recordingStatus: RecordingStatus;
  lastFrameAt: string | null;
  lastRecordingAt: string | null;
  location?: string | null;
  resolution?: string | null;
}

export interface SourceListResponse {
  sources: Source[];
}

/** RTSP 接続テスト結果（SPEC 22.2）。 */
export interface ConnectionTestResult {
  success: boolean;
  codec?: string | null;
  width?: number | null;
  height?: number | null;
  fps?: number | null;
  errorCode?: string | null;
  message?: string | null;
}

/** LIVE 再生情報（SPEC 22.5）。 */
export interface LiveInfo {
  sourceId: string;
  mode: string;
  url: string;
  available: boolean;
}

/** 録画区間（SPEC 22.6）。 */
export interface RecordingRange {
  start: string;
  end: string;
}

/** 録画範囲（SPEC 22.6, FR-016）。 */
export interface RecordingRanges {
  sourceId: string;
  availableFrom: string | null;
  availableTo: string | null;
  ranges: RecordingRange[];
}

/** 過去映像再生情報（SPEC 22.7）。 */
export interface PlaybackInfo {
  sourceId: string;
  start: string;
  duration: number;
  url: string;
}
