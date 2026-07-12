/**
 * API クライアントのテスト（SPEC 23章 エラー正規化, 22章 正常系）。
 */

import { describe, expect, it } from "vitest";

import { api } from "@/api/client";
import { ApiError } from "@/types/errors";

describe("api client", () => {
  it("22.1: ソース一覧を取得できる", async () => {
    const res = await api.listSources();
    expect(res.sources.length).toBeGreaterThan(0);
    expect(res.sources[0].id).toBe("robot-overview");
  });

  it("22.2: 不正URL形式は success=false, INVALID_RTSP_URL", async () => {
    const res = await api.testConnection("not-a-url");
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe("INVALID_RTSP_URL");
  });

  it("22.2: 正常URLは接続成功 + 映像情報", async () => {
    const res = await api.testConnection("rtsp://192.168.1.10/main");
    expect(res.success).toBe(true);
    expect(res.codec).toBe("H264");
    expect(res.width).toBe(1920);
  });

  it("23章: 存在しないソースの live は ApiError (SOURCE_NOT_FOUND)", async () => {
    await expect(api.getLive("no-such-id")).rejects.toMatchObject({
      code: "SOURCE_NOT_FOUND",
    });
    try {
      await api.getLive("no-such-id");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).requestId).toBeDefined();
    }
  });

  it("22.6: 録画範囲を取得できる。欠損区間は2つのrangeで表現", async () => {
    const res = await api.getRecordingRanges("robot-overview");
    expect(res.ranges.length).toBe(2);
    expect(res.availableFrom).toBeTruthy();
  });

  it("22.8: 事故保存", async () => {
    const res = await api.createIncident({
      title: "テスト",
      reason: "ROBOT_ERROR",
      start: "2026-07-10T10:00:00Z",
      end: "2026-07-10T10:01:00Z",
      sourceIds: ["robot-overview"],
    });
    expect(res.id).toMatch(/^inc-/);
    expect(res.results[0].success).toBe(true);
  });

  it("NFR-003: ソース一覧に RTSP URL を含まない", async () => {
    const res = await api.listSources();
    const json = JSON.stringify(res);
    expect(json).not.toContain("rtsp://");
    expect(json).not.toContain("password");
  });
});
