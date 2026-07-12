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

    const hls = new Hls({
      lowLatencyMode: true,
      liveDurationInfinity: true,
      backBufferLength: 30,
    });
    hlsRef.current = hls;
    onStateChange("CONNECTING");

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (autoplay) void video.play().catch(() => {});
    });

    // video 要素の再生開始で PLAYING へ（FRAG_LOADED より確実）
    const onPlaying = () =>
      onStateChange("PLAYING", { lastFrameAt: new Date().toISOString() });
    video.addEventListener("playing", onPlaying);

    hls.on(Hls.Events.FRAG_LOADED, () => {
      onStateChange("PLAYING", { lastFrameAt: new Date().toISOString() });
    });

    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) {
        console.warn("[useLivePlayer] fatal hls error:", data.type, data.details);
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            onStateChange("RECONNECTING");
            // 自動再接続（FR-037）
            reconnectTimer.current = window.setTimeout(() => {
              hls.startLoad();
            }, 2000);
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            onStateChange("RECONNECTING");
            hls.recoverMediaError();
            break;
          default:
            onStateChange("ERROR", {
              errorCode: "LIVE_STREAM_NOT_AVAILABLE",
            });
            hls.destroy();
            break;
        }
      }
    });

    hls.loadSource(url);
    hls.attachMedia(video);

    return () => {
      video.removeEventListener("playing", onPlaying);
      if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
      hls.destroy();
      hlsRef.current = null;
    };
    // onStateChange は親で useCallback 済みを想定。url 変更で再接続。
  }, [url, videoRef, onStateChange, autoplay]);
}
