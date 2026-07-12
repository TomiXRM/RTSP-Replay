/**
 * Pane コンポーネント（SPEC 11, 13, 18章 + monitor_sample.html デザイン準拠）。
 *
 * ヘッダー: CAMコード / 名前 / LIVE|REPLAY バッジ / ステータスドット / meta / 最大化 / メニュー / 削除
 * 画面状態: VIDEO（映像+スキャンライン+REC+タイムコード）/ CONNECTING / OFFLINE(NO SIGNAL) / ERROR / GAP
 * 各 Pane へ大量の操作ボタンを常時表示しない（SPEC 18章）。
 * 黒画面のみを表示しない（FR-013）。
 */

import { Maximize2, Volume2, VolumeX, X } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

import { useLivePlayer } from "@/hooks/useLivePlayer";
import { useReplayPlayer } from "@/hooks/useReplayPlayer";
import { useWorkspaceStore } from "@/store/workspace";
import { useSystemStore } from "@/store/system";
import type { PaneState, PlayerState } from "@/types/pane";
import {
  cn,
  clockJST,
  dateISOJST,
  diffShort,
  errorCodeToMessage,
} from "@/lib/utils";

interface PaneProps {
  pane: PaneState;
}

const ACCENT = "#c9ff05";
const REPLAY_BLUE = "#3da5ff";

