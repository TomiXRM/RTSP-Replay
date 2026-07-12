/**
 * イベントタブ。
 *
 * タイムラインへマーカー表示されるイベントの入力方法（How-To）と、
 * 手動記録フォーム・直近イベント一覧を提供する。
 * 入力経路: HTTP POST / UDP（ブロードキャスト可）/ ROS 2 ブリッジ。
 */

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { api } from "@/api/client";
import { useSystemStore } from "@/store/system";
import type { TimelineEvent } from "@/types/api";
import { clockJST, dateISOJST } from "@/lib/utils";

const ACCENT = "#c9ff05";

export function EventsView() {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [label, setLabel] = useState("");
  const retentionH = useSystemStore((s) => s.health?.retentionHours ?? 2);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .getEvents(retentionH)
      .then((r) => setEvents(r.events))
      .catch(() => {});
  }, [retentionH]);

  useEffect(() => {
    load();
    const t = window.setInterval(load, 5000);
    return () => window.clearInterval(t);
  }, [load]);

  const handleAdd = async () => {
    if (!label.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.postEvent({ label: label.trim() });
      setLabel("");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "記録に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const host = window.location.hostname || "localhost";

  return (
    <div className="min-h-0 flex-1 overflow-auto p-[22px] pb-10">
      <div className="mx-auto max-w-[980px]">
        <div className="mb-1 text-[15px] font-bold">イベント</div>
        <div className="mb-5 text-[12px] text-[#8b93a3]">
          記録されたイベントはタイムラインに黄色の ▲ マーカーとして表示されます（直近{retentionH}時間＝録画保持期間）。
          マーカーに合わせてタイムラインをクリック/ドラッグすると、その時刻のリプレイへ移動できます。
        </div>

        {/* ===== 手動記録 ===== */}
        <Section title="手動で記録する">
          <div className="flex gap-2">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void handleAdd()}
              placeholder="例: 搬送停止・C3コンベア"
              className="flex-1 rounded-[7px] border border-white/[.14] bg-surface px-3 py-2.5 text-[13px] text-foreground"
            />
            <button
              onClick={handleAdd}
              disabled={!label.trim() || saving}
              className="flex items-center gap-1.5 rounded-[7px] border-none px-[18px] py-2.5 text-[12.5px] font-extrabold disabled:opacity-40"
              style={{ background: ACCENT, color: "#04060a" }}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              今すぐ記録
            </button>
          </div>
          {error && (
            <div className="mt-2 rounded-[8px] border border-live/30 bg-live/10 px-3 py-2 text-[12px] text-[#f0b8bb]">
              ✕ {error}
            </div>
          )}
        </Section>

        {/* ===== How-To ===== */}
        <Section title="方法1: HTTP API（推奨・最も確実）">
          <P>
            任意のマシンから POST するだけで、受信した瞬間の時刻で記録されます。
            <code className="mx-1">ts</code> を ISO 8601 で指定すると過去/未来の時刻も指定できます。
          </P>
          <Code>{`curl -X POST http://${host}:8000/api/v1/events \\
  -H 'Content-Type: application/json' \\
  -d '{"label": "搬送停止"}'

# 時刻を明示する場合
curl -X POST http://${host}:8000/api/v1/events \\
  -H 'Content-Type: application/json' \\
  -d '{"label": "搬送停止", "ts": "2026-07-12T10:30:00+09:00"}'`}</Code>
        </Section>

        <Section title="方法2: UDP（ブロードキャスト可・fire-and-forget）">
          <P>
            監視サーバーは UDP ポート <code className="mx-1">8600</code>（.env の
            <code className="mx-1">EVENT_UDP_PORT</code> で変更、0で無効）で待ち受けています。
            JSON またはプレーンテキストのデータグラムを送ると受信時刻で記録されます。
            同一セグメントの別マシンからはブロードキャスト（例: 192.168.1.255）宛でも受信できます。
          </P>
          <P>
            注意: <code className="mx-1">localhost</code> 指定は IPv6（::1）に解決されて届かない場合があります。
            <code className="mx-1">127.0.0.1</code> か監視サーバーの実IPを指定してください。
            ブロードキャストは送信元と同一ホストではループバックされないため、別マシンから送ってください（確実性重視なら実IP宛のユニキャスト推奨）。
          </P>
          <Code>{`# プレーンテキスト（そのままラベルになる）
echo -n "搬送停止" | nc -u -w1 ${host} 8600

# JSON（ts / sourceId は省略可）
echo -n '{"label": "搬送停止"}' | nc -u -w1 ${host} 8600

# ブロードキャスト（別マシンから。x.x.x.255 は自分のサブネットに合わせる）
python3 -c "
import socket, json
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
s.sendto(json.dumps({'label': '搬送停止'}).encode(), ('192.168.1.255', 8600))
"`}</Code>
        </Section>

        <Section title="方法3: ROS 2 から（topic → イベントブリッジ）">
          <P>
            特定 topic を購読して UDP へ転送する小さなブリッジノードを ROS 2 側で動かします。
            以下を <code className="mx-1">ros2_event_bridge.py</code> として保存し、
            ロボット側（または同一ネットワークの任意のマシン）で実行してください。
          </P>
          <Code>{`#!/usr/bin/env python3
# ros2_event_bridge.py — /event_marker (std_msgs/String) を受けたら監視サーバーへ転送
import json, socket
import rclpy
from rclpy.node import Node
from std_msgs.msg import String

MONITOR = ("${host}", 8600)  # 監視サーバーの IP と UDP ポート

class EventBridge(Node):
    def __init__(self):
        super().__init__("event_bridge")
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.create_subscription(String, "/event_marker", self.on_msg, 10)
        self.get_logger().info(f"event bridge -> udp://{MONITOR[0]}:{MONITOR[1]}")

    def on_msg(self, msg: String):
        self.sock.sendto(json.dumps({"label": msg.data}).encode(), MONITOR)

def main():
    rclpy.init()
    rclpy.spin(EventBridge())

if __name__ == "__main__":
    main()`}</Code>
          <P>動作確認（ブリッジ起動後、別ターミナルから）:</P>
          <Code>{`python3 ros2_event_bridge.py &

ros2 topic pub --once /event_marker std_msgs/msg/String "data: 搬送停止テスト"`}</Code>
          <P>
            pub した瞬間にこのページの一覧とタイムラインへマーカーが入ります。
            独自メッセージ型を使う場合は <code className="mx-1">on_msg</code> で
            label 文字列を組み立てて送るだけです（ヘッダの stamp を使いたい場合は
            JSON に <code className="mx-1">ts</code> を ISO 8601 で入れてください）。
          </P>
        </Section>

        {/* ===== 直近イベント一覧 ===== */}
        <Section title={`直近${retentionH}時間のイベント（${events.length}件・5秒ごとに自動更新）`}>
          {events.length === 0 ? (
            <div className="py-4 text-center text-[12px] text-muted-ink">
              イベントはまだありません。上のフォームやコマンドで記録するとここに表示されます。
            </div>
          ) : (
            <div className="overflow-hidden rounded-[8px] border border-white/[.08]">
              {events.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center gap-3 border-b border-white/[.05] bg-surface px-3 py-2 last:border-b-0"
                >
                  <span
                    className="h-2 w-2 flex-none"
                    style={{ background: "#e6a53a", clipPath: "polygon(50% 0,100% 100%,0 100%)" }}
                  />
                  <span className="font-mono text-[11.5px] text-[#c3ccdb]">
                    {dateISOJST(e.ts)} {clockJST(new Date(e.ts).getTime())}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground">
                    {e.label}
                  </span>
                  <span className="flex-none rounded-[3px] bg-white/[.06] px-1.5 py-0.5 font-mono text-[9px] text-muted-ink">
                    {e.origin.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="mb-2 text-[13px] font-bold" style={{ color: "#c3ccdb" }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[12px] leading-[1.7] text-[#8b93a3]">{children}</p>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="mb-2 overflow-x-auto rounded-[8px] border border-white/[.08] bg-[#070a0f] px-4 py-3 font-mono text-[11px] leading-[1.6] text-[#c3ccdb]">
      {children}
    </pre>
  );
}
