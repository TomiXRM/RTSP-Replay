/**
 * Workspace ストアのテスト（SPEC FR-001, FR-007, FR-009, FR-010, FR-023, FR-024）。
 */

import { beforeEach, describe, expect, it } from "vitest";

import { useWorkspaceStore } from "@/store/workspace";
import { MAX_PANES } from "@/types/pane";

describe("workspace store", () => {
  beforeEach(() => {
    useWorkspaceStore.getState().reset();
    // persist の復元をクリア
    localStorage.clear();
  });

  it("FR-001: MAX_PANES まで追加できる。超過分は null", () => {
    for (let i = 0; i < MAX_PANES; i++) {
      const p = useWorkspaceStore.getState().addPane({ sourceId: `s${i}` });
      expect(p).not.toBeNull();
    }
    expect(useWorkspaceStore.getState().panes).toHaveLength(MAX_PANES);
    const overflow = useWorkspaceStore.getState().addPane({ sourceId: "sx" });
    expect(overflow).toBeNull();
    expect(useWorkspaceStore.getState().panes).toHaveLength(MAX_PANES);
  });

  it("FR-010: 追加した Pane が選択中になる。常に1つ選択", () => {
    const p1 = useWorkspaceStore.getState().addPane();
    useWorkspaceStore.getState().addPane();
    const panes = useWorkspaceStore.getState().panes;
    const selectedPane = panes.find((p) => p.selected);
    expect(selectedPane).toBeDefined();
    expect(panes.filter((p) => p.selected)).toHaveLength(1);

    // 選択切替
    useWorkspaceStore.getState().selectPane(p1!.id);
    expect(useWorkspaceStore.getState().selectedPaneId).toBe(p1!.id);
    expect(
      useWorkspaceStore.getState().panes.find((p) => p.id === p1!.id)!.selected,
    ).toBe(true);
  });

  it("FR-007: Pane削除。選択中Pane削除時は別Paneが選択される", () => {
    const p1 = useWorkspaceStore.getState().addPane();
    const p2 = useWorkspaceStore.getState().addPane();
    useWorkspaceStore.getState().removePane(p2!.id);
    expect(useWorkspaceStore.getState().panes).toHaveLength(1);
    expect(useWorkspaceStore.getState().selectedPaneId).toBe(p1!.id);
  });

  it("FR-009: 最大化トグル", () => {
    const p = useWorkspaceStore.getState().addPane();
    useWorkspaceStore.getState().toggleMaximize(p!.id);
    expect(useWorkspaceStore.getState().panes[0].maximized).toBe(true);
    useWorkspaceStore.getState().toggleMaximize(p!.id);
    expect(useWorkspaceStore.getState().panes[0].maximized).toBe(false);
  });

  it("FR-023/024: SYNCED 操作は REPLAY Pane のみ適用。LIVE は除外", () => {
    const live = useWorkspaceStore.getState().addPane({ mode: "LIVE" });
    const replay1 = useWorkspaceStore.getState().addPane({
      mode: "REPLAY",
      replayAt: "2026-07-10T10:00:00.000Z",
    });
    const replay2 = useWorkspaceStore.getState().addPane({
      mode: "REPLAY",
      replayAt: "2026-07-10T10:00:00.000Z",
    });
    useWorkspaceStore.getState().setSyncMode("SYNCED");

    useWorkspaceStore.getState().applySyncedOperation((p) => ({
      replayAt: new Date(
        new Date(p.replayAt!).getTime() + 60000,
      ).toISOString(),
      playbackRate: 2,
    }));

    const panes = useWorkspaceStore.getState().panes;
    // LIVE は不変
    const livePane = panes.find((p) => p.id === live!.id);
    expect(livePane!.mode).toBe("LIVE");
    // REPLAY は両方更新
    const r1 = panes.find((p) => p.id === replay1!.id);
    const r2 = panes.find((p) => p.id === replay2!.id);
    expect(r1!.replayAt).toBe("2026-07-10T10:01:00.000Z");
    expect(r2!.replayAt).toBe("2026-07-10T10:01:00.000Z");
    expect(r1!.playbackRate).toBe(2);
  });

  it("FR-023: INDEPENDENT 時は applySyncedOperation が何もしない", () => {
    const p = useWorkspaceStore.getState().addPane({
      mode: "REPLAY",
      replayAt: "2026-07-10T10:00:00.000Z",
    });
    useWorkspaceStore.getState().setSyncMode("INDEPENDENT");
    useWorkspaceStore.getState().applySyncedOperation(() => ({ playbackRate: 4 }));
    expect(
      useWorkspaceStore.getState().panes.find((x) => x.id === p!.id)!.playbackRate,
    ).toBe(1);
  });

  it("FR-023: SYNCED へ切替時、全REPLAY Pane の時刻が基準へ揃う", () => {
    const r1 = useWorkspaceStore.getState().addPane({
      mode: "REPLAY",
      replayAt: "2026-07-10T09:00:00.000Z",
    });
    const r2 = useWorkspaceStore.getState().addPane({
      mode: "REPLAY",
      replayAt: "2026-07-10T11:00:00.000Z",
    });
    // r1 を選択
    useWorkspaceStore.getState().selectPane(r1!.id);
    useWorkspaceStore.getState().setSyncMode("SYNCED");

    const panes = useWorkspaceStore.getState().panes;
    const p1 = panes.find((p) => p.id === r1!.id)!;
    const p2 = panes.find((p) => p.id === r2!.id)!;
    // 選択中Pane(r1)の時刻へ揃う
    expect(p1.replayAt).toBe("2026-07-10T09:00:00.000Z");
    expect(p2.replayAt).toBe("2026-07-10T09:00:00.000Z");
  });

  it("FR-023: SYNCED 時 seekTo で全REPLAY Paneが同時刻へ", () => {
    const base = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const target = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    useWorkspaceStore.getState().addPane({ mode: "LIVE" });
    const r1 = useWorkspaceStore.getState().addPane({
      mode: "REPLAY",
      replayAt: base,
    });
    const r2 = useWorkspaceStore.getState().addPane({
      mode: "REPLAY",
      replayAt: base,
    });
    useWorkspaceStore.getState().setSyncMode("SYNCED");
    useWorkspaceStore.getState().seekTo(target);

    const panes = useWorkspaceStore.getState().panes;
    expect(panes.find((p) => p.id === r1!.id)!.replayAt).toBe(target);
    expect(panes.find((p) => p.id === r2!.id)!.replayAt).toBe(target);
  });

  it("FR-023: SYNCED 時 seekByDelta で全REPLAY Paneが同量シフト", () => {
    // 現在時刻から5分前（2時間ウィンドウ内）でテスト
    const base = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const expected = new Date(Date.now() - 5 * 60 * 1000 + 60 * 1000);
    const r1 = useWorkspaceStore.getState().addPane({
      mode: "REPLAY",
      replayAt: base,
    });
    const r2 = useWorkspaceStore.getState().addPane({
      mode: "REPLAY",
      replayAt: base,
    });
    useWorkspaceStore.getState().setSyncMode("SYNCED");
    useWorkspaceStore.getState().seekByDelta(60);

    const panes = useWorkspaceStore.getState().panes;
    const r1At = new Date(panes.find((p) => p.id === r1!.id)!.replayAt!);
    const r2At = new Date(panes.find((p) => p.id === r2!.id)!.replayAt!);
    // 両方とも基準+60秒（誤差1秒許容）
    expect(Math.abs(r1At.getTime() - expected.getTime())).toBeLessThan(2000);
    expect(Math.abs(r2At.getTime() - expected.getTime())).toBeLessThan(2000);
  });

  it("FR-023: SYNCED 時 playPause で全REPLAY Paneの再生状態が切り替わる", () => {
    const base = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const r1 = useWorkspaceStore.getState().addPane({
      mode: "REPLAY",
      replayAt: base,
    });
    const r2 = useWorkspaceStore.getState().addPane({
      mode: "REPLAY",
      replayAt: base,
    });
    useWorkspaceStore.getState().setSyncMode("SYNCED");
    // setSyncMode 後は INITIALIZING。明示的に PLAYING へ
    useWorkspaceStore.getState().updatePane(r1!.id, { playerState: "PLAYING" });
    useWorkspaceStore.getState().updatePane(r2!.id, { playerState: "PLAYING" });
    // PLAYING -> PAUSE
    useWorkspaceStore.getState().playPause();
    const panes = useWorkspaceStore.getState().panes;
    expect(panes.find((p) => p.id === r1!.id)!.playerState).toBe("PAUSED");
    expect(panes.find((p) => p.id === r2!.id)!.playerState).toBe("PAUSED");
  });

  it("FR-023/024: SYNCED 時 setPlaybackRate はREPLAY Paneのみ。LIVEは不变", () => {
    const live = useWorkspaceStore.getState().addPane({ mode: "LIVE" });
    const r1 = useWorkspaceStore.getState().addPane({
      mode: "REPLAY",
      replayAt: "2026-07-10T10:00:00.000Z",
    });
    useWorkspaceStore.getState().setSyncMode("SYNCED");
    useWorkspaceStore.getState().setPlaybackRate(4);
    const panes = useWorkspaceStore.getState().panes;
    expect(panes.find((p) => p.id === r1!.id)!.playbackRate).toBe(4);
    expect(panes.find((p) => p.id === live!.id)!.playbackRate).toBe(1);
  });

  it("FR-024: SYNCED 時 backToLive はREPLAY PaneのみLIVEへ。他LIVE Paneは不变", () => {
    const live = useWorkspaceStore.getState().addPane({ mode: "LIVE" });
    const r1 = useWorkspaceStore.getState().addPane({
      mode: "REPLAY",
      replayAt: "2026-07-10T10:00:00.000Z",
    });
    useWorkspaceStore.getState().setSyncMode("SYNCED");
    useWorkspaceStore.getState().backToLive();
    const panes = useWorkspaceStore.getState().panes;
    expect(panes.find((p) => p.id === r1!.id)!.mode).toBe("LIVE");
    expect(panes.find((p) => p.id === live!.id)!.mode).toBe("LIVE");
  });
});
