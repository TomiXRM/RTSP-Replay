/**
 * 事故映像保存ダイアログ（SPEC 19章, FR-031〜033 + monitor_sample.html デザイン準拠）。
 *
 * モーダル500px / 基準時刻・保存範囲（前後5分）・合計10分 /
 * タイトル・保存理由・メモ / 保存対象ラジオ（選択中Pane・同期中Paneすべて） /
 * 削除対象外で保存（FR-033）。
 */

import { Loader2 } from "lucide-react";
import { useState } from "react";

import { api } from "@/api/client";
import { useSelectedPane, useSyncedPanes, useWorkspaceStore } from "@/store/workspace";
import type { IncidentCreateResponse, IncidentReason } from "@/types/api";
import { clockJST, dateISOJST } from "@/lib/utils";

const ACCENT = "#c9ff05";

const REASONS: { value: IncidentReason; label: string }[] = [
  { value: "ROBOT_ERROR", label: "ロボット異常" },
  { value: "QUALITY_DEFECT", label: "品質不良" },
  { value: "SAFETY_ISSUE", label: "安全上の問題" },
  { value: "COMMUNICATION_FAILURE", label: "通信障害" },
  { value: "OPERATION_CHECK", label: "動作確認" },
  { value: "OTHER", label: "その他" },
];

interface IncidentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function IncidentDialog({ open, onOpenChange }: IncidentDialogProps) {
  const selected = useSelectedPane();
  const synced = useSyncedPanes();
  const syncMode = useWorkspaceStore((s) => s.syncMode);

  const [title, setTitle] = useState("");
  const [reason, setReason] = useState<IncidentReason>("ROBOT_ERROR");
  const [note, setNote] = useState("");
  const [target, setTarget] = useState<"selected" | "synced">("selected");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<IncidentCreateResponse | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  // 保存範囲（基準時刻の前後、分）
  const [beforeMin, setBeforeMin] = useState(5);
  const [afterMin, setAfterMin] = useState(5);

  const baseMs = selected?.replayAt
    ? new Date(selected.replayAt).getTime()
    : Date.now();
  const startMs = baseMs - beforeMin * 60000;
  const endMs = baseMs + afterMin * 60000;
  const totalMin = beforeMin + afterMin;

  const syncedAvail = syncMode === "SYNCED" && synced.length > 0;
  const targets =
    target === "synced" && syncedAvail
      ? synced
      : selected
        ? [selected]
        : [];
  const sourceIds = targets.map((t) => t.sourceId).filter(Boolean) as string[];
  const targetNames = targets.map((t) => t.sourceName ?? t.sourceId).join(" ・ ");

  const handleClose = (o: boolean) => {
    if (!o) {
      setTitle("");
      setNote("");
      setDone(null);
    }
    onOpenChange(o);
  };

