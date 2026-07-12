/**
 * 共通再生コントローラー（SPEC 18, 20章 + monitor_sample.html デザイン準拠）。
 *
 * 操作対象表示（FR-025） + トランスポート（◀◀ ◀ ▶/❚❚ ▶ ▶▶） +
 * 速度（0.5/1/2/4×） + 事故保存 + ライブへ戻る。
 *
 * 同期制御は workspace store の action へ一元化（FR-023, FR-024）:
 *  SYNCED時は全REPLAY Pane、INDEPENDENT時は選択中Paneのみへ適用。
 */

import { useWorkspaceStore } from "@/store/workspace";
import {
  PLAYBACK_RATES,
  useSelectedPane,
  useSyncedPanes,
} from "@/store/workspace";
import { cn } from "@/lib/utils";

const ACCENT = "#c9ff05";

export function CommonControls({
  onOpenIncident,
}: {
  onOpenIncident: () => void;
}) {
  const selected = useSelectedPane();
  const synced = useSyncedPanes();
  const syncMode = useWorkspaceStore((s) => s.syncMode);
  const seekByDelta = useWorkspaceStore((s) => s.seekByDelta);
  const playPause = useWorkspaceStore((s) => s.playPause);
  const setPlaybackRate = useWorkspaceStore((s) => s.setPlaybackRate);
  const backToLive = useWorkspaceStore((s) => s.backToLive);
  const allToReplay = useWorkspaceStore((s) => s.allToReplay);
  const anyLive = useWorkspaceStore((s) => s.panes.some((p) => p.mode === "LIVE"));

  // 適用先（FR-023/024）
  const targets =
    syncMode === "SYNCED" && synced.length > 0
      ? synced
      : selected
        ? [selected]
        : [];
  const anyPlaying = targets.some((p) => p.playerState === "PLAYING");

  // 操作対象ラベル（FR-025）
  const opLabel =
    syncMode === "SYNCED" && synced.length > 0
      ? `操作対象：同期中の${synced.length} Pane`
      : selected
        ? "操作対象：選択中Pane"
        : "操作対象：Paneなし";
  const opSub =
    syncMode === "SYNCED" && synced.length > 0
      ? synced.map((p) => p.sourceName ?? p.sourceId).join(" ・ ")
      : selected
        ? `${selected.sourceName ?? selected.sourceId} · ${selected.mode}`
        : "";

  const rate = targets[0]?.playbackRate ?? 1;

  return (
    <div className="flex flex-wrap items-center gap-3.5 border-t border-white/[.08] bg-ink-900 px-[18px] pt-[11px] pb-[9px]">
      {/* 操作対象（FR-025） */}
      <div className="min-w-[236px] leading-tight">
        <div className="flex items-center gap-[7px] text-[12px] font-bold text-foreground">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: ACCENT }}
          />
          {opLabel}
        </div>
        <div className="mt-0.5 max-w-[260px] truncate overflow-hidden text-[10.5px] text-[#7b8395]">
          {opSub}
        </div>
      </div>

      {/* トランスポート */}
      <div className="flex items-center gap-[5px]">
        <TrBtn title="1分戻る" onClick={() => seekByDelta(-60)}>
          ◀◀
        </TrBtn>
        <TrBtn title="10秒戻る" onClick={() => seekByDelta(-10)}>
          ◀
        </TrBtn>
        <button
          title="再生 / 一時停止"
          onClick={playPause}
          disabled={targets.length === 0}
          className="grid h-[34px] w-12 place-items-center rounded-[6px] border-none font-mono text-[13px] font-extrabold disabled:opacity-40"
          style={{ background: ACCENT, color: "#04060a", letterSpacing: "1px" }}
        >
          {anyPlaying ? "❚❚" : "▶"}
        </button>
        <TrBtn title="10秒進む" onClick={() => seekByDelta(10)}>
          ▶
        </TrBtn>
        <TrBtn title="1分進む" onClick={() => seekByDelta(60)}>
          ▶▶
        </TrBtn>
      </div>

      {/* 速度 */}
      <div className="flex gap-0.5 rounded-[7px] border border-white/[.08] bg-surface p-[3px]">
        {PLAYBACK_RATES.map((r) => (
          <button
            key={r}
            onClick={() => setPlaybackRate(r)}
            className={cn(
              "rounded-[5px] border-none px-2.5 py-1.5 font-mono text-[11px] font-bold",
            )}
            style={
              rate === r
                ? { background: ACCENT, color: "#04060a", fontWeight: 800 }
                : { background: "transparent", color: "#8b93a3" }
            }
          >
            {r}×
          </button>
        ))}
      </div>

      <div className="flex-1" />

      {/* 事故保存 */}
      <button
        onClick={onOpenIncident}
        className="rounded-[6px] border border-white/[.14] bg-ink-700 px-[13px] py-2 text-[12px] font-semibold text-[#c3ccdb] transition-colors hover:border-warn hover:text-warn"
      >
        ◈ 映像を保存
      </button>

      {/* 全てリプレイへ */}
      <button
        onClick={allToReplay}
        disabled={!anyLive}
        className="rounded-[6px] border border-white/[.14] bg-ink-700 px-[13px] py-2 text-[12px] font-semibold text-[#c3ccdb] transition-colors disabled:opacity-40"
        style={{ borderColor: anyLive ? "rgba(61,165,255,.45)" : undefined, color: anyLive ? "#8ec8ff" : undefined }}
        title="LIVE中の全Paneを一括でリプレイへ切替"
      >
        ⏪ 全てリプレイ
      </button>

      {/* ライブへ戻る */}
      <button
        onClick={backToLive}
        disabled={!selected || selected.mode === "LIVE"}
        className="rounded-[6px] border border-white/[.14] bg-ink-700 px-[15px] py-2 text-[12px] font-semibold text-foreground transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
      >
        ● ライブへ戻る
      </button>
    </div>
  );
}

function TrBtn({
  children,
  title,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="grid h-[34px] w-10 place-items-center rounded-[6px] border border-white/[.1] bg-ink-700 font-mono text-[11px] text-[#c3ccdb] transition-colors hover:border-white/30"
    >
      {children}
    </button>
  );
}
