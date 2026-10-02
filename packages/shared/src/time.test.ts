import { describe, expect, it } from "vitest";
import { cronForTime, dateInTz, runCap, startOfDayInTz } from "./time";

describe("time helpers", () => {
  it("finds the local date and start of day", () => {
    const at = new Date("2026-10-02T20:00:00Z");
    expect(dateInTz(at, "Asia/Kolkata")).toBe("2026-10-03");
    expect(startOfDayInTz(at, "Asia/Kolkata").toISOString()).toBe("2026-10-02T18:30:00.000Z");
    expect(startOfDayInTz(at, "America/New_York").toISOString()).toBe("2026-10-02T04:00:00.000Z");
    expect(startOfDayInTz(new Date("2026-03-08T15:00:00Z"), "America/New_York").toISOString()).toBe("2026-03-08T05:00:00.000Z");
  });

  it("builds cron expressions", () => {
    expect(cronForTime("07:00")).toBe("0 7 * * *");
    expect(cronForTime("19:30")).toBe("30 19 * * *");
  });

  it("splits the daily cap across runs", () => {
    expect(runCap(15, 2, 0)).toBe(8);
    expect(runCap(15, 2, 8)).toBe(7);
    expect(runCap(15, 2, 15)).toBe(0);
    expect(runCap(10, 3, 0)).toBe(4);
  });
});
