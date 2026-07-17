/**
 * LIVE プレイヤーフック（SPEC FR-011, FR-013, FR-037）。
 *
 * HLS.js で LL-HLS ライブ再生を行う。
 * 接続失敗時は黒画面のみを表示せず、状態へ反映する（FR-013）。
 * 自動再接続を行う（FR-037）。
 */

import { useEffect, useRef } from "react";

import Hls from "hls.js";

export interface UseLivePlayerArgs {
  url: string | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onStateChange: (
    state:
      | "CONNECTING"
      | "PLAYING"
      | "RECONNECTING"
      | "UNAVAILABLE"
      | "ERROR",
    extra?: { errorCode?: string | null; lastFrameAt?: string | null },
  ) => void;
  /** 自動再生の試行。既定 true。 */
  autoplay?: boolean;
}

export function useLivePlayer({
  url,
  videoRef,
  onStateChange,
  autoplay = true,
}: UseLivePlayerArgs) {
  const hlsRef = useRef<Hls | null>(null);
  const reconnectTimer = useRef<number | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) return;

    // hls.js を優先する（再接続制御があり FR-037 を満たす）。
    // Chromium 系は canPlayType が "maybe" を返しても実際は HLS を再生できないため、
    // ネイティブ再生は MSE が使えない環境（iOS Safari）のみのフォールバック。
    if (!Hls.isSupported()) {
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = url;
        onStateChange("CONNECTING");
        const onPlaying = () => onStateChange("PLAYING");
        const onWaiting = () => onStateChange("RECONNECTING");
        const onError = () =>
          onStateChange("ERROR", { errorCode: "LIVE_STREAM_NOT_AVAILABLE" });
        video.addEventListener("playing", onPlaying);
        video.addEventListener("waiting", onWaiting);
        video.addEventListener("error", onError);
        if (autoplay) void video.play().catch(() => {});
        return () => {
          video.removeEventListener("playing", onPlaying);
          video.removeEventListener("waiting", onWaiting);
          video.removeEventListener("error", onError);
          video.removeAttribute("src");
          video.load();
        };
      }
      onStateChange("UNAVAILABLE", { errorCode: "UNSUPPORTED_CODEC" });
      return;
    }

    // 配信は「途切れて作り直される」前提（中継の再接続で HLS muxer が再生成される）。
    // 致命的エラーやフラグメント停滞を検知したら Hls インスタンスごと作り直し、
    // 無限にリトライする（FR-037）。リロード不要で最新のライブエッジへ復帰する。
    let disposed = false;
    let retryCount = 0;
    let mediaRecovered = false;
    let lastProgressAt = Date.now();

    const onPlaying = () =>
      onStateChange("PLAYING", { lastFrameAt: new Date().toISOString() });
    video.addEventListener("playing", onPlaying);

    const scheduleRestart = () => {
      if (disposed || reconnectTimer.current !== null) return;
      hlsRef.current?.destroy();
      hlsRef.current = null;
      retryCount += 1;
      // 5連敗で ERROR 表示に切り替える（リトライ自体は継続）
      if (retryCount >= 5) {
        onStateChange("ERROR", { errorCode: "LIVE_STREAM_NOT_AVAILABLE" });
      } else {
        onStateChange("RECONNECTING");
      }
      const delay = Math.min(2000 * retryCount, 10000);
      reconnectTimer.current = window.setTimeout(() => {
        reconnectTimer.current = null;
        lastProgressAt = Date.now();
        start();
      }, delay);
    };

    const start = () => {
      if (disposed) return;
      const hls = new Hls({
        lowLatencyMode: true,
        liveDurationInfinity: true,
        backBufferLength: 30,
      });
      hlsRef.current = hls;
      mediaRecovered = false;

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (autoplay) void video.play().catch(() => {});
      });

      hls.on(Hls.Events.FRAG_LOADED, () => {
        lastProgressAt = Date.now();
        retryCount = 0;
        mediaRecovered = false;
        onStateChange("PLAYING", { lastFrameAt: new Date().toISOString() });
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        console.warn("[useLivePlayer] fatal hls error:", data.type, data.details);
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !mediaRecovered) {
          // まずは軽量な復旧を1回だけ試す。ダメなら作り直し。
          mediaRecovered = true;
          onStateChange("RECONNECTING");
          hls.recoverMediaError();
          return;
        }
        scheduleRestart();
      });

      hls.loadSource(url);
      hls.attachMedia(video);
    };

    // ウォッチドッグ: 新しいフラグメントが8秒来なければ作り直し。
    // 致命的エラーを出さずにプレイリストだけ止まるケースを拾う。
    const watchdog = window.setInterval(() => {
      if (reconnectTimer.current !== null) return;
      if (document.hidden) {
        lastProgressAt = Date.now(); // バックグラウンドタブの誤検知防止
        return;
      }
      if (Date.now() - lastProgressAt > 8000) {
        console.warn("[useLivePlayer] fragment stall detected, restarting player");
        scheduleRestart();
      }
    }, 2000);

    onStateChange("CONNECTING");
    start();

    return () => {
      disposed = true;
      window.clearInterval(watchdog);
      video.removeEventListener("playing", onPlaying);
      if (reconnectTimer.current) {
        window.clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
    // onStateChange は親で useCallback 済みを想定。url 変更で再接続。
  }, [url, videoRef, onStateChange, autoplay]);
}