export function Pane({ pane }: PaneProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasFrame, setHasFrame] = useState(false);
  const updatePane = useWorkspaceStore((s) => s.updatePane);
  const toggleMaximize = useWorkspaceStore((s) => s.toggleMaximize);
  const removePane = useWorkspaceStore((s) => s.removePane);
  const selectPane = useWorkspaceStore((s) => s.selectPane);
  const sources = useSystemStore((s) => s.sources);

  const source = useMemo(
    () => sources.find((s) => s.id === pane.sourceId),
    [sources, pane.sourceId],
  );
  const sourceName = pane.sourceName ?? source?.name ?? "映像ソース";
  const code = sourceCode(pane.sourceId, sources.indexOf(source ?? {} as never));

  // LIVE/REPLAY URL（単一オリジン: ブラウザは UI と同じオリジンしか見ない）
  // LIVE: /streams/... , REPLAY: /playback/get?...
  // → vite dev サーバーのプロキシが MediaMTX（HLS/playback）へ中継する。
  //   MediaMTX 固有のホスト・ポートをフロントが組み立てない（SPEC 22.7）。
  // 状態カタログ用のデモPane: 実ストリームへ接続せず、指定された playerState をそのまま表示する
  const isDemo = pane.sourceId === "demo";
  const liveUrl =
    pane.mode === "LIVE" && pane.sourceId && !isDemo
      ? `/streams/${pane.sourceId}/index.m3u8`
      : null;
  const replayUrl =
    pane.mode === "REPLAY" && pane.sourceId && pane.replayAt && !isDemo
      ? `/playback/get?path=${encodeURIComponent(pane.sourceId)}&start=${utcToJst(pane.replayAt)}&duration=300`
      : null;

  const onLiveState = useCallback(
    (
      state: "CONNECTING" | "PLAYING" | "RECONNECTING" | "UNAVAILABLE" | "ERROR",
      extra?: { errorCode?: string | null; lastFrameAt?: string | null },
    ) => {
      const map: Record<string, PlayerState> = {
        CONNECTING: "CONNECTING",
        PLAYING: "PLAYING",
        RECONNECTING: "RECONNECTING",
        UNAVAILABLE: "UNAVAILABLE",
        ERROR: "ERROR",
      };
      updatePane(pane.id, {
        playerState: map[state],
        errorCode: extra?.errorCode ?? null,
        lastFrameAt: extra?.lastFrameAt ?? null,
      });
    },
    [pane.id, updatePane],
  );

  const onReplayState = useCallback(
    (
      state: "INITIALIZING" | "CONNECTING" | "PLAYING" | "PAUSED" | "ERROR",
      extra?: { errorCode?: string | null },
    ) => {
      const map: Record<string, PlayerState> = {
        INITIALIZING: "INITIALIZING",
        CONNECTING: "CONNECTING",
        PLAYING: "PLAYING",
        PAUSED: "PAUSED",
        ERROR: "ERROR",
      };
      updatePane(pane.id, {
        playerState: map[state],
        errorCode: extra?.errorCode ?? null,
      });
    },
    [pane.id, updatePane],
  );

  const onReplayEnded = useCallback(() => {
    updatePane(pane.id, { playerState: "PAUSED" });
  }, [pane.id, updatePane]);

  // 再生位置をタイムラインへ反映（1秒スロットル）
  const lastPosRef = useRef(0);
  const replayAtMs = pane.replayAt ? new Date(pane.replayAt).getTime() : null;
  const isReplay = pane.mode === "REPLAY";
  const onTimeUpdate = useCallback(() => {
    if (!isReplay || replayAtMs == null) return;
    const nowMs = Date.now();
    if (nowMs - lastPosRef.current < 1000) return;
    lastPosRef.current = nowMs;
    const t = videoRef.current?.currentTime ?? 0;
    updatePane(pane.id, {
      positionAt: new Date(replayAtMs + t * 1000).toISOString(),
    });
  }, [isReplay, replayAtMs, pane.id, updatePane]);

  useLivePlayer({
    url: liveUrl,
    videoRef,
    onStateChange: onLiveState,
    autoplay: true,
  });
  useReplayPlayer({
    url: replayUrl,
    videoRef,
    playbackRate: pane.playbackRate,
    paused: pane.playerState === "PAUSED",
    onStateChange: onReplayState,
    // FR-021: 末尾到達で自動LIVE切替はせず、一時停止として状態へ反映
    onEnded: onReplayEnded,
  });

  // 画面状態の判定
  // hasFrame（実際のvideoフレーム有無）を考慮: フレームが無い場合は
  // PLAYING/PAUSED でも CONNECTING として扱い、装飾オーバーレイを隠す。
  const screen =
    hasFrame || isDemo ? computeScreen(pane) : computeScreenNoFrame(pane);
  const statusColor = computeStatusColor(pane.playerState);
  const isRecording = source?.recordingStatus === "RECORDING";
  const headerMeta = computeHeaderMeta(pane);

  // REPLAY の現在との差
  const diffSec =
    pane.mode === "REPLAY" && pane.replayAt
      ? (Date.now() - new Date(pane.replayAt).getTime()) / 1000
      : 0;

  const selected = pane.selected;

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-ink-900",
      )}
      style={{
        // REPLAY は青枠で LIVE と一目で区別できるようにする
        boxShadow: selected
          ? `inset 0 0 0 2px ${ACCENT}, 0 0 20px color-mix(in srgb, ${ACCENT} 20%, transparent)`
          : pane.mode === "REPLAY"
            ? `inset 0 0 0 2px ${REPLAY_BLUE}, 0 0 14px color-mix(in srgb, ${REPLAY_BLUE} 25%, transparent)`
            : "inset 0 0 0 1px rgba(255,255,255,.08)",
        cursor: "pointer",
      }}
      onClick={() => selectPane(pane.id)}
      onContextMenu={(e) => e.preventDefault()}
      title={sourceName}
    >
      {/* ===== ヘッダー ===== */}
      <div
        className="flex h-[30px] flex-none items-center gap-[7px] border-b border-white/[.07] px-[9px]"
        style={{
          background: selected
            ? `linear-gradient(180deg, color-mix(in srgb, ${ACCENT} 18%, transparent), color-mix(in srgb, ${ACCENT} 4%, transparent))`
            : "#12161f",
        }}
      >
        <span
          className="flex-none font-mono text-[9.5px] font-bold"
          style={{ color: ACCENT, letterSpacing: ".09em" }}
        >
          {code}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-foreground">
          {sourceName}
        </span>
        <span
          className={cn(
            "flex-none rounded-[2px] px-[5px] py-[2px] font-mono text-[8.5px] font-extrabold",
          )}
          style={{
            letterSpacing: ".12em",
            background:
              pane.mode === "LIVE"
                ? "rgba(236,75,82,.18)"
                : `color-mix(in srgb, ${REPLAY_BLUE} 20%, transparent)`,
            color: pane.mode === "LIVE" ? "#ff6b71" : REPLAY_BLUE,
          }}
        >
          {pane.mode}
        </span>
        <span
          className="flex-none h-[6px] w-[6px] rounded-full"
          style={{ background: statusColor, boxShadow: `0 0 6px ${statusColor}` }}
        />
        <span className="flex-none whitespace-nowrap font-mono text-[10px] text-muted-foreground">
          {headerMeta}
        </span>
        <span className="ml-[2px] flex flex-none gap-px">
          <PaneIconButton title="最大化" onClick={(e) => { e.stopPropagation(); toggleMaximize(pane.id); }}>
            <Maximize2 className="h-3 w-3" />
          </PaneIconButton>
          <PaneIconButton title="ミュート" onClick={(e) => { e.stopPropagation(); updatePane(pane.id, { muted: !pane.muted }); }}>
            {pane.muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
          </PaneIconButton>
          <PaneIconButton title="削除" danger onClick={(e) => { e.stopPropagation(); removePane(pane.id); }}>
            <X className="h-3 w-3" />
          </PaneIconButton>
        </span>
      </div>

      {/* ===== 映像領域 ===== */}
      <div
        className="relative grid min-h-0 flex-1 place-items-center overflow-hidden bg-black"
        style={{ containerType: "size" }}
      >
        <div
          className="relative aspect-video overflow-hidden bg-[#04060a]"
          style={{ width: "min(100cqw, 177.78cqh)" }}
        >
          {/* 実際の video 要素（常に可視。状態はオーバーレイで示す） */}
          <video
            ref={videoRef}
            muted={pane.muted}
            playsInline
            onLoadedData={() => setHasFrame(true)}
            onEmptied={() => setHasFrame(false)}
            onTimeUpdate={onTimeUpdate}
            className="absolute inset-0 h-full w-full object-contain"
          />

          {/* VIDEO オーバーレイ装飾（プレースホルダ演出） */}
          {screen === "VIDEO" && (
            <VideoOverlay
              accent={ACCENT}
              rec={pane.mode === "LIVE" && isRecording}
              now={pane.mode === "LIVE"}
              replayAt={pane.replayAt}
              warn={
                pane.mode === "LIVE" && !isRecording
                  ? `録画が停止しています（最終録画 ${clockJST(Date.now() - 60000, false)}）`
                  : null
              }
            />
          )}

          {/* CONNECTING */}
          {screen === "CONNECTING" && (
            <CenterStatus
              spinner
              bigText={
                pane.playerState === "RECONNECTING"
                  ? "再接続しています"
                  : "カメラに接続しています"
              }
              metaText={
                pane.playerState === "RECONNECTING"
                  ? "最終映像受信 " + clockJST(Date.now() - 186000, false)
                  : "MediaMTX へ接続中…"
              }
            />
          )}

          {/* OFFLINE: NO SIGNAL */}
          {screen === "OFFLINE" && (
            <NoSignal
              bigText="カメラに接続できません"
              metaText={
                "最終映像受信 " +
                dateISOJST(pane.lastFrameAt) +
                " " +
                clockJST(pane.lastFrameAt ? new Date(pane.lastFrameAt).getTime() : Date.now())
              }
            />
          )}

          {/* ERROR */}
          {screen === "ERROR" && (
            <ErrorScreen
              bigText={errorCodeToMessage(pane.errorCode)}
              metaText={pane.errorCode ?? "INTERNAL_ERROR"}
            />
          )}

          {/* GAP: 録画欠損 */}
          {screen === "GAP" && (
            <CenterStatus
              gap
              label="NO RECORDING"
              bigText="この時刻には録画がありません"
              metaText="前後に録画がありません"
            />
          )}
        </div>
      </div>

      {/* REPLAY 差分表示（FR-019） */}
      {pane.mode === "REPLAY" && pane.replayAt && (
        <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 font-mono text-[10px]">
          <div className="text-foreground">{diffShort(diffSec)}</div>
        </div>
      )}
    </div>
  );
}

