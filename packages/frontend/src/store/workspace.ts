/**
 * Workspace ストア（SPEC FR-028, FR-029）。
 *
 * Zustand + persist で Workspace 状態を管理・復元する。
 *
 * セキュリティ（NFR-003, FR-029）:
 *  - RTSP URL / 認証情報を localStorage へ保存しない（PaneState に URL は無い）
 *  - 復元時、一時ソースが解決できない場合は Pane へ復元不可を明示する
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

import { useSystemStore } from "@/store/system";

import {
  MAX_PANES,
  type PaneState,
  type PlaybackRate,
  type PlayerState,
  type SyncMode,
  type WorkspaceState,
  columnsFor,
  createPane,
} from "@/types/pane";

interface WorkspaceActions {
  /** Pane を追加。上限は MAX_PANES。 */
  addPane: (init?: Partial<PaneState>) => PaneState | null;
  /** Pane を削除（SPEC FR-007）。映像ソース自体は削除しない。 */
  removePane: (paneId: string) => void;
  /** 選択中Paneを切り替え（SPEC FR-010）。 */
  selectPane: (paneId: string) => void;
  /** Pane を最大化（SPEC FR-009）。 */
  toggleMaximize: (paneId: string) => void;
  /** Pane を部分的に更新。 */
  updatePane: (paneId: string, patch: Partial<PaneState>) => void;
  /** Pane のモードを LIVE/REPLAY 切替（SPEC FR-017）。 */
  setPaneMode: (paneId: string, mode: PaneState["mode"], replayAt?: string | null) => void;
  /** 同期モード切替（SPEC FR-023）。SYNCED へ切替時、全 REPLAY Pane の時刻を基準へ揃える。 */
  setSyncMode: (mode: SyncMode) => void;
  /** 同期対象Paneへ共通操作を適用（SPEC FR-023, FR-024）。LIVEは除外（FR-024）。 */
  applySyncedOperation: (op: (p: PaneState) => Partial<PaneState>) => void;
  /**
   * 共通シーク操作（FR-023）。SYNCED時は全REPLAY Paneを同時刻へ。
   * INDEPENDENT時は選択中Paneのみ（LIVEなら過去映像へ切替）。
   */
  seekTo: (targetIso: string) => void;
  /** 共通時間シフト（FR-020）。SYNCED時は全REPLAY Pane、INDEPENDENT時は選択中Pane。 */
  seekByDelta: (deltaSec: number) => void;
  /** 共通再生/一時停止（FR-020, FR-023）。 */
  playPause: () => void;
  /** 共通再生速度（FR-020, FR-023）。 */
  setPlaybackRate: (rate: PlaybackRate) => void;
  /** 全ターゲットを LIVE へ戻す（FR-021, FR-024）。 */
  backToLive: () => void;
  /** 全 LIVE Pane を一括で REPLAY へ切替。基準時刻は SYNCED 切替と同じ規則。 */
  allToReplay: () => void;
  /** 現在の操作対象 Pane 一覧（FR-025 表示用）。 */
  getTargets: () => PaneState[];
  /** 全 Pane の LIVE/REPLAY をクリア（初期化）。 */
  reset: () => void;
}

type Store = WorkspaceState & WorkspaceActions;

/**
 * SYNCED でも同期対象（REPLAY Pane）が無い場合は選択中Pane操作へ
 * フォールバックする（CommonControls の操作対象表示と挙動を一致させる）。
 */
function isSyncedEffective(syncMode: SyncMode, panes: PaneState[]): boolean {
  return syncMode === "SYNCED" && panes.some((p) => p.mode === "REPLAY");
}

