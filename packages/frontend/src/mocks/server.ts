/**
 * MSW Node セットアップ（Vitest 用）。
 */

import { setupServer } from "msw/node";

import { handlers } from "./fixtures";

export const server = setupServer(...handlers);
