import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind クラス名を結合する。 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 数値をゼロ埋め。 */
export function pad(n: number, len = 2): string {
  return String(n).padStart(len, "0");
}

const TZ = "Asia/Tokyo";

/** 時刻を JST の HH:MM:SS へ（NFR-005）。 */
export function clockJST(ms: number, withSeconds = true): string {
  const d = new Intl.DateTimeFormat("ja-JP", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" } : {}),
    hour12: false,
  }).format(new Date(ms));
  return d;
}

/** ISO → JST HH:MM:SS。 */
export function formatTimeJST(iso: string | null, withSeconds = true): string {
  if (!iso) return "--:--:--";
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return "--:--:--";
  return clockJST(ms, withSeconds);
}

/** ISO → JST YYYY-MM-DD。 */
export function dateISOJST(iso: string | null): string {
  if (!iso) return "----/--/--";
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return "----/--/--";
  const j = new Intl.DateTimeFormat("ja-JP", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
  return j.replace(/\//g, "-");
}

/** ISO → JST YYYY-MM-DD HH:MM:SS。 */
export function formatDateTimeJST(iso: string | null): string {
  if (!iso) return "----/--/-- --:--:--";
  return `${dateISOJST(iso)} ${formatTimeJST(iso)}`;
}

/** 現在時刻との差（秒）を "-MM:SS" または "-H:MM:SS" 表示へ（REPLAY用）。 */
export function diffShort(sec: number): string {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `-${h}:${pad(m)}:${pad(s)}` : `-${m}:${pad(s)}`;
}

/** 現在時刻との差（秒）を自然言語へ。 */
export function diffLong(sec: number): string {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `現在より${h}時間${m}分前`;
  if (m > 0) return `現在より${m}分${s}秒前`;
  return `現在より${s}秒前`;
}

/** 旧関数名のエイリアス（既存コード互換）。 */
export const formatDelta = (seconds: number): string => diffShort(-seconds);

/** 0〜1 にクリップ。 */
export function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** SPEC 23章エラーコード → 日本語メッセージ。 */
export function errorCodeToMessage(code: string | null): string {
  const m: Record<string, string> = {
    CAMERA_AUTH_FAILED: "カメラの認証に失敗しました",
    CAMERA_CONNECTION_TIMEOUT: "カメラへ接続できません",
    STREAM_NOT_FOUND: "映像ストリームが見つかりません",
    UNSUPPORTED_CODEC: "未対応のコーデックです",
    MEDIA_SERVER_UNAVAILABLE: "監視サーバーと通信できません",
    STORAGE_FULL: "保存容量が不足しています",
    RECORDING_NOT_AVAILABLE: "録画を取得できません",
    SOURCE_NOT_FOUND: "映像ソースが見つかりません",
    LIVE_STREAM_NOT_AVAILABLE: "ライブ映像を取得できません",
    INVALID_RTSP_URL: "RTSP URLの形式が不正です",
    INTERNAL_ERROR: "不明なエラーが発生しました",
  };
  return (code && m[code]) || "不明なエラーが発生しました";
}