  const handleSave = async () => {
    if (!title || sourceIds.length === 0) return;
    setSaving(true);
    setDone(null);
    setSaveError(null);
    try {
      const res = await api.createIncident({
        title,
        reason,
        note: note || null,
        start: new Date(startMs).toISOString(),
        end: new Date(endMs).toISOString(),
        sourceIds,
      });
      setDone(res);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-45 flex items-center justify-center"
      style={{ background: "rgba(4,6,10,.66)", backdropFilter: "blur(3px)" }}
      onClick={() => handleClose(false)}
    >
      <div
        className="overflow-hidden rounded-[11px] border border-white/[.12] bg-ink-800"
        style={{ width: 500, maxWidth: "92vw", boxShadow: "0 24px 70px rgba(0,0,0,.6)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between border-b border-white/[.08] px-5 py-[15px]">
          <span className="text-[15px] font-bold">◈ 事故映像を保存</span>
          <button
            onClick={() => handleClose(false)}
            className="grid h-[26px] w-[26px] place-items-center rounded-[5px] text-[17px] text-muted-foreground hover:bg-white/[.08] hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <div className="p-[18px] pb-5">
          {/* 基準時刻・範囲 */}
          <div className="mb-4 rounded-[8px] border border-white/[.08] bg-surface p-3">
            <div className="flex gap-4 font-mono text-[11px]">
              <div>
                <div className="mb-0.5 text-muted-ink">基準時刻</div>
                <div className="text-foreground">
                  {dateISOJST(new Date(baseMs).toISOString())} {clockJST(baseMs)}
                </div>
              </div>
              <div>
                <div className="mb-0.5 text-muted-ink">保存範囲</div>
                <div className="text-foreground">
                  {clockJST(startMs)} 〜 {clockJST(endMs)}
                </div>
              </div>
              <div>
                <div className="mb-0.5 text-muted-ink">合計</div>
                <div className="text-ok">{totalMin}分</div>
              </div>
            </div>
            {/* 範囲指定（基準時刻の前後） */}
            <div className="mt-2.5 flex items-center gap-2 border-t border-white/[.06] pt-2.5 text-[12px] text-[#b7becc]">
              <span>基準の</span>
              <RangeInput value={beforeMin} onChange={setBeforeMin} />
              <span>分前 〜</span>
              <RangeInput value={afterMin} onChange={setAfterMin} />
              <span>分後を保存</span>
            </div>
          </div>

          <FormField label="タイトル">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="搬送停止"
              className="w-full rounded-[7px] border border-white/[.14] bg-surface px-3 py-2.5 text-[13px] text-foreground"
            />
          </FormField>

          <FormField label="保存理由">
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as IncidentReason)}
              className="w-full rounded-[7px] border border-white/[.14] bg-surface px-3 py-2.5 text-[13px] text-foreground"
            >
              {REASONS.map((r) => (
                <option key={r.value} value={r.value} className="bg-ink-800">
                  {r.label}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="メモ">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="輸送中に停止"
              className="h-14 w-full resize-none rounded-[7px] border border-white/[.14] bg-surface px-3 py-2.5 text-[13px] text-foreground"
            />
          </FormField>

          <FormField label="保存対象">
            <div className="flex flex-col gap-2">
              <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-[#c3ccdb]">
                <input
                  type="radio"
                  name="inctgt"
                  checked={target === "selected"}
                  onChange={() => setTarget("selected")}
                  style={{ accentColor: ACCENT }}
                />
                選択中Paneのみ（{selected?.sourceName ?? "—"}）
              </label>
              <label
                className="flex items-center gap-2 text-[12.5px]"
                style={{
                  color: syncedAvail ? "#c3ccdb" : "#4a5262",
                  cursor: syncedAvail ? "pointer" : "not-allowed",
                }}
              >
                <input
                  type="radio"
                  name="inctgt"
                  checked={target === "synced"}
                  onChange={() => syncedAvail && setTarget("synced")}
                  disabled={!syncedAvail}
                  style={{ accentColor: ACCENT }}
                />
                同期中Paneすべて（{syncedAvail ? `${synced.length}件を同一事故として保存` : "SYNCED時のみ"}）
              </label>
            </div>
            {targetNames && (
              <div className="mt-1 text-[10.5px] text-muted-ink">{targetNames}</div>
            )}
          </FormField>

          {done && (
            <div className="mb-3 rounded-[8px] bg-ok/10 px-3 py-2 text-[12px]">
              <div className="mb-1.5 font-bold text-ok">
                ✓ 事故映像を保存しました（自動削除の対象外）
              </div>
              {done.dir && (
                <div className="mb-1 font-mono text-[10.5px] text-[#9fb0a6]">
                  保存先: {done.dir}
                </div>
              )}
              {done.results.map((r) => (
                <div key={r.sourceId} className="font-mono text-[10.5px] text-[#9fb0a6]">
                  {r.success && r.path ? (
                    <>
                      {r.path.split("/").pop()}
                      {r.url && (
                        <a
                          href={r.url}
                          download
                          className="ml-2 text-ok underline"
                        >
                          ダウンロード
                        </a>
                      )}
                    </>
                  ) : (
                    <span className="text-live">
                      {r.sourceId}: ✕ {r.message ?? r.errorCode}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
          {saveError && (
            <div className="mb-3 rounded-[8px] border border-live/30 bg-live/10 px-3 py-2 text-[12px] text-[#f0b8bb]">
              ✕ {saveError}
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="flex justify-end gap-2 border-t border-white/[.08] px-5 py-3.5">
          <button
            onClick={() => handleClose(false)}
            className="rounded-[7px] border border-white/[.14] bg-transparent px-4 py-2.5 text-[12.5px] font-semibold text-[#c3ccdb]"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={!title || sourceIds.length === 0 || saving || totalMin === 0}
            className="rounded-[7px] border-none px-[18px] py-2.5 text-[12.5px] font-extrabold disabled:opacity-40"
            style={{ background: "#e6a53a", color: "#1a1204" }}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            削除対象外で保存
          </button>
        </div>
      </div>
    </div>
  );
}

function RangeInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="number"
      min={0}
      max={60}
      value={value}
      onChange={(e) =>
        onChange(Math.max(0, Math.min(60, parseInt(e.target.value) || 0)))
      }
      className="w-[60px] rounded-[6px] border border-white/[.14] bg-[#070a0f] px-2 py-1.5 font-mono text-[12.5px] text-foreground"
    />
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3.5">
      <label className="mb-[7px] block text-[11px] font-semibold text-[#8b93a3]">
        {label}
      </label>
      {children}
    </div>
  );
}
