/** The site blocked us, rate limited us or showed a CAPTCHA. We back off and log. */
export class BlockedError extends Error {
  constructor(
    message: string,
    public readonly url: string,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

/** robots.txt disallows this URL for our user agent. */
export class RobotsDisallowedError extends Error {
  constructor(public readonly url: string) {
    super(`robots.txt disallows ${url}`);
  }
}

/** Markers that only appear on challenge pages. */
const STRONG_MARKERS = [
  /<title>\s*just a moment/i,
  /cf-challenge|cf_chl_opt|challenges\.cloudflare\.com\/turnstile/i,
  /captcha-delivery\.com|px-captcha|perimeterx/i,
];

/** Markers that can appear on normal pages, so they only count on small pages. */
const WEAK_MARKERS = [/g-recaptcha|hcaptcha\.com/i, /are you a robot|verify you are human|unusual traffic from your computer/i];

export function looksBlocked(status: number, body: string): string | null {
  if (status === 429) return "Rate limited (429)";
  if (status === 403 || status === 401) return `Access denied (${status})`;
  const head = body.slice(0, 30_000);
  if (STRONG_MARKERS.some((re) => re.test(head))) return "Bot challenge detected";
  if (body.length < 60_000 && WEAK_MARKERS.some((re) => re.test(head))) return "CAPTCHA detected";
  if (status === 503 && /captcha|challenge/i.test(head)) return "Bot challenge (503)";
  return null;
}
