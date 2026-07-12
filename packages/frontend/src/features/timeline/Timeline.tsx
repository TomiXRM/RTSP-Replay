/**
 * 共通タイムライン（SPEC 15章, FR-026, FR-027 + monitor_sample.html デザイン準拠）。
 *
 * 直近2時間。録画区間（緑グラデ）・欠損（赤斜線）・目盛り・イベント（黄三角）・
 * LIVE位置（赤）・再生ヘッド（三角）・凡例。
 */

import { useEffect, useRef, useState } from "react";

import { api } from "@/api/client";
import { useSystemStore } from "@/store/system";
import { useSelectedPane } from "@/store/workspace";
import { useWorkspaceStore } from "@/store/workspace";
import type { TimelineEvent } from "@/types/api";
import type { RecordingRanges } from "@/types/source";
import { clamp01, clockJST } from "@/lib/utils";

const ACCENT = "#c9ff05";
const EVENT_COLOR = "#e6a53a";

export function Timeline() {
  const selected = useSelectedPane();
  const seekTo = useWorkspaceStore((s) => s.seekTo);
  const panes = useWorkspaceStore((s) => s.panes);
  // 表示ウィンドウ = 録画保持期間（.env RECORDING_RETENTION_HOURS と連動）
  const retentionH = useSystemStore((s) => s.health?.retentionHours ?? 2);
  const WIN = retentionH * 3600 * 1000;
  const [ranges, setRanges] = useState<RecordingRanges | null>(null);
  const [eventList, setEventList] = useState<TimelineEvent[]>([]);
  const [now, setNow] = useState(Date.now());
  const ref = useRef<HTMLDivElement>(null);

  // イベントをバックエンドから取得（10秒ポーリング）
  useEffect(() => {
    let cancelled = false;
    const fetch = () =>
      api
        .getEvents(retentionH)
        .then((r) => !cancelled && setEventList(r.events))
        .catch(() => {});
    void fetch();
    const t = window.setInterval(fetch, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [retentionH]);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!selected?.sourceId) {
      setRanges(null);
      return;
    }
    api
      .getRecordingRanges(selected.sourceId)
      .then((r) => !cancelled && setRanges(r))
      .catch(() => !cancelled && setRanges(null));
    return () => {
      cancelled = true;
    };
  }, [selected?.sourceId]);

  const ws = now - WIN;
  const pct = (t: number) => clamp01((t - ws) / WIN) * 100;

  // 録画区間
  const recRanges = (ranges?.ranges ?? []).map((r) => ({
    left: `${pct(new Date(r.start).getTime()).toFixed(2)}%`,
    width: `${(pct(new Date(r.end).getTime()) - pct(new Date(r.start).getTime())).toFixed(2)}%`,
  }));

  // 欠損区間（録画区間の補集合）
  const gaps: { left: string; width: string }[] = [];
  if (ranges?.ranges.length) {
    let cur = ws;
    for (const r of ranges.ranges) {
      const a = new Date(r.start).getTime();
      if (a > cur && a - cur > 1000) {
        gaps.push({
          left: `${pct(cur).toFixed(2)}%`,
          width: `${(pct(a) - pct(cur)).toFixed(2)}%`,
        });
      }
      cur = Math.max(cur, new Date(r.end).getTime());
    }
    if (cur < now && now - cur > 1000) {
      gaps.push({
        left: `${pct(cur).toFixed(2)}%`,
        width: `${(pct(now) - pct(cur)).toFixed(2)}%`,
      });
    }
  }

  // 目盛り（15分おき × 9）
  const ticks = Array.from({ length: 9 }, (_, i) => ({
    left: `${(i * 12.5).toFixed(2)}%`,
    label: clockJST(ws + (i * WIN) / 8, false),
  }));

  // イベント
  const events = eventList
    .map((e) => ({
      pctNum: pct(new Date(e.ts).getTime()),
      color: EVENT_COLOR,
      label: `${clockJST(new Date(e.ts).getTime())} ${e.label}`,
    }))
    .filter((e) => e.pctNum >= 0 && e.pctNum <= 100)
    .map((e) => ({ ...e, left: `${e.pctNum.toFixed(2)}%` }));

  // 再生ヘッド（全REPLAY Pane）。positionAt があれば実再生位置に追従する。
  const playheads = panes
    .filter((p) => p.mode === "REPLAY" && (p.positionAt ?? p.replayAt))
    .map((p) => ({
      left: `${pct(new Date((p.positionAt ?? p.replayAt)!).getTime()).toFixed(2)}%`,
      bg: p.selected ? ACCENT : "rgba(180,192,214,.5)",
    }));

  const focusName = selected?.sourceName ?? "—";

  // ドラッグシーク（YouTube風）: ドラッグ中はプレビュー線を表示し、離した位置へシーク
  const [dragMs, setDragMs] = useState<number | null>(null);

  const timeAtX = (clientX: number): number => {
    const rect = ref.current!.getBoundingClientRect();
    const frac = clamp01((clientX - rect.left) / rect.width);
    return Math.min(ws + frac * WIN, now - 1000);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!selected || !ref.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragMs(timeAtX(e.clientX));
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (dragMs == null || !ref.current) return;
    setDragMs(timeAtX(e.clientX));
  };
  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragMs == null || !ref.current) return;
    // SPEC FR-023: SYNCED時は全REPLAY Paneを同時刻へ。INDEPENDENT時は選択中Paneのみ。
    seekTo(new Date(timeAtX(e.clientX)).toISOString());
    setDragMs(null);
  };

  return (
    <div className="bg-ink-900 px-[18px] py-[14px] pt-2">
      {/* ヘッダー行 */}
      <div className="mb-[5px] flex items-baseline justify-between">
        <span className="font-mono text-[9.5px] text-muted-ink" style={{ letterSpacing: ".09em" }}>
          TIMELINE · 直近{formatHours(retentionH)} · {focusName}
        </span>
        <span className="font-mono text-[9.5px] text-[#5a6478]">
          {clockJST(ws, false)} → {clockJST(now, false)} LIVE
        </span>
      </div>

      {/* バー */}
      <div
        ref={ref}
        className="relative h-[52px] cursor-crosshair overflow-hidden rounded-[5px] border border-white/[.08] bg-surface"
        style={{ touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => setDragMs(null)}
      >
        {/* 録画区間 */}
        {recRanges.map((r, i) => (
          <div
            key={`r${i}`}
            className="absolute bottom-[14px] top-[14px]"
            style={{
              left: r.left,
              width: r.width,
              background:
                "linear-gradient(180deg,rgba(70,201,139,.32),rgba(70,201,139,.15))",
              borderLeft: "1px solid rgba(70,201,139,.45)",
              borderRight: "1px solid rgba(70,201,139,.45)",
            }}
          />
        ))}

        {/* 欠損区間 */}
        {gaps.map((g, i) => (
          <div
            key={`g${i}`}
            className="absolute bottom-[14px] top-[14px]"
            style={{
              left: g.left,
              width: g.width,
              backgroundImage:
                "repeating-linear-gradient(-45deg,rgba(236,75,82,.22) 0 6px,transparent 6px 12px)",
              borderLeft: "1px dashed rgba(236,75,82,.4)",
              borderRight: "1px dashed rgba(236,75,82,.4)",
            }}
          />
        ))}

        {/* 目盛り */}
        {ticks.map((t, i) => (
          <div key={`t${i}`}>
            <div
              className="absolute bottom-0 top-0 w-px bg-white/[.055]"
              style={{ left: t.left }}
            />
            <div
              className="absolute top-[2px] font-mono text-[8.5px] text-[#5a6478]"
              style={{ left: t.left, transform: "translateX(3px)" }}
            >
              {t.label}
            </div>
          </div>
        ))}

        {/* イベント */}
        {events.map((e, i) => (
          <div
            key={`e${i}`}
            className="absolute bottom-[2px]"
            style={{ left: e.left, transform: "translateX(-50%)" }}
            title={e.label}
          >
            <div
              style={{
                width: 0,
                height: 0,
                borderLeft: "4px solid transparent",
                borderRight: "4px solid transparent",
                borderBottom: `6px solid ${e.color}`,
              }}
            />
            <div
              className="absolute bottom-1.5 left-1/2 w-[2px] opacity-45"
              style={{ height: 24, background: e.color, transform: "translateX(-50%)" }}
            />
          </div>
        ))}

        {/* LIVE 位置 */}
        <div
          className="absolute bottom-0 top-0 right-0 w-[2px] bg-danger"
          style={{ boxShadow: "0 0 8px #ec4b52" }}
        />
        <div className="absolute right-[5px] top-[3px] font-mono text-[8.5px] font-bold text-live">
          LIVE
        </div>

        {/* ドラッグ中のプレビュー */}
        {dragMs != null && (
          <>
            <div
              className="absolute bottom-0 top-0 w-[2px]"
              style={{
                left: `${pct(dragMs).toFixed(2)}%`,
                background: "#fff",
                boxShadow: "0 0 8px rgba(255,255,255,.6)",
              }}
            />
            <div
              className="absolute top-[14px] rounded-[3px] bg-black/80 px-1.5 py-0.5 font-mono text-[10px] text-foreground"
              style={{
                left: `${pct(dragMs).toFixed(2)}%`,
                transform: "translateX(-50%)",
              }}
            >
              {clockJST(dragMs)}
            </div>
          </>
        )}

        {/* 再生ヘッド */}
        {playheads.map((p, i) => (
          <div key={`p${i}`}>
            <div
              className="absolute bottom-0 top-0 w-[2px]"
              style={{ left: p.left, background: p.bg, boxShadow: `0 0 8px ${p.bg}` }}
            />
            <div
              className="absolute top-[-1px] h-[9px] w-[9px]"
              style={{
                left: p.left,
                background: p.bg,
                clipPath: "polygon(50% 100%,0 0,100% 0)",
                transform: "translateX(-50%)",
              }}
            />
          </div>
        ))}
      </div>

      {/* 凡例 */}
      <div className="mt-1.5 flex gap-4 font-mono text-[9.5px] text-muted-ink">
        <Legend swatch={<span className="h-2 w-3 rounded-[2px]" style={{ background: "rgba(70,201,139,.4)" }} />}>
          録画あり
        </Legend>
        <Legend
          swatch={
            <span
              className="h-2 w-3 rounded-[2px]"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(-45deg,rgba(236,75,82,.5) 0 4px,transparent 4px 8px)",
              }}
            />
          }
        >
          録画欠損
        </Legend>
        <Legend
          swatch={
            <span
              className="h-2 w-2"
              style={{ background: "#e6a53a", clipPath: "polygon(50% 0,100% 100%,0 100%)" }}
            />
          }
        >
          イベント
        </Legend>
        <Legend
          swatch={
            <span
              className="h-2 w-2"
              style={{ background: ACCENT, clipPath: "polygon(50% 100%,0 0,100% 0)" }}
            />
          }
        >
          再生位置
        </Legend>
      </div>
    </div>
  );
}

function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}分`;
  return Number.isInteger(h) ? `${h}時間` : `${h.toFixed(1)}時間`;
}

function Legend({
  swatch,
  children,
}: {
  swatch: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span className="flex items-center gap-[5px]">
      {swatch}
      {children}
    </span>
  );
}