export const useWorkspaceStore = create<Store>()(
  persist(
    (set, get) => ({
      panes: [],
      selectedPaneId: null,
      syncMode: "INDEPENDENT",
      layout: 1,

      addPane: (init) => {
        const { panes } = get();
        if (panes.length >= MAX_PANES) {
          // MAX_PANES 上限
          return null;
        }
        const pane = createPane({ ...init, selected: true });
        const next = panes.map((p) => ({ ...p, selected: false }));
        next.push(pane);
        const layout = next.length as WorkspaceState["layout"];
        set({ panes: next, selectedPaneId: pane.id, layout });
        return pane;
      },

      removePane: (paneId) => {
        const { panes, selectedPaneId } = get();
        const next = panes.filter((p) => p.id !== paneId);
        // 選択中Paneを削除した場合は先頭を選択
        let newSelected = selectedPaneId;
        if (selectedPaneId === paneId) {
          newSelected = next[0]?.id ?? null;
        }
        next.forEach((p) => (p.selected = p.id === newSelected));
        set({
          panes: next,
          selectedPaneId: newSelected,
          layout: (next.length || 1) as WorkspaceState["layout"],
        });
      },

      selectPane: (paneId) => {
        const panes = get().panes.map((p) => ({
          ...p,
          selected: p.id === paneId,
        }));
        set({ panes, selectedPaneId: paneId });
      },

      toggleMaximize: (paneId) => {
        const panes = get().panes.map((p) => ({
          ...p,
          maximized: p.id === paneId ? !p.maximized : false,
        }));
        set({ panes });
      },

      updatePane: (paneId, patch) => {
        const panes = get().panes.map((p) =>
          p.id === paneId ? { ...p, ...patch } : p,
        );
        set({ panes });
      },

      setPaneMode: (paneId, mode, replayAt = null) => {
        const panes = get().panes.map((p) =>
          p.id === paneId
            ? {
                ...p,
                mode,
                replayAt: mode === "REPLAY" ? replayAt ?? p.replayAt : null,
                positionAt: null,
                playerState: "INITIALIZING" as const,
              }
            : p,
        );
        set({ panes });
      },

      setSyncMode: (mode) => {
        if (mode === "SYNCED") {
          // SPEC FR-023: SYNCED へ切替時、全 REPLAY Pane を共通基準時刻へ揃える。
          // 基準: 選択中REPLAY Pane > 最初のREPLAY Pane > 現在から5分前
          const { panes, selectedPaneId } = get();
          const sel = panes.find((p) => p.id === selectedPaneId);
          let ref: number;
          if (sel && sel.mode === "REPLAY" && sel.replayAt) {
            ref = new Date(sel.replayAt).getTime();
          } else {
            const firstReplay = panes.find((p) => p.mode === "REPLAY" && p.replayAt);
            ref = firstReplay && firstReplay.replayAt
              ? new Date(firstReplay.replayAt).getTime()
              : Date.now() - 5 * 60 * 1000;
          }
          const refIso = new Date(ref).toISOString();
          const next = panes.map((p) =>
            p.mode === "REPLAY"
              ? {
                  ...p,
                  replayAt: refIso,
                  positionAt: null,
                  playbackRate: 1 as PlaybackRate,
                  playerState: "INITIALIZING" as const,
                  errorCode: null,
                }
              : p,
          );
          set({ syncMode: "SYNCED", panes: next });
        } else {
          set({ syncMode: "INDEPENDENT" });
        }
      },

      applySyncedOperation: (op) => {
        // SYNCED の場合、REPLAY Pane のみへ共通操作を適用（SPEC FR-024: LIVE除外）
        const { syncMode, panes } = get();
        if (syncMode !== "SYNCED") return;
        const next = panes.map((p) => {
          if (p.mode !== "REPLAY") return p;
          return { ...p, ...op(p) };
        });
        set({ panes: next });
      },

      getTargets: () => {
        const { syncMode, panes, selectedPaneId } = get();
        if (isSyncedEffective(syncMode, panes)) {
          return panes.filter((p) => p.mode === "REPLAY");
        }
        const sel = panes.find((p) => p.id === selectedPaneId);
        return sel ? [sel] : [];
      },

      seekTo: (targetIso) => {
        const { syncMode, panes, selectedPaneId } = get();
        // SYNCED: 全 REPLAY Pane を同時刻へ（FR-023）
        if (isSyncedEffective(syncMode, panes)) {
          const next = panes.map((p) =>
            p.mode === "REPLAY"
              ? {
                  ...p,
                  replayAt: targetIso,
                  positionAt: null,
                  playerState: "INITIALIZING" as const,
                  errorCode: null,
                }
              : p,
          );
          set({ panes: next });
          return;
        }
        // INDEPENDENT: 選択中Paneのみ。LIVEならREPLAYへ切替
        const sel = panes.find((p) => p.id === selectedPaneId);
        if (!sel) return;
        const next = panes.map((p) =>
          p.id === sel.id
            ? {
                ...p,
                mode: "REPLAY" as const,
                replayAt: targetIso,
                positionAt: null,
                playerState: "INITIALIZING" as const,
                errorCode: null,
              }
            : p,
        );
        set({ panes: next });
      },

      seekByDelta: (deltaSec) => {
        const { syncMode, panes, selectedPaneId } = get();
        const now = Date.now();
        // シーク下限 = 録画保持期間（.env RECORDING_RETENTION_HOURS と連動）
        const retentionH =
          useSystemStore.getState().health?.retentionHours ?? 2;
        const ws = now - retentionH * 60 * 60 * 1000;
        const clamp = (t: number) => Math.min(Math.max(t, ws), now - 1000);

        if (isSyncedEffective(syncMode, panes)) {
          // 全 REPLAY Pane を同量シフト
          const next = panes.map((p) => {
            if (p.mode !== "REPLAY" || !p.replayAt) return p;
            const base = new Date(p.replayAt).getTime();
            return {
              ...p,
              replayAt: new Date(clamp(base + deltaSec * 1000)).toISOString(),
              positionAt: null,
              playerState: "INITIALIZING" as const,
              errorCode: null,
            };
          });
          set({ panes: next });
          return;
        }
        // INDEPENDENT: 選択中Paneのみ
        const sel = panes.find((p) => p.id === selectedPaneId);
        if (!sel) return;
        const base =
          sel.mode === "REPLAY" && sel.replayAt
            ? new Date(sel.replayAt).getTime()
            : now;
        const nextTime = new Date(clamp(base + deltaSec * 1000)).toISOString();
        const next = panes.map((p) =>
          p.id === sel.id
            ? {
                ...p,
                mode: "REPLAY" as const,
                replayAt: nextTime,
                positionAt: null,
                playerState: "INITIALIZING" as const,
                errorCode: null,
              }
            : p,
        );
        set({ panes: next });
      },

      playPause: () => {
        const { syncMode, panes, selectedPaneId } = get();
        const synced = isSyncedEffective(syncMode, panes);
        const isTarget = (p: PaneState) =>
          synced ? p.mode === "REPLAY" : p.id === selectedPaneId;
        const targets = panes.filter(isTarget);
        const anyPlaying = targets.some((p) => p.playerState === "PLAYING");
        const next = panes.map((p) => {
          if (!isTarget(p)) return p;
          if (anyPlaying) {
            // 再生中 → 一時停止
            return { ...p, playerState: "PAUSED" as PlayerState };
          }
          // 停止中 → 再生を試みるが、実際の再生開始は video 要素が判断する。
          // playerState を人為的に PLAYING にはせず、CONNECTING へ。
          // video がフレームを受信した時点で useLivePlayer/useReplayPlayer が
          // PLAYING へ遷移させる。
          return p.playerState === "PLAYING"
            ? p
            : { ...p, playerState: "CONNECTING" as PlayerState };
        });
        set({ panes: next });
      },

      setPlaybackRate: (rate) => {
        const { syncMode, panes, selectedPaneId } = get();
        const synced = isSyncedEffective(syncMode, panes);
        const isTarget = (p: PaneState) =>
          synced ? p.mode === "REPLAY" : p.id === selectedPaneId;
        const next = panes.map((p) =>
          isTarget(p) ? { ...p, playbackRate: rate } : p,
        );
        set({ panes: next });
      },

      backToLive: () => {
        const { syncMode, panes, selectedPaneId } = get();
        const synced = isSyncedEffective(syncMode, panes);
        const isTarget = (p: PaneState) =>
          synced ? p.mode === "REPLAY" : p.id === selectedPaneId;
        const next = panes.map((p) =>
          isTarget(p)
            ? {
                ...p,
                mode: "LIVE" as const,
                replayAt: null,
                positionAt: null,
                playerState: "INITIALIZING" as const,
                errorCode: null,
              }
            : p,
        );
        set({ panes: next });
      },

      allToReplay: () => {
        // 基準時刻は setSyncMode(SYNCED) と同じ規則:
        // 選択中REPLAY > 最初のREPLAY > 現在から5分前
        const { panes, selectedPaneId } = get();
        const sel = panes.find((p) => p.id === selectedPaneId);
        let ref: number;
        if (sel && sel.mode === "REPLAY" && sel.replayAt) {
          ref = new Date(sel.replayAt).getTime();
        } else {
          const firstReplay = panes.find((p) => p.mode === "REPLAY" && p.replayAt);
          ref =
            firstReplay && firstReplay.replayAt
              ? new Date(firstReplay.replayAt).getTime()
              : Date.now() - 5 * 60 * 1000;
        }
        const refIso = new Date(ref).toISOString();
        const next = panes.map((p) =>
          p.mode === "LIVE"
            ? {
                ...p,
                mode: "REPLAY" as const,
                replayAt: refIso,
                positionAt: null,
                playerState: "INITIALIZING" as const,
                errorCode: null,
              }
            : p,
        );
        set({ panes: next });
      },

      reset: () =>
        set({ panes: [], selectedPaneId: null, syncMode: "INDEPENDENT", layout: 1 }),
    }),
    {
      name: "replay-workspace",
      // NFR-003: PaneState には URL/認証を含めないため、全体を永続化してよい。
      // ただし再生中の一時情報は復元時に再評価されるべきなので除外。
      partialize: (state) => ({
        panes: state.panes.map((p) => ({
          ...p,
          // 復元時に再接続が必要な一時状態をリセット
          playerState: "INITIALIZING" as const,
          errorCode: null,
          positionAt: null,
        })),
        selectedPaneId: state.selectedPaneId,
        syncMode: state.syncMode,
        layout: state.layout,
      }),
    },
  ),
);

