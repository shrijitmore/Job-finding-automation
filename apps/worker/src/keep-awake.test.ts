import { afterEach, describe, expect, it, vi } from "vitest";
import { KeepAwake } from "./keep-awake";

describe("KeepAwake", () => {
  afterEach(() => vi.useRealTimers());

  it("pings only while jobs run, across overlapping jobs", async () => {
    vi.useFakeTimers();
    const pings: string[] = [];
    const k = new KeepAwake("https://w.example/health", 1000, async (u) => pings.push(u));
    let finishA!: () => void;
    let finishB!: () => void;
    const a = k.during(() => new Promise<void>((r) => (finishA = r)));
    const b = k.during(() => new Promise<void>((r) => (finishB = r)));
    await vi.advanceTimersByTimeAsync(2500);
    expect(pings).toHaveLength(2);
    finishA();
    await a;
    expect(k.active).toBe(true);
    finishB();
    await b;
    expect(k.active).toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(pings).toHaveLength(2);
  });

  it("does nothing without a URL and still propagates errors", async () => {
    const k = new KeepAwake(undefined);
    await expect(k.during(async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(k.active).toBe(false);
  });
});

describe("keepAwakeUrl", () => {
  it("prefers KEEP_AWAKE_URL, then Render's public URL", async () => {
    const { keepAwakeUrl } = await import("./infra.module");
    expect(keepAwakeUrl({ KEEP_AWAKE_URL: "https://a/x", RENDER_EXTERNAL_URL: "https://b" })).toBe("https://a/x");
    expect(keepAwakeUrl({ RENDER_EXTERNAL_URL: "https://b/" })).toBe("https://b/health");
    expect(keepAwakeUrl({})).toBeUndefined();
  });
});
