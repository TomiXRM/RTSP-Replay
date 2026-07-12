/**
 * カメラ設定編集ダイアログ（sources.toml / .env）。
 *
 * どちらも Web UI から閲覧・編集できる。保存時はバックエンドが検証し、
 * 成功すると再起動なしでソース一覧・MediaMTX・認証情報へ反映される。
 * .env はパスワードを含むため表示に注意（LAN内利用前提）。
 */

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { api } from "@/api/client";
import { useSystemStore } from "@/store/system";

const ACCENT = "#c9ff05";

type Tab = "toml" | "env";

export function SourcesTomlDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const refresh = useSystemStore((s) => s.refresh);
  const [tab, setTab] = useState<Tab>("toml");
  const [contents, setContents] = useState<Record<Tab, string>>({ toml: "", env: "" });
  const [paths, setPaths] = useState<Record<Tab, string>>({ toml: "", env: "" });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTab("toml");
    setError(null);
    setSaved(null);
    setLoading(true);
    Promise.all([api.getSourcesToml(), api.getEnv()])
      .then(([t, e]) => {
        setContents({ toml: t.content, env: e.content });
        setPaths({ toml: t.path, env: e.path });
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "設定の読込に失敗しました"),
      )
      .finally(() => setLoading(false));
  }, [open]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      if (tab === "toml") {
        const r = await api.putSourcesToml(contents.toml);
        setSaved(`保存して反映しました（${r.sourceIds.length} ソース: ${r.sourceIds.join(", ")}）`);
      } else {
        const r = await api.putEnv(contents.env);
        setSaved(`保存して反映しました（${r.keys.length} キー: ${r.keys.join(", ")}）`);
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center"
      style={{ background: "rgba(4,6,10,.66)", backdropFilter: "blur(3px)" }}
      onClick={() => onOpenChange(false)}
    >
      <div
        className="overflow-hidden rounded-[11px] border border-white/[.12] bg-ink-800"
        style={{ width: 680, maxWidth: "94vw", boxShadow: "0 24px 70px rgba(0,0,0,.6)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between border-b border-white/[.08] px-5 py-4">
          <div>
            <span className="text-[15px] font-bold">カメラ設定</span>
            <span className="ml-3 font-mono text-[10px] text-muted-ink">{paths[tab]}</span>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="grid h-[26px] w-[26px] place-items-center rounded-[5px] text-[17px] text-muted-foreground hover:bg-white/[.08] hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <div className="p-[18px]">
          {/* タブ */}
          <div className="mb-3 flex gap-0.5 rounded-[8px] border border-white/[.08] bg-surface p-[3px]">
            <TabBtn active={tab === "toml"} onClick={() => { setTab("toml"); setError(null); setSaved(null); }}>
              sources.toml（カメラ定義）
            </TabBtn>
            <TabBtn active={tab === "env"} onClick={() => { setTab("env"); setError(null); setSaved(null); }}>
              .env（認証情報）
            </TabBtn>
          </div>

          <textarea
            value={contents[tab]}
            onChange={(e) => setContents({ ...contents, [tab]: e.target.value })}
            disabled={loading}
            spellCheck={false}
            className="h-[340px] w-full resize-none rounded-[7px] border border-white/[.14] bg-[#070a0f] px-3 py-2.5 font-mono text-[12px] leading-[1.6] text-foreground"
          />

          <p className="mt-2 text-[10.5px] leading-[1.6] text-muted-ink">
            {tab === "toml" ? (
              <>
                保存すると検証のうえファイルへ書き込み、再起動なしでカメラ一覧と MediaMTX
                へ反映します（直前の内容は sources.toml.bak に退避）。
                認証情報は URL に直書きせず、username_env / password_env で .env
                の環境変数を参照する形式を推奨します。
              </>
            ) : (
              <>
                KEY=VALUE 形式（# はコメント）。保存すると .env
                へ書き込み、username_env / password_env で参照している認証情報は
                <b className="mx-1 text-[#c3ccdb]">再起動なしで即時反映</b>
                されます（直前の内容は .env.bak に退避）。パスワードが画面に表示されるため、
                周囲に注意してください。ポート等のサーバ設定変更は再起動が必要です。
              </>
            )}
          </p>

          {saved && (
            <div className="mt-3 rounded-[8px] bg-ok/10 px-3 py-2 text-[12px] text-ok">
              ✓ {saved}
            </div>
          )}
          {error && (
            <div className="mt-3 rounded-[8px] border border-live/30 bg-live/10 px-3 py-2 text-[12px] text-[#f0b8bb]">
              ✕ {error}
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="flex justify-end gap-2 border-t border-white/[.08] px-5 py-3.5">
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-[7px] border border-white/[.14] bg-transparent px-4 py-2.5 text-[12.5px] font-semibold text-[#c3ccdb]"
          >
            閉じる
          </button>
          <button
            onClick={handleSave}
            disabled={loading || saving}
            className="flex items-center gap-1.5 rounded-[7px] border-none px-[18px] py-2.5 text-[12.5px] font-extrabold disabled:opacity-40"
            style={{ background: ACCENT, color: "#04060a" }}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            保存して反映
          </button>
        </div>
      </div>
    </div>
  );
}

function TabBtn({
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
      className="flex-1 rounded-[6px] border-none py-2 text-[12px] font-semibold"
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
