/**
 * システム状態ストア（SPEC 22.9, FR-034〜037）。
 *
 * /health を定期ポーリングし、MediaMTX 到達性・ディスク・ソース状態を保持する。
 * バックエンド停止時は API停止状態（SPEC 21.6）を表現する。
 */

import { create } from "zustand";

import { api } from "@/api/client";
import type { HealthResponse } from "@/types/api";
import type { Source } from "@/types/source";

interface SystemState {
  health: HealthResponse | null;
  sources: Source[];
  /** バックエンドAPI到達不能（SPEC 21.6）。 */
  apiDown: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  startPolling: (intervalMs?: number) => () => void;
}

export const useSystemStore = create<SystemState>((set, get) => ({
  health: null,
  sources: [],
  apiDown: false,
  loading: false,

  refresh: async () => {
    set({ loading: true });
    try {
      const [health, sourcesRes] = await Promise.all([
        api.getHealth(),
        api.listSources(),
      ]);
      set({
        health,
        sources: sourcesRes.sources,
        apiDown: false,
        loading: false,
      });
    } catch {
      // バックエンド停止
      set({ apiDown: true, loading: false });
    }
  },

  startPolling: (intervalMs = 5000) => {
    const { refresh } = get();
    void refresh();
    const timer = window.setInterval(refresh, intervalMs);
    return () => window.clearInterval(timer);
  },
}));
