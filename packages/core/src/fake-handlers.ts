import type { FakeHandler } from "./fake-llm";
import { SAMPLE_RESUME } from "./fixtures";

/** Default fake responses per purpose. Later phases register more purposes here. */
export function defaultFakeHandlers(): Record<string, FakeHandler> {
  return {
    resume_parse: () => SAMPLE_RESUME,
  };
}
