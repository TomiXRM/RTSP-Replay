/**
 * Pane追加ダイアログ（SPEC 17章, FR-001〜006 + monitor_sample.html デザイン準拠）。
 *
 * モーダル480px / タブ（登録済みカメラ・URLを入力）/
 * 登録済み: プルダウン + 表示モード（ライブ・過去映像）+ 過去分指定 /
 * URL: 表示名 + RTSP URL + 永続登録 + 接続テスト結果 /
 * 接続テスト成功前でも追加できる設計にはしない（SPEC 17.2注記） /
 * RTSP URL/認証をフロントで保持し続けない（FR-004, NFR-003）。
 */

import { Loader2, Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { api } from "@/api/client";
import { useSystemStore } from "@/store/system";
import { useWorkspaceStore } from "@/store/workspace";
import { MAX_PANES } from "@/types/pane";
import type { ConnectionTestResult } from "@/types/source";
import { cn } from "@/lib/utils";

const ACCENT = "#c9ff05";

interface AddPaneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddPaneDialog({ open, onOpenChange }: AddPaneDialogProps) {
  const panes = useWorkspaceStore((s) => s.panes);
  if (!open) return null;
  const atMax = panes.length >= MAX_PANES;

  return (
    <ModalShell onClose={() => onOpenChange(false)} width={480}>
      {/* ヘッダー */}
      <div className="flex items-center justify-between border-b border-white/[.08] px-5 py-4">
        <span className="text-[15px] font-bold">Paneを追加</span>
        <button
          onClick={() => onOpenChange(false)}
          className="grid h-[26px] w-[26px] place-items-center rounded-[5px] text-[17px] text-muted-foreground hover:bg-white/[.08] hover:text-foreground"
        >
          ✕
        </button>
      </div>

      {atMax ? (
        <div className="py-8 text-center text-[13px] text-muted-foreground">
          最大{MAX_PANES}画面まで表示できます
        </div>
      ) : (
        <DialogBody onClose={() => onOpenChange(false)} />
      )}
    </ModalShell>
  );
}

function DialogBody({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"registered" | "url">("registered");
  return (
    <div className="p-[18px] pb-[22px]">
      {/* タブ */}
      <div className="mb-5 flex gap-0.5 rounded-[8px] border border-white/[.08] bg-surface p-[3px]">
        <Tab active={tab === "registered"} onClick={() => setTab("registered")}>
          登録済みカメラ
        </Tab>
        <Tab active={tab === "url"} onClick={() => setTab("url")}>
          URLを入力
        </Tab>
      </div>

      {tab === "registered" ? (
        <RegisteredTab onClose={onClose} />
      ) : (
        <UrlTab onClose={onClose} />
      )}
    </div>
  );
}

// ===== 登録済みタブ（FR-003） =====
function RegisteredTab({ onClose }: { onClose: () => void }) {
  const sources = useSystemStore((s) => s.sources);
  const addPane = useWorkspaceStore((s) => s.addPane);
  const [sourceId, setSourceId] = useState<string>(sources[0]?.id ?? "");
  const [mode, setMode] = useState<"LIVE" | "REPLAY">("LIVE");
  const [replayMin, setReplayMin] = useState(5);

  useEffect(() => {
    if (!sourceId && sources.length > 0) setSourceId(sources[0].id);
  }, [sources, sourceId]);

  const selected = sources.find((s) => s.id === sourceId);

  const handleAdd = () => {
    if (!selected) return;
    const init: Parameters<typeof addPane>[0] = {
      sourceId: selected.id,
      sourceName: selected.name,
      mode,
      playerState: mode === "LIVE" ? "CONNECTING" : "PAUSED",
    };
    if (mode === "REPLAY") {
      init.replayAt = new Date(Date.now() - replayMin * 60000).toISOString();
    }
    addPane(init);
    onClose();
  };

  if (sources.length === 0) {
    return (
      <div className="py-6 text-center text-[13px] text-muted-foreground">
        登録済みの映像ソースがありません
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Field label="カメラ">
        <select
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
          className="w-full rounded-[7px] border border-white/[.14] bg-surface px-3 py-2.5 text-[13px] text-foreground"
        >
          {sources.map((s) => (
            <option key={s.id} value={s.id} className="bg-ink-800">
              {s.name}（{s.origin}）{s.status === "ONLINE" ? " ●" : " ○"}
            </option>
          ))}
        </select>
      </Field>

      {selected && (
        <div className="font-mono text-[10.5px] text-muted-ink">
          {selected.resolution ?? "—"} · {selected.recordingStatus === "RECORDING" ? "録画あり" : "録画停止"}
        </div>
      )}

      <Field label="表示モード">
        <div className="flex gap-2">
          <ModeBtn active={mode === "LIVE"} onClick={() => setMode("LIVE")}>
            ● ライブ
          </ModeBtn>
          <ModeBtn active={mode === "REPLAY"} onClick={() => setMode("REPLAY")}>
            過去映像
          </ModeBtn>
        </div>
      </Field>

      {mode === "REPLAY" && (
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-[#b7becc]">現在より</span>
          <input
            type="number"
            min={1}
            max={120}
            value={replayMin}
            onChange={(e) =>
              setReplayMin(Math.max(1, Math.min(120, parseInt(e.target.value) || 1)))
            }
            className="w-[70px] rounded-[6px] border border-white/[.14] bg-surface px-2.5 py-2 font-mono text-[13px] text-foreground"
          />
          <span className="text-[12px] text-[#b7becc]">分前から一時停止で追加</span>
        </div>
      )}

      <DialogFooter>
        <Btn variant="ghost" onClick={onClose}>
          キャンセル
        </Btn>
        <Btn variant="primary" onClick={handleAdd} disabled={!selected}>
          <Plus className="h-4 w-4" />
          追加
        </Btn>
      </DialogFooter>
    </div>
  );
}

// ===== URL入力タブ（FR-004, FR-005） =====
function UrlTab({ onClose }: { onClose: () => void }) {
  const addPane = useWorkspaceStore((s) => s.addPane);
  const refresh = useSystemStore((s) => s.refresh);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [persistent, setPersistent] = useState(false);
  const [test, setTest] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    setTest("idle");
    setTestResult(null);
  }, [url]);

  const handleTest = async () => {
    if (!url) return;
    setTest("testing");
    setTestResult(null);
    try {
      const r = await api.testConnection(url);
      setTestResult(r);
      setTest(r.success ? "ok" : "fail");
    } catch {
      setTest("fail");
    }
  };

  const handleAdd = async () => {
    if (!name || !url || test !== "ok") return;
    setAdding(true);
    setAddError(null);
    try {
      const res = await api.createSource({ name, rtspUrl: url, persistent });
      await refresh();
      addPane({ sourceId: res.id, sourceName: res.name });
      // FR-004: URL/認証をフロントで保持しない → stateクリア
      setName("");
      setUrl("");
      onClose();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "登録に失敗しました");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-4">
      <Field label="表示名">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="実験用カメラ"
          className="w-full rounded-[7px] border border-white/[.14] bg-surface px-3 py-2.5 text-[13px] text-foreground"
        />
      </Field>

      <Field label="RTSP URL">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="rtsp://192.168.1.30:554/main"
          className="w-full rounded-[7px] border border-white/[.14] bg-surface px-3 py-2.5 font-mono text-[12.5px] text-foreground"
        />
      </Field>
      <p className="-mt-2 text-[10px] text-muted-ink">
        認証情報はバックエンドへ送信し、ブラウザには保存しません。
      </p>

      <label className="flex cursor-pointer items-center gap-2 text-[12px] text-[#c3ccdb]">
        <input
          type="checkbox"
          checked={persistent}
          onChange={(e) => setPersistent(e.target.checked)}
          className="h-4 w-4"
          style={{ accentColor: ACCENT }}
        />
        次回以降も登録済みに表示する（永続登録）
      </label>

      {/* 接続テスト結果 */}
      {test !== "idle" && (
        <div
          className="rounded-[8px] p-3"
          style={
            test === "ok"
              ? { background: "rgba(70,201,139,.08)", border: "1px solid rgba(70,201,139,.3)" }
              : test === "fail"
                ? { background: "rgba(236,75,82,.08)", border: "1px solid rgba(236,75,82,.3)" }
                : { background: "#070a0f", border: "1px solid rgba(255,255,255,.1)" }
          }
        >
          {test === "testing" && (
            <div className="flex items-center gap-2.5 text-[12.5px] text-[#c3ccdb]">
              <span
                className="h-[15px] w-[15px] rounded-full border-2 border-[rgba(120,160,220,.25)] animate-rp-spin"
                style={{ borderTopColor: ACCENT }}
              />
              接続テスト中… ストリームを確認しています
            </div>
          )}
          {test === "ok" && testResult && (
            <>
              <div className="mb-2 flex items-center gap-2 text-[12.5px] font-bold text-ok">
                ✓ 接続成功
              </div>
              <div className="flex gap-[18px] font-mono text-[11.5px] text-[#c3ccdb]">
                <span>{testResult.codec}</span>
                <span>
                  {testResult.width} × {testResult.height}
                </span>
                <span>{testResult.fps} fps</span>
              </div>
            </>
          )}
          {test === "fail" && (
            <>
              <div className="mb-1 flex items-center gap-2 text-[12.5px] font-bold text-live">
                ✕ 接続失敗
              </div>
              <div className="text-[11.5px] text-[#f0b8bb]">
                {testResult?.message ?? "接続できませんでした"}
              </div>
            </>
          )}
        </div>
      )}

      {addError && (
        <div className="rounded-[8px] border border-live/30 bg-live/10 px-3 py-2 text-[11.5px] text-[#f0b8bb]">
          ✕ {addError}
        </div>
      )}

      <DialogFooter>
        <Btn variant="ghost" onClick={onClose}>
          キャンセル
        </Btn>
        <Btn variant="outline" onClick={handleTest} disabled={!url || test === "testing"}>
          接続テスト
        </Btn>
        <Btn variant="primary" onClick={handleAdd} disabled={!name || !url || test !== "ok" || adding}>
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          追加
        </Btn>
      </DialogFooter>
    </div>
  );
}

// ===== 共通UI =====
function ModalShell({
  children,
  onClose,
  width,
}: {
  children: React.ReactNode;
  onClose: () => void;
  width: number;
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center"
      style={{ background: "rgba(4,6,10,.66)", backdropFilter: "blur(3px)" }}
      onClick={onClose}
    >
      <div
        className="overflow-hidden rounded-[11px] border border-white/[.12] bg-ink-800"
        style={{ width, maxWidth: "92vw", boxShadow: "0 24px 70px rgba(0,0,0,.6)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-[7px] block text-[11px] font-semibold text-[#8b93a3]">
        {label}
      </label>
      {children}
    </div>
  );
}

function Tab({
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
      className="flex-1 rounded-[6px] border-none py-2 text-[12.5px] font-semibold"
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

function ModeBtn({
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
      className="flex-1 rounded-[7px] py-2.5 text-[12.5px] font-semibold"
      style={
        active
          ? {
              border: `1px solid ${ACCENT}`,
              background: `color-mix(in srgb, ${ACCENT} 15%, transparent)`,
              color: ACCENT,
            }
          : {
              border: "1px solid rgba(255,255,255,.14)",
              background: "#070a0f",
              color: "#c3ccdb",
            }
      }
    >
      {children}
    </button>
  );
}

function DialogFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-1.5 flex justify-end gap-2">{children}</div>
  );
}

function Btn({
  variant,
  children,
  onClick,
  disabled,
}: {
  variant: "primary" | "outline" | "ghost";
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-[7px] px-4 py-2.5 text-[12.5px] font-semibold",
        disabled && "cursor-not-allowed opacity-40",
      )}
      style={
        variant === "primary"
          ? { border: "none", background: ACCENT, color: "#04060a", fontWeight: 700 }
          : variant === "outline"
            ? { border: "1px solid rgba(255,255,255,.16)", background: "#12161f", color: "#e7eaf0" }
            : { border: "1px solid rgba(255,255,255,.14)", background: "transparent", color: "#c3ccdb" }
      }
    >
      {children}
    </button>
  );
}
