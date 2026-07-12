import "@testing-library/jest-dom/vitest";

import { afterAll, afterEach, beforeAll } from "vitest";

import { server } from "../src/mocks/server";

// jsdom 環境で localStorage の polyfill（Zustand persist 用）
const store = new Map<string, string>();
const localStorageMock: Storage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => {
    store.set(k, v);
  },
  removeItem: (k: string) => {
    store.delete(k);
  },
  clear: () => store.clear(),
  key: (i: number) => Array.from(store.keys())[i] ?? null,
  get length() {
    return store.size;
  },
};
if (typeof globalThis.localStorage === "undefined") {
  Object.defineProperty(globalThis, "localStorage", {
    value: localStorageMock,
    configurable: true,
  });
}

// MSW を全テストで有効化
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  store.clear();
});
afterAll(() => server.close());

