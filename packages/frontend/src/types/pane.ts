/**
 * Pane 状態（SPEC 10章, 14章）。
 *
 * 真偽値の組み合わせで再生状態を推測してはならない（SPEC 10章）。
 * 明示的な playerState を用いる。
 */

/** Pane の再生状態（SPEC 10章）。 */
export type PlayerState =
  | "INITIALIZING"
  | "CONNECTING"
  | "PLAYING"
  | "PAUSED"
  | "RECONNECTING"
  | "UNAVAILABLE"
  | "ERROR";

/** Pane のモード（SPEC 4.5, 4.6）。 */
export type PaneMode = "LIVE" | "REPLAY";

/** 再生速度（SPEC FR-020）。 */
export type PlaybackRate = 0.5 | 1 | 2 | 4;

/** Pane 状態（SPEC 10章）。 */
export interface PaneState {
  /** Pane 一意ID */
  id: string;
  /** 選択中の映像ソースID。null は未選択 */
  sourceId: string | null;
  /** Pane の表示名（ソース名のキャッシュ） */
  sourceName: string | null;

  /** LIVE または REPLAY */
  mode: PaneMode;

  /** 再生状態（真偽値の組み合わせで推測しない） */
  playerState: PlayerState;

  /** REPLAY の再生基準時刻（UTC ISO）。LIVE時は null */
  replayAt: string | null;

  /** REPLAY の現在再生位置（UTC ISO）。再生に応じて更新。LIVE時・未再生時は null */
  positionAt: string | null;

  /** 再生速度 */
  playbackRate: PlaybackRate;

  /** ミュート状態 */
  muted: boolean;

  /** 選択状態（常に1つのPaneが選択中） */
  selected: boolean;

  /** 最大化状態 */
  maximized: boolean;

  /** エラーコード（SPEC 23章）。正常時 null */
  errorCode: string | null;

  /** 最終映像受信時刻（UTC ISO）。切断検知表示用 */
  lastFrameAt: string | null;
}

/** 同期モード（SPEC FR-023）。 */
export type SyncMode = "INDEPENDENT" | "SYNCED";

/** 同時表示できる Pane の上限。 */
export const MAX_PANES = 8;

/** Workspace 状態（SPEC FR-028）。 */
export interface WorkspaceState {
  panes: PaneState[];
  selectedPaneId: string | null;
  syncMode: SyncMode;
  layout: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
}

/** 新規 Pane を生成するファクトリ。 */
export function createPane(partial: Partial<PaneState> = {}): PaneState {
  return {
    id: `pane-${Math.random().toString(36).slice(2, 10)}`,
    sourceId: null,
    sourceName: null,
    mode: "LIVE",
    playerState: "INITIALIZING",
    replayAt: null,
    positionAt: null,
    playbackRate: 1,
    muted: true,
    selected: false,
    maximized: false,
    errorCode: null,
    lastFrameAt: null,
    ...partial,
  };
}

/** Pane数 → レイアウト列数（SPEC 9章）。 */
export function columnsFor(count: number): 1 | 2 | 3 | 4 {
  if (count <= 1) return 1;
  if (count <= 4) return 2;
  if (count <= 6) return 3;
  return 4;
}
