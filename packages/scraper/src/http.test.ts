import { describe, expect, it } from "vitest";
import { BlockedError, RobotsDisallowedError } from "./errors";
import { PoliteFetcher } from "./http";
import { fakeFetch } from "./test-helpers";

function fetcher(routes: Parameters<typeof fakeFetch>[0], random = 0.5) {
  const { impl, calls } = fakeFetch(routes);
  const sleeps: number[] = [];
  let clock = 0;
  const f = new PoliteFetcher({
    fetchImpl: impl,
    random: () => random,
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
  });
  return { f, calls, sleeps };
}

describe("PoliteFetcher", () => {
  it("waits a random 2 to 5 seconds between requests to the same host", async () => {
    const { f, sleeps } = fetcher({ "https://a.com/1": "x", "https://a.com/2": "y", "https://a.com/3": "z" }, 0.5);
    await f.get("https://a.com/1");
    await f.get("https://a.com/2");
    await f.get("https://a.com/3");
    expect(sleeps.length).toBeGreaterThanOrEqual(2);
    for (const s of sleeps) {
      expect(s).toBeGreaterThanOrEqual(2000);
      expect(s).toBeLessThanOrEqual(5000);
    }
  });

  it("does not delay requests to different hosts", async () => {
    const { f, sleeps } = fetcher({ "https://a.com/": "x", "https://b.com/": "y" });
    await f.get("https://a.com/");
    await f.get("https://b.com/");
    expect(sleeps.filter((s) => s > 0)).toHaveLength(2); // only the robots.txt -> page gap on each host
  });

  it("fetches robots.txt once per origin and obeys it", async () => {
    const { f, calls } = fetcher({
      "https://a.com/robots.txt": "User-agent: *\nDisallow: /admin\n\nUser-agent: JobAutopilotBot\nDisallow: /secret",
      "https://a.com/jobs": "ok",
    });
    await f.get("https://a.com/jobs");
    await expect(f.get("https://a.com/secret/x")).rejects.toBeInstanceOf(RobotsDisallowedError);
    expect(calls.filter((c) => c.endsWith("robots.txt"))).toHaveLength(1);
  });

  it("treats a 5xx robots.txt as disallow-all", async () => {
    const { f } = fetcher({ "https://a.com/robots.txt": { status: 503, body: "down" }, "https://a.com/jobs": "ok" });
    await expect(f.get("https://a.com/jobs")).rejects.toBeInstanceOf(RobotsDisallowedError);
  });

  it("raises BlockedError on 403 and CAPTCHA pages", async () => {
    const { f } = fetcher({
      "https://a.com/denied": { status: 403, body: "nope" },
      "https://a.com/captcha": "<html><title>Just a moment...</title></html>",
    });
    await expect(f.get("https://a.com/denied")).rejects.toBeInstanceOf(BlockedError);
    await expect(f.get("https://a.com/captcha")).rejects.toBeInstanceOf(BlockedError);
  });

  it("does not flag big job pages that merely load reCAPTCHA", async () => {
    const big = `<html><script src="https://www.google.com/recaptcha/api.js"></script>${"<p>job</p>".repeat(10_000)}</html>`;
    const { f } = fetcher({ "https://a.com/job": big });
    await expect(f.get("https://a.com/job")).resolves.toMatchObject({ status: 200 });
  });
});
