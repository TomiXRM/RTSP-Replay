/**
 * APIエラー（SPEC 23章）。
 *
 * すべてのAPIエラーは共通形式:
 *   { error: { code, message, details, requestId } }
 */

/** エラーコード（SPEC 23章 代表リスト）。 */
export type ErrorCode =
  | "SOURCE_NOT_FOUND"
  | "SOURCE_ALREADY_EXISTS"
  | "INVALID_RTSP_URL"
  | "CAMERA_CONNECTION_TIMEOUT"
  | "CAMERA_AUTH_FAILED"
  | "STREAM_NOT_FOUND"
  | "UNSUPPORTED_CODEC"
  | "LIVE_STREAM_NOT_AVAILABLE"
  | "RECORDING_NOT_AVAILABLE"
  | "INVALID_TIME_RANGE"
  | "MEDIA_SERVER_UNAVAILABLE"
  | "STORAGE_UNAVAILABLE"
  | "STORAGE_FULL"
  | "INCIDENT_EXPORT_FAILED"
  | "INTERNAL_ERROR"
  | "VALIDATION_ERROR"
  | "PANE_LIMIT_REACHED";

/** 共通エラーレスポンス（SPEC 23章）。 */
export interface ApiErrorBody {
  error: {
    code: ErrorCode | string;
    message: string;
    details: Record<string, unknown>;
    requestId: string;
  };
}

/** フロントエンドで扱う正規化済みエラー。 */
export class ApiError extends Error {
  code: string;
  details: Record<string, unknown>;
  requestId: string;
  status: number;

  constructor(
    code: string,
    message: string,
    opts: {
      details?: Record<string, unknown>;
      requestId?: string;
      status?: number;
    } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = opts.details ?? {};
    this.requestId = opts.requestId ?? "unknown";
    this.status = opts.status ?? 0;
  }

  static fromBody(body: ApiErrorBody, status: number): ApiError {
    return new ApiError(body.error.code, body.error.message, {
      details: body.error.details,
      requestId: body.error.requestId,
      status,
    });
  }
}