// ===== ヘッダー小ボタン =====
function PaneIconButton({
  children,
  title,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: (e: React.MouseEvent) => void;
  danger?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={cn(
        "grid h-5 w-5 place-items-center rounded-[3px] border-none bg-transparent p-0 text-muted-foreground transition-colors hover:bg-white/[.09] hover:text-foreground",
        danger && "hover:bg-danger/20 hover:text-live",
      )}
    >
      {children}
    </button>
  );
}

// ===== 画面状態判定 =====
function computeScreen(pane: PaneState): "VIDEO" | "CONNECTING" | "OFFLINE" | "ERROR" | "GAP" {
  const ps = pane.playerState;
  if (ps === "ERROR") return "ERROR";
  if (ps === "UNAVAILABLE") return "OFFLINE";
  if (ps === "CONNECTING" || ps === "RECONNECTING" || ps === "INITIALIZING")
    return "CONNECTING";
  // PLAYING / PAUSED
  return "VIDEO";
}

/**
 * videoフレームが未受信の時の画面状態判定。
 * playerStateがPLAYING/PAUSEDでも、実際のフレームが無い場合は
 * CONNECTINGとして扱い、装飾オーバーレイを隠す。
 * ERROR/UNAVAILABLEはそのまま。
 */
function computeScreenNoFrame(
  pane: PaneState,
): "VIDEO" | "CONNECTING" | "OFFLINE" | "ERROR" | "GAP" {
  const ps = pane.playerState;
  if (ps === "ERROR") return "ERROR";
  if (ps === "UNAVAILABLE") return "OFFLINE";
  // PLAYING/PAUSEDだがフレーム無し → CONNECTING（ぐるぐる表示）
  return "CONNECTING";
}

