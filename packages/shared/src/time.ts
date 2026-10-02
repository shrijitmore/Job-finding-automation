/** Calendar date (YYYY-MM-DD) of an instant in a time zone. */
export function dateInTz(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Offset of a time zone from UTC at an instant, in minutes. */
export function tzOffsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const n = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/** The UTC instant when the local day containing `at` began in `timeZone`. */
export function startOfDayInTz(at: Date, timeZone: string): Date {
  const [y, m, d] = dateInTz(at, timeZone).split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  // Two passes handle days where the offset changes (DST).
  let ts = guess - tzOffsetMinutes(new Date(guess), timeZone) * 60_000;
  ts = guess - tzOffsetMinutes(new Date(ts), timeZone) * 60_000;
  return new Date(ts);
}

/** Converts "HH:MM" into a 5-field cron expression. */
export function cronForTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${m} ${h} * * *`;
}

/** Applications allowed in one run: the daily cap split evenly across run times, limited by what is left today. */
export function runCap(dailyCap: number, runsPerDay: number, usedToday: number): number {
  const perRun = Math.ceil(dailyCap / Math.max(1, runsPerDay));
  return Math.max(0, Math.min(perRun, dailyCap - usedToday));
}
