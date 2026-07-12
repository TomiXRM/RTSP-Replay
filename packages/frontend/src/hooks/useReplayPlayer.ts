/**
 * REPLAY プレイヤーフック（SPEC FR-017〜020）。
 *
 * MediaMTX v1.19 の playback サーバーは MP4 プログレッシブダウンロードを
 * 返すため、HLS.js ではなく <video> 要素へ直接 src を設定して再生する。
 * 再生速度・一時停止を制御できる。
 * 録画の末尾へ到達しても自動的に LIVE へ切替しない（SPEC FR-021）。
 *
 * 録画が存在しない場合、サーバーはエラーを返すため、
 * タイムアウトで ERROR（RECORDING_NOT_AVAILABLE）へ遷移する。
 */

import { useEffect, useRef } from "react";

export interface UseReplayPlayerArgs {
  /** 過去映像再生URL（SPEC 22.7 でバックエンドが生成）。 */
  url: string | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** 再生速度（SPEC FR-020）。 */
  playbackRate: number;
  /** 一時停止中か。 */
  paused: boolean;
  onStateChange: (
    state: "INITIALIZING" | "CONNECTING" | "PLAYING" | "PAUSED" | "ERROR",
    extra?: { errorCode?: string | null },
  ) => void;
  /** 末尾到達通知（FR-021: 自動LIVE切替せず、呼び出し側で処理）。 */
  onEnded?: () => void;
}

const LOAD_TIMEOUT_MS = 8000;

export function useReplayPlayer({
  url,
  videoRef,
  playbackRate,
  paused,
  onStateChange,
  onEnded,
}: UseReplayPlayerArgs) {
  const timeoutRef = useRef<number | null>(null);
  // paused を deps に入れると一時停止のたびに動画がリロードされるため ref で参照する
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  // video.load() は playbackRate を 1 にリセットするため、ロード後の再適用に使う
  const rateRef = useRef(playbackRate);
  rateRef.current = playbackRate;

  // 再生速度の反映
  useEffect(() => {
    const video = videoRef.current;
    if (video) video.playbackRate = playbackRate;
  }, [playbackRate, videoRef]);

  // URL 変更時に動画を読み込み直す
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) return;

    // 一時停止指定で追加された場合、CONNECTING で PAUSED を上書きしない
    onStateChange(pausedRef.current ? "PAUSED" : "CONNECTING");

    // タイムアウト: 録画が存在しない場合の対策
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      if (video.readyState < 2) {
        onStateChange("ERROR", { errorCode: "RECORDING_NOT_AVAILABLE" });
      }
    }, LOAD_TIMEOUT_MS);

    // MP4 プログレッシブダウンロード: src を直接設定
    video.src = url;

    const onLoaded = () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      video.playbackRate = rateRef.current;
      if (!pausedRef.current) void video.play().catch(() => {});
    };
    const onPlaying = () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      onStateChange("PLAYING");
    };
    const onError = () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      onStateChange("ERROR", { errorCode: "RECORDING_NOT_AVAILABLE" });
    };
    const onEndedHandler = () => onEnded?.();

    video.addEventListener("loadeddata", onLoaded);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("error", onError);
    video.addEventListener("ended", onEndedHandler);
    video.load();

    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      video.removeEventListener("loadeddata", onLoaded);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("error", onError);
      video.removeEventListener("ended", onEndedHandler);
      video.removeAttribute("src");
      video.load();
    };
  }, [url, videoRef, onStateChange, onEnded]);

  // 一時停止の反映
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) return;
    if (paused) {
      video.pause();
    } else if (video.readyState >= 2) {
      void video.play().catch(() => {});
    }
  }, [paused, videoRef, url]);
}