function computeStatusColor(ps: PlayerState): string {
  if (ps === "UNAVAILABLE" || ps === "ERROR") return "#ec4b52";
  if (ps === "CONNECTING" || ps === "RECONNECTING") return "#e6a53a";
  return "#46c98b";
}

function computeHeaderMeta(pane: PaneState): string {
  if (pane.mode === "LIVE") {
    switch (pane.playerState) {
      case "PLAYING":
        return "受信中";
      case "CONNECTING":
        return "接続中";
      case "RECONNECTING":
        return "再接続中";
      case "UNAVAILABLE":
        return "接続なし";
      case "ERROR":
        return "エラー";
      default:
        return "初期化中";
    }
  }
  // REPLAY
  const diffSec =
    pane.replayAt != null
      ? (Date.now() - new Date(pane.replayAt).getTime()) / 1000
      : 0;
  const base = diffShort(diffSec);
  return pane.playerState === "PAUSED" ? `❚❚ ${base}` : base;
}

function sourceCode(sourceId: string | null, index: number): string {
  if (sourceId == null) return "CAM--";
  return `CAM-${pad(index + 1)}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** UTC ISO を MediaMTX playback 用の JST ISO8601 へ変換（URLエンコード済み）。 */
function utcToJst(utcIso: string): string {
  const d = new Date(utcIso);
  // JST = UTC + 9時間
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const s = jst.toISOString().replace("T", "T").replace(/\.\d+Z$/, "+09:00");
  return encodeURIComponent(s);
}

// ===== VIDEO オーバーレイ（監視映像の装飾） =====
function VideoOverlay({
  accent,
  rec,
  now,
  replayAt,
  warn,
}: {
  accent: string;
  rec: boolean;
  now: boolean;
  replayAt: string | null;
  warn: string | null;
}) {
  const t = now ? Date.now() : replayAt ? new Date(replayAt).getTime() : Date.now();
  return (
    <div className="pointer-events-none absolute inset-0">
      {/* スキャンライン */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg,rgba(120,170,255,.045) 0 1px,transparent 1px 38px),repeating-linear-gradient(90deg,rgba(120,170,255,.045) 0 1px,transparent 1px 38px)",
        }}
      />
      {/* ドリフト光 */}
      <div
        className="absolute inset-[-20%] opacity-50"
        style={{
          background:
            "radial-gradient(120% 90% at 30% 20%,rgba(60,110,180,.28),transparent 55%),radial-gradient(100% 80% at 80% 90%,rgba(80,60,140,.22),transparent 60%)",
          animation: "rp-drift 9s ease-in-out infinite alternate",
        }}
      />
      {/* ビネット */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(130% 110% at 50% 50%,transparent 55%,rgba(0,0,0,.6) 100%)",
        }}
      />
      {/* クロスヘア */}
      <div className="absolute left-0 top-1/2 h-px w-full bg-[rgba(150,190,255,.14)]" />
      <div className="absolute left-1/2 top-0 h-full w-px bg-[rgba(150,190,255,.14)]" />
      <div className="absolute left-1/2 top-1/2 h-[34px] w-[34px] -translate-x-1/2 -translate-y-1/2 border border-[rgba(150,190,255,.35)]" />
      {/* スキャンバー */}
      <div
        className="absolute left-0 right-0 h-[2px]"
        style={{
          background: `linear-gradient(90deg,transparent,${accent},transparent)`,
          opacity: 0.5,
          boxShadow: `0 0 10px ${accent}`,
          animation: "rp-scan 5.5s linear infinite",
        }}
      />
      {/* 四隅のコーナーマーク */}
      <Corner className="left-[9px] top-2 border-l-2 border-t-2" />
      <Corner className="right-[9px] top-2 border-r-2 border-t-2" />
      <Corner className="bottom-2 left-[9px] border-b-2 border-l-2" />
      <Corner className="bottom-2 right-[9px] border-b-2 border-r-2" />

      {/* REC 表示 */}
      {rec && (
        <div
          className="absolute left-8 top-3 flex items-center gap-[5px] font-mono text-[9.5px]"
          style={{ color: "#ff6b71", letterSpacing: ".08em" }}
        >
          <span
            className="h-[7px] w-[7px] rounded-full bg-danger animate-rp-blink"
            style={{ boxShadow: "0 0 7px #ec4b52" }}
          />
          REC
        </div>
      )}

      {/* タイムコード */}
      <div className="absolute bottom-3 right-[14px] text-right font-mono leading-[1.15]">
        <div className="text-[9px] text-muted-ink" style={{ letterSpacing: ".06em" }}>
          {dateISOJST(new Date(t).toISOString())}
        </div>
        <div
          className="text-[15px] font-medium text-[rgba(220,232,255,.92)]"
          style={{ letterSpacing: ".04em", textShadow: "0 0 8px rgba(0,0,0,.8)" }}
        >
          {clockJST(t)}
        </div>
      </div>

      {/* 録画停止警告バー */}
      {warn && (
        <div className="absolute bottom-0 left-0 right-0 flex items-center gap-[7px] border-t border-warn/50 bg-gradient-to-t from-[rgba(20,14,4,.94)] to-[rgba(20,14,4,.5)] px-[10px] py-[5px] text-[11px] text-[#f0c070]">
          <span
            className="font-mono text-[9px] font-bold text-warn"
            style={{ letterSpacing: ".1em" }}
          >
            ⚠ REC STOP
          </span>
          {warn}
        </div>
      )}
    </div>
  );
}

function Corner({ className }: { className: string }) {
  return (
    <div
      className={cn("absolute h-4 w-4 border-[rgba(150,190,255,.45)]", className)}
    />
  );
}

// ===== 共通中央ステータス =====
function CenterStatus({
  bigText,
  metaText,
  spinner,
  gap,
  label,
}: {
  bigText: string;
  metaText: string;
  spinner?: boolean;
  gap?: boolean;
  label?: string;
}) {
  return (
    <div
      className={cn(
        "absolute inset-0 flex flex-col items-center justify-center gap-3.5",
        gap
          ? "bg-ink-900"
          : "bg-[#05080d]",
      )}
      style={
        gap
          ? {
              backgroundImage:
                "repeating-linear-gradient(-45deg,rgba(255,255,255,.028) 0 14px,transparent 14px 28px)",
            }
          : undefined
      }
    >
      {label && (
        <div
          className="font-mono text-[10px] font-bold"
          style={{ color: "#5a6478", letterSpacing: ".16em" }}
        >
          {label}
        </div>
      )}
      {spinner && (
        <div
          className="h-[34px] w-[34px] rounded-full border-2 border-[rgba(120,160,220,.2)] animate-rp-spin"
          style={{ borderTopColor: ACCENT }}
        />
      )}
      <div className="px-4 text-center text-[13px] text-[#c3ccdb]">{bigText}</div>
      <div
        className="font-mono text-[10px]"
        style={{ color: "#6f7889", letterSpacing: ".05em" }}
      >
        {metaText}
      </div>
    </div>
  );
}

// ===== NO SIGNAL 画面 =====
function NoSignal({ bigText, metaText }: { bigText: string; metaText: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0805]">
      <StripeBar position="top" color="#FF0066" />
      <StripeBar position="bottom" color="#FF0066" />
      <div
        className="font-mono text-2xl font-extrabold text-[#FF0066]"
        style={{
          letterSpacing: ".2em",
          textShadow: "0 0 22px rgba(255,0,102,.4)",
          paddingLeft: ".2em",
        }}
      >
        NO SIGNAL
      </div>
      <div className="mt-3 text-[12.5px] text-[#c8b48a]">{bigText}</div>
      <div
        className="mt-1.5 font-mono text-[10px]"
        style={{ color: "#8a7f66", letterSpacing: ".04em" }}
      >
        {metaText}
      </div>
    </div>
  );
}

// ===== ERROR 画面 =====
function ErrorScreen({ bigText, metaText }: { bigText: string; metaText: string }) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center"
      style={{
        background: "radial-gradient(120% 100% at 50% 40%,rgba(90,20,24,.55),#0a0507)",
      }}
    >
      <StripeBar position="top" color="#ec4b52" />
      <StripeBar position="bottom" color="#ec4b52" />
      <div
        className="font-mono text-2xl font-extrabold text-live"
        style={{
          letterSpacing: ".22em",
          textShadow: "0 0 22px rgba(236,75,82,.45)",
          paddingLeft: ".22em",
        }}
      >
        ERROR
      </div>
      <div className="mt-3 px-4 text-center text-[12.5px] text-[#f0b8bb]">
        {bigText}
      </div>
      <div
        className="mt-1.5 font-mono text-[10px]"
        style={{ color: "#b98a8d", letterSpacing: ".06em" }}
      >
        {metaText}
      </div>
    </div>
  );
}

function StripeBar({
  position,
  color,
}: {
  position: "top" | "bottom";
  color: string;
}) {
  return (
    <div
      className={cn("absolute left-0 right-0 h-[9px]", position === "top" ? "top-0" : "bottom-0")}
      style={{
        backgroundImage: `repeating-linear-gradient(-45deg,${color} 0 11px,#16130a 11px 22px)`,
        opacity: position === "top" ? 0.9 : 0.85,
      }}
    />
  );
}