/** 現在の Pane 数から列数を得る。 */
export function useColumns(): 1 | 2 | 3 | 4 {
  const count = useWorkspaceStore((s) => s.panes.length);
  return columnsFor(count);
}

/**
 * 選択中 Pane（SPEC FR-010）。
 * セレクタで .find() すると毎回新しい参照を返して無限ループになるため、
 * selectedPaneId（プリミティブ）+ panes（useShallow）から導出する。
 */
export function useSelectedPane(): PaneState | null {
  const selectedId = useWorkspaceStore((s) => s.selectedPaneId);
  const panes = useWorkspaceStore(useShallow((s) => s.panes));
  return panes.find((p) => p.id === selectedId) ?? null;
}

/**
 * 同期対象 Pane 一覧（SPEC FR-024: LIVE除外）。
 * .filter() が毎回新しい配列を返すのを防ぐため、syncMode + panes を
 * useShallow で取得してから導出する。
 */
export function useSyncedPanes(): PaneState[] {
  const syncMode = useWorkspaceStore((s) => s.syncMode);
  const panes = useWorkspaceStore(useShallow((s) => s.panes));
  if (syncMode !== "SYNCED") return EMPTY;
  return panes.filter((p) => p.mode === "REPLAY");
}
const EMPTY: PaneState[] = [];

/** 再生速度の選択肢（SPEC FR-020）。 */
export const PLAYBACK_RATES: PlaybackRate[] = [0.5, 1, 2, 4];
