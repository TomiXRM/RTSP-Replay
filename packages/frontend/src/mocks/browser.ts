/**
 * MSW ブラウザセットアップ。
 *
 * 開発時のみモックを有効化する。本番ビルドでは無効。
 * 有効化は main.tsx で VITE_USE_MOCKS フラグで制御。
 */

import { setupWorker } from "msw/browser";

import { handlers } from "./fixtures";

export const worker = setupWorker(...handlers);
