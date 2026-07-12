/**
 * Workspace ツールバー + グリッド（SPEC 9章 + monitor_sample.html デザイン準拠）。
 *
 * ワークスペースツールバー: Pane追加 / Pane数 / 同期モード切替（FR-023）
 * グリッド: Pane数→列/行 自動レイアウト（1〜6）+ 空き追加スロット（3,5 Pane時）
 * 最大化時は対象 Pane のみ全画面（FR-009）。
 */

import { Plus } from "lucide-react";
import { useState } from "react";

import { AddPaneDialog } from "@/features/add-pane/AddPaneDialog";
import { Pane } from "@/features/pane/Pane";
import { useWorkspaceStore } from "@/store/workspace";
import { MAX_PANES } from "@/types/pane";
import { cn } from "@/lib/utils";

const ACCENT = "#c9ff05";

const LAYOUTS: Record<number, [string, string]> = {
  1: ["1fr", "1fr"],
  2: ["1fr 1fr", "1fr"],
  3: ["1fr 1fr", "1fr 1fr"],
  4: ["1fr 1fr", "1fr 1fr"],
  5: ["1fr 1fr 1fr", "1fr 1fr"],
  6: ["1fr 1fr 1fr", "1fr 1fr"],
  7: ["1fr 1fr 1fr 1fr", "1fr 1fr"],
  8: ["1fr 1fr 1fr 1fr", "1fr 1fr"],
};

export function WorkspaceShell() {
  const panes = useWorkspaceStore((s) => s.panes);
  const syncMode = useWorkspaceStore((s) => s.syncMode);
  const setSyncMode = useWorkspaceStore((s) => s.setSyncMode);
  const maximizedPane = panes.find((p) => p.maximized);
  const [addOpen, setAddOpen] = useState(false);

  const atMax = panes.length >= MAX_PANES;

  return (
    <>
      {/* ワークスペースツールバー */}
      <div className="flex h-[46px] flex-none items-center gap-3 border-b border-white/[.06] bg-ink-900 px-[18px]">
        <button
          onClick={() => !atMax && setAddOpen(true)}
          disabled={atMax}
          className={cn(
            "flex items-center gap-[7px] rounded-[6px] px-3.5 py-2 text-[12.5px] font-bold",
            atMax && "cursor-not-allowed",
          )}
          style={
            atMax
              ? { border: "1px solid rgba(255,255,255,.08)", background: "#0c0f16", color: "#4a5262" }
              : {
                  border: `1px solid ${ACCENT}`,
                  background: `color-mix(in srgb, ${ACCENT} 15%, transparent)`,
                  color: ACCENT,
                }
          }
        >
          <Plus className="h-4 w-4" />
          Paneを追加
        </button>
        <span
          className="font-mono text-[11px]"
          style={{ color: atMax ? "#e6a53a" : "#6f7889" }}
        >
          {atMax
            ? `${MAX_PANES} / ${MAX_PANES} Pane · 最大${MAX_PANES}画面まで表示できます`
            : `${panes.length} / ${MAX_PANES} Pane`}
        </span>

        <div className="flex-1" />

        <span className="text-[11px] text-muted-ink">同期モード</span>
        <div className="flex gap-0.5 rounded-[7px] border border-white/[.08] bg-surface p-[3px]">
          <SyncBtn active={syncMode === "INDEPENDENT"} onClick={() => setSyncMode("INDEPENDENT")}>
            INDEPENDENT
          </SyncBtn>
          <SyncBtn active={syncMode === "SYNCED"} onClick={() => setSyncMode("SYNCED")}>
            SYNCED
          </SyncBtn>
        </div>
      </div>

      {/* グリッド */}
      <div className="relative min-h-0 flex-1 p-3.5">
        {panes.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-4 text-center">
              <p className="text-muted-foreground">監視画面へPaneを追加してください</p>
              <button
                onClick={() => setAddOpen(true)}
                className="flex items-center gap-2 rounded-[6px] px-3.5 py-2 text-[12.5px] font-bold"
                style={{
                  border: `1px solid ${ACCENT}`,
                  background: `color-mix(in srgb, ${ACCENT} 15%, transparent)`,
                  color: ACCENT,
                }}
              >
                <Plus className="h-4 w-4" />
                Paneを追加
              </button>
            </div>
          </div>
        ) : maximizedPane ? (
          <div className="h-full min-h-0">
            <Pane key={maximizedPane.id} pane={maximizedPane} />
          </div>
        ) : (
          <div
            className="grid h-full gap-3"
            style={{
              gridTemplateColumns: LAYOUTS[panes.length]?.[0] ?? LAYOUTS[6][0],
              gridTemplateRows: LAYOUTS[panes.length]?.[1] ?? LAYOUTS[6][1],
            }}
          >
            {panes.map((p) => (
              <Pane key={p.id} pane={p} />
            ))}
            {/* グリッドに空きセルが出る奇数Pane数のとき、追加スロットを表示 */}
            {panes.length >= 3 && panes.length % 2 === 1 && panes.length < MAX_PANES && (
              <button
                onClick={() => setAddOpen(true)}
                className="flex min-h-[120px] min-w-0 flex-col items-center justify-center gap-2.5 rounded-[5px] border-[1.5px] border-dashed border-white/[.14] text-muted-ink transition-colors hover:border-accent hover:text-accent"
                style={{ background: "rgba(255,255,255,.012)" }}
              >
                <Plus className="h-7 w-7 font-light" />
                <span className="text-[12.5px] font-semibold">Paneを追加</span>
              </button>
            )}
          </div>
        )}
      </div>

      <AddPaneDialog open={addOpen} onOpenChange={setAddOpen} />
    </>
  );
}

function SyncBtn({
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
      className="rounded-[5px] border-none px-[13px] py-1.5 font-mono text-[10.5px] font-bold"
      style={
        active
          ? { background: ACCENT, color: "#04060a", letterSpacing: ".05em" }
          : { background: "transparent", color: "#8b93a3", letterSpacing: ".05em" }
      }
    >
      {children}
    </button>
  );
}
