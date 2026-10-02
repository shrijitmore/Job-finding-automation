import { describe, expect, it } from "vitest";
import { decryptJson, encryptJson, maskSecret } from "./crypto";

const KEY = "test-encryption-key-123456";

describe("crypto", () => {
  it("round trips JSON", () => {
    const enc = encryptJson({ token: "abc", n: 1 }, KEY);
    expect(enc).not.toContain("abc");
    expect(decryptJson(enc, KEY)).toEqual({ token: "abc", n: 1 });
  });

  it("uses a fresh IV each time", () => {
    expect(encryptJson("x", KEY)).not.toEqual(encryptJson("x", KEY));
  });

  it("rejects a wrong key and tampering", () => {
    const enc = encryptJson("secret", KEY);
    expect(() => decryptJson(enc, "another-key-1234567")).toThrow();
    const parts = enc.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptJson(parts.join("."), KEY)).toThrow();
  });

  it("masks secrets", () => {
    expect(maskSecret("sk-ant-123456789")).toBe("****6789");
  });
});
