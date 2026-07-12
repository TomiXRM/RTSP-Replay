/**
 * 状態カタログ（SPEC 25章 + monitor_sample.html デザイン準拠）。
 *
 * 正常系だけでなく、接続失敗・録画停止・欠損・エラーまで含む
 * Pane 表示状態の一覧。ClaudeDesign の「正常状態だけをデザインしない」要件。
 */

import { Pane } from "@/features/pane/Pane";
import { createPane, type PaneState } from "@/types/pane";
import { useEffect, useState } from "react";

const ACCENT = "#c9ff05";

interface CatalogEntry {
  tag: string;
  label: string;
  desc: string;
  pane: PaneState;
}

function nowIso(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

function buildCatalog(): CatalogEntry[] {
  const base = (over: Partial<PaneState>): PaneState => ({
    ...createPane(),
    sourceId: "demo",
    sourceName: "ロボット全体",
    muted: true,
    selected: false,
    ...over,
  });

  return [
    {
      tag: "S-02",
      label: "LIVE 再生中",
      desc: "受信中の正常なライブ映像。REC点灯・タイムコード表示。",
      pane: base({ mode: "LIVE", playerState: "PLAYING", sourceName: "ロボット全体" }),
    },
    {
      tag: "S-01",
      label: "LIVE 接続中",
      desc: "Pane追加直後、MediaMTX へ接続中の状態。",
      pane: base({ mode: "LIVE", playerState: "CONNECTING", sourceName: "部品供給部" }),
    },
    {
      tag: "S-06",
      label: "再接続中",
      desc: "一時切断を検知し自動再接続。試行回数と最終受信時刻を表示。",
      pane: base({ mode: "LIVE", playerState: "RECONNECTING", sourceName: "搬送部" }),
    },
    {
      tag: "S-07",
      label: "カメラオフライン",
      desc: "15秒以上映像なし。黒画面ではなく理由と最終受信を明示。",
      pane: base({
        mode: "LIVE",
        playerState: "UNAVAILABLE",
        sourceName: "包装部",
        lastFrameAt: nowIso(-192000),
      }),
    },
    {
      tag: "S-08",
      label: "録画停止（LIVEは正常）",
      desc: "ライブ表示は成功しているが録画ファイルが更新されない異常。",
      pane: base({ mode: "LIVE", playerState: "PLAYING", sourceName: "検査部" }),
    },
    {
      tag: "S-04",
      label: "REPLAY 再生中",
      desc: "過去映像を指定時刻から再生。現在との差をヘッダーに表示。",
      pane: base({
        mode: "REPLAY",
        playerState: "PLAYING",
        replayAt: nowIso(-754000),
        sourceName: "ロボット全体",
      }),
    },
    {
      tag: "S-05",
      label: "一時停止",
      desc: "REPLAY を一時停止。ヘッダーに ❚❚ を表示。",
      pane: base({
        mode: "REPLAY",
        playerState: "PAUSED",
        replayAt: nowIso(-1200000),
        sourceName: "搬送部",
      }),
    },
    {
      tag: "S-09",
      label: "録画欠損",
      desc: "その時刻に録画が存在しない区間。次の録画開始時刻を提示。",
      pane: base({
        mode: "REPLAY",
        playerState: "ERROR",
        errorCode: "RECORDING_NOT_AVAILABLE",
        replayAt: nowIso(-2280000),
        sourceName: "搬送部",
      }),
    },
    {
      tag: "S-10",
      label: "認証失敗",
      desc: "RTSP 認証エラー。原因と対処を提示。",
      pane: base({
        mode: "LIVE",
        playerState: "ERROR",
        errorCode: "CAMERA_AUTH_FAILED",
        sourceName: "実験用カメラ",
      }),
    },
    {
      tag: "S-11",
      label: "未対応コーデック",
      desc: "ストリームは存在するが再生できないコーデック。",
      pane: base({
        mode: "LIVE",
        playerState: "ERROR",
        errorCode: "UNSUPPORTED_CODEC",
        sourceName: "旧型カメラ",
      }),
    },
    {
      tag: "S-12",
      label: "サーバー未接続",
      desc: "監視サーバーと通信できず、最新状態を取得できない。",
      pane: base({
        mode: "LIVE",
        playerState: "ERROR",
        errorCode: "MEDIA_SERVER_UNAVAILABLE",
        sourceName: "ロボット全体",
      }),
    },
    {
      tag: "SEL",
      label: "選択中Pane",
      desc: "選択中のPaneはアクセント枠とヘッダー背景で明示。",
      pane: base({ mode: "LIVE", playerState: "PLAYING", selected: true, sourceName: "ロボット全体" }),
    },
  ];
}

export function StateCatalog() {
  // カタログは毎秒の時計更新で再描画させる
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setTick((x) => x + 1), 1000);
    return () => window.clearInterval(t);
  }, []);

  const entries = buildCatalog();

  return (
    <div className="min-h-0 flex-1 overflow-auto p-[22px] pb-10">
      <div className="mx-auto max-w-[1440px]">
        <div className="mb-1 text-[15px] font-bold">状態カタログ</div>
        <div className="mb-3 text-[12px] text-[#8b93a3]">
          正常系だけでなく、接続失敗・録画停止・欠損・エラーまで含む Pane 表示状態の一覧（SPEC §25）。
        </div>
        <div
          className="mb-[22px] rounded-[8px] border border-white/[.1] bg-surface px-4 py-3 text-[12px] leading-[1.7] text-[#b7becc]"
          style={{ borderLeft: `3px solid ${ACCENT}` }}
        >
          <span className="font-bold" style={{ color: ACCENT }}>NOTE：</span>
          このページは<span className="font-bold">開発・デザイン確認用の見本集</span>であり、実際のカメラの状態を表示するものではありません。
          各カードはダミーデータで「Paneがその状況になったときの見え方」を再現しています（実カメラには接続していません）。
          カメラ障害や録画欠損などの異常系は意図的に起こさないと確認できないため、
          「正常状態だけをデザインしない」という要件（SPEC §25）に基づき、全表示パターンをここで一覧確認できるようにしています。
          運用時は「ワークスペース」タブのみ使用してください。
        </div>
        <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(330px,1fr))]">
          {entries.map((e) => (
            <div key={e.tag}>
              <div className="mb-[7px] flex items-baseline gap-2">
                <span
                  className="font-mono text-[9px] font-bold"
                  style={{
                    color: ACCENT,
                    letterSpacing: ".07em",
                    padding: "2px 6px",
                    border: `1px solid color-mix(in srgb, ${ACCENT} 40%, transparent)`,
                    borderRadius: "3px",
                  }}
                >
                  {e.tag}
                </span>
                <span className="text-[12.5px] font-semibold text-foreground">{e.label}</span>
              </div>
              <div
                className="h-[190px] overflow-hidden rounded-[5px]"
                style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,.08)" }}
              >
                <Pane pane={e.pane} />
              </div>
              <div className="mt-[7px] text-[11px] leading-[1.45] text-[#7b8395]">
                {e.desc}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
