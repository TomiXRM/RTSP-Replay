/**
 * アプリケーションルート（SPEC 5章 + monitor_sample.html デザイン準拠）。
 *
 * TOPバー（ロゴ/ビュー切替/システム状態/時計） +
 * ワークスペース（1〜8 Pane）または状態カタログ +
 * コントローラー + タイムライン。
 */

import { useEffect, useState } from "react";

import { CommonControls } from "@/features/controls/CommonControls";
import { EventsView } from "@/features/events/EventsView";
import { IncidentDialog } from "@/features/incident/IncidentDialog";
import { StateCatalog } from "@/features/status/StateCatalog";
import { Timeline } from "@/features/timeline/Timeline";
import { TopBar, type View } from "@/features/workspace/TopBar";
import { WorkspaceShell } from "@/features/workspace/WorkspaceShell";
import { useSystemStore } from "@/store/system";
import { useWorkspaceStore } from "@/store/workspace";

export default function App() {
  const refresh = useSystemStore((s) => s.refresh);
  const startPolling = useSystemStore((s) => s.startPolling);
  const sources = useSystemStore((s) => s.sources);
  const [view, setView] = useState<View>("workspace");
  const [incidentOpen, setIncidentOpen] = useState(false);

  // 起動時にシステム状態を取得・ポーリング開始（FR-034〜037）
  useEffect(() => {
    void refresh();
    return startPolling(5000);
  }, [refresh, startPolling]);

  // 復元された Pane のうち、存在しないソースを参照しているものをクリーンアップ。
  // localStorage に古い workspace 状態が残っていた場合の救済（FR-029）。
  useEffect(() => {
    if (sources.length === 0) return;
    const validIds = new Set(sources.map((s) => s.id));
    const { panes } = useWorkspaceStore.getState();
    const stale = panes.filter((p) => p.sourceId && !validIds.has(p.sourceId));
    if (stale.length > 0) {
      stale.forEach((p) => useWorkspaceStore.getState().removePane(p.id));
    }
  }, [sources]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-ink-950 text-foreground">
      <TopBar view={view} onView={setView} />

      {view === "workspace" ? (
        <WorkspaceShell />
      ) : view === "events" ? (
        <EventsView />
      ) : (
        <StateCatalog />
      )}

      {/* コントローラー + タイムライン（ワークスペースビューのみ） */}
      {view === "workspace" && (
        <>
          <CommonControls onOpenIncident={() => setIncidentOpen(true)} />
          <Timeline />
        </>
      )}

      <IncidentDialog open={incidentOpen} onOpenChange={setIncidentOpen} />
    </div>
  );
}
