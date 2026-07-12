/** @type {import('tailwindcss').Config} */
import type { Config } from "tailwindcss";

// 監視UI ダークテーマ（monitor_sample.html 準拠）
// アクセント #c9ff05（黄緑） / OK #46c98b / WARN #e6a53a / DANGER #ec4b52 / LIVE #ff6b71
const config: Config = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ベース
        ink: {
          950: "#07090d",
          900: "#0a0d13",
          850: "#0c0f16",
          800: "#0e121a",
          700: "#12161f",
          600: "#1a1f2a",
        },
        // 状態色
        accent: {
          DEFAULT: "#c9ff05",
          foreground: "#04060a",
        },
        ok: "#46c98b",
        warn: "#e6a53a",
        danger: "#ec4b52",
        live: "#ff6b71",
        muted: {
          DEFAULT: "#0a0d13",
          foreground: "#7b8395",
          ink: "#6f7889",
        },
        surface: {
          DEFAULT: "#070a0f",
          card: "#12161f",
        },
      },
      fontFamily: {
        sans: ['"Zen Kaku Gothic New"', "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      borderRadius: {
        DEFAULT: "7px",
      },
    },
  },
  plugins: [],
};

export default config;
