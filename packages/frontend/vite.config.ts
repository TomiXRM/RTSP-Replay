/// <reference types="vitest" />
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";

// SPEC: バックエンド(/api)・MediaMTX(HLS /streams, 再生 /playback) をプロキシ。
// フロントはMediaMTX固有URLを直接組まない（SPEC 22.7注記）。
//
// プロキシ先はプロジェクトルートの .env から読む（バックエンドと同じキー）。
// ポートを変える場合は config/mediamtx.yml（待受）と .env（参照URL）の2箇所で完結する。

/** プロジェクトルートの .env を読む（KEY=VALUE、# コメント対応の最小パーサ）。 */
function rootEnv(): Record<string, string> {
  const envPath = path.resolve(__dirname, "../../.env");
  const values: Record<string, string> = {};
  if (!fs.existsSync(envPath)) return values;
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const s = line.trim();
    if (!s || s.startsWith("#") || !s.includes("=")) continue;
    const [k, ...rest] = s.split("=");
    values[k.trim()] = rest.join("=").trim().replace(/^["']|["']$/g, "");
  }
  return values;
}

const env = rootEnv();
const API_TARGET = `http://localhost:${env.API_PORT ?? "8000"}`;
const HLS_TARGET = env.MEDIAMTX_HLS_BASE ?? "http://localhost:8888";
const PB_TARGET = env.MEDIAMTX_PLAYBACK_BASE ?? "http://localhost:9996";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: Number(env.UI_PORT ?? 5173),
    host: true, // LAN内の他マシンからのアクセスを許可
    proxy: {
      // 監視バックエンド API
      "/api": {
        target: API_TARGET,
        changeOrigin: true,
      },
      // 事故映像（独立MP4）のダウンロード
      "/incidents": {
        target: API_TARGET,
        changeOrigin: true,
      },
      // MediaMTX HLS（ライブ配信）。
      // フロントの URL 空間 /streams/{path} を MediaMTX の /{path} へ rewrite。
      // MediaMTX は cookieCheck のため絶対パスへ 302 を返すので、
      // Location ヘッダへ /streams プレフィックスを付け直す。
      "/streams": {
        target: HLS_TARGET,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/streams/, ""),
        configure: (proxy) => {
          proxy.on("proxyRes", (proxyRes) => {
            const loc = proxyRes.headers["location"];
            if (typeof loc === "string" && loc.startsWith("/")) {
              proxyRes.headers["location"] = `/streams${loc}`;
            }
          });
        },
      },
      // MediaMTX Playback（過去映像）。
      // /playback/{path} を MediaMTX の /{path} へ rewrite。
      "/playback": {
        target: PB_TARGET,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/playback/, ""),
        configure: (proxy) => {
          proxy.on("proxyRes", (proxyRes) => {
            const loc = proxyRes.headers["location"];
            if (typeof loc === "string" && loc.startsWith("/")) {
              proxyRes.headers["location"] = `/playback${loc}`;
            }
          });
        },
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    css: true,
  },
});
