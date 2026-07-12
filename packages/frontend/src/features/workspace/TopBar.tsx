/**
 * トップバー（monitor_sample.html デザイン準拠）。
 *
 * ロゴ / ビュー切替（ワークスペース・状態カタログ） /
 * カメラ状態 / 録画ディスク / 監視サーバー / JST時計。
 */

import { Settings } from "lucide-react";
import { useEffect, useState } from "react";

import { SourcesTomlDialog } from "@/features/settings/SourcesTomlDialog";
import { useSystemStore } from "@/store/system";
import { cn, clockJST } from "@/lib/utils";

const ACCENT = "#c9ff05";

export type View = "workspace" | "catalog" | "events";

export function TopBar({
  view,
  onView,
}: {
  view: View;
  onView: (v: View) => void;
}) {
  const health = useSystemStore((s) => s.health);
  const apiDown = useSystemStore((s) => s.apiDown);
  const sources = useSystemStore((s) => s.sources);
  const [now, setNow] = useState(Date.now());
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const online = sources.filter((s) => s.status === "ONLINE").length;
  const total = sources.length;
  const camColor = online === total && total > 0 ? "#46c98b" : "#e6a53a";
  const camText = `${online}/${total}`;

  const diskPct = health?.disk?.usedPercent ?? 0;
  const diskStatus = health?.disk?.status ?? "unknown";
  const diskColor =
    diskStatus === "critical" ? "#ec4b52" : diskStatus === "warning" ? "#e6a53a" : "#46c98b";

  const backColor = apiDown ? "#ec4b52" : "#46c98b";

  return (
    <div className="flex h-[52px] flex-none items-center gap-[18px] border-b border-white/[.08] bg-ink-850 px-[18px]">
      {/* ロゴ */}
      <div className="flex items-center gap-2.5">
        <div
          className="grid h-[26px] w-[26px] place-items-center"
          style={{ border: `1.5px solid ${ACCENT}` }}
        >
          <div className="h-[9px] w-[9px]" style={{ background: ACCENT }} />
        </div>
        <div className="leading-[1.05]">
          <div
            className="font-mono text-[13px] font-extrabold"
            style={{ letterSpacing: ".16em" }}
          >
            REPLAY MONITOR
          </div>
        </div>
      </div>

      {/* ビュー切替 */}
      <div className="flex gap-0.5 rounded-[7px] border border-white/[.07] bg-surface p-[3px]">
        <ViewBtn active={view === "workspace"} onClick={() => onView("workspace")}>
          ワークスペース
        </ViewBtn>
        <ViewBtn active={view === "events"} onClick={() => onView("events")}>
          イベント
        </ViewBtn>
        <ViewBtn active={view === "catalog"} onClick={() => onView("catalog")}>
          状態カタログ
        </ViewBtn>
      </div>

      <div className="flex-1" />

      {/* システム状態 */}
      <div className="flex items-center gap-[9px]">
        {/* カメラ */}
        <StatusChip>
          <span
            className="h-[7px] w-[7px] rounded-full"
            style={{ background: camColor, boxShadow: `0 0 6px ${camColor}` }}
          />
          <span className="text-[11px] text-[#b7becc]">カメラ</span>
          <span className="font-mono text-[11.5px] font-bold text-foreground">
            {camText}
          </span>
        </StatusChip>

        {/* ディスク */}
        <StatusChip>
          <span className="text-[11px] text-[#b7becc]">録画ディスク</span>
          <span className="relative h-[6px] w-[52px] overflow-hidden rounded-[3px] bg-ink-600">
            <span
              className="absolute bottom-0 left-0 top-0"
              style={{ width: `${diskPct}%`, background: diskColor }}
            />
          </span>
          <span
            className="font-mono text-[11.5px] font-bold"
            style={{ color: diskColor }}
          >
            {diskPct > 0 ? `${diskPct}%` : "—"}
          </span>
        </StatusChip>

        {/* 監視サーバー */}
        <StatusChip>
          <span
            className="h-[7px] w-[7px] rounded-full"
            style={{ background: backColor, boxShadow: `0 0 6px ${backColor}` }}
          />
          <span className="text-[11px] text-[#b7becc]">監視サーバー</span>
        </StatusChip>

        {/* カメラ設定（sources.toml 編集） */}
        <button
          title="カメラ設定（sources.toml）を編集"
          onClick={() => setSettingsOpen(true)}
          className="grid h-[30px] w-[30px] place-items-center rounded-[7px] border border-white/[.07] bg-surface text-muted-foreground transition-colors hover:border-white/25 hover:text-foreground"
        >
          <Settings className="h-[15px] w-[15px]" />
        </button>

        {/* 時計 */}
        <div className="pl-1.5 text-right leading-[1.1]">
          <div className="font-mono text-[16px] font-bold tracking-[.04em]">
            {clockJST(now)}
          </div>
          <div className="text-[9.5px] text-white/[.85]" style={{ letterSpacing: ".05em" }}>
            {dateJP(now)} JST
          </div>
        </div>
      </div>

      <SourcesTomlDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}

function dateJP(ms: number): string {
  const j = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(ms));
  return j;
}

function ViewBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-[5px] border-none px-3.5 py-1.5 text-[12px] font-semibold",
      )}
      style={
        active
          ? { background: ACCENT, color: "#04060a" }
          : { background: "transparent", color: "#8b93a3" }
      }
    >
      {children}
    </button>
  );
}

function StatusChip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-[7px] border border-white/[.07] bg-surface px-[11px] py-1.5">
      {children}
    </div>
  );
}
