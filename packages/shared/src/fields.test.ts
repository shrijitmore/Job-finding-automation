import { describe, expect, it } from "vitest";
import { FIELDS, FIELD_TEMPLATE, ROLE_CATALOG, findRoleType } from "./fields";

describe("role catalog", () => {
  it("has unique ids", () => {
    const ids = ROLE_CATALOG.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers every field", () => {
    for (const f of FIELDS) {
      expect(ROLE_CATALOG.some((r) => r.field === f)).toBe(true);
      expect(FIELD_TEMPLATE[f]).toBeDefined();
    }
  });

  it("finds roles by id", () => {
    expect(findRoleType("video:video-editor")?.label).toBe("Video Editor");
  });
});
