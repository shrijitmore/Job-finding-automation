import { describe, expect, it } from "vitest";
import { GcsStorage, LocalStorage, S3Storage, createStorageFromEnv, decodeCredentials, type ObjectStorage } from "./storage";

describe("storage factory", () => {
  it("picks GCS, then S3, then local disk", () => {
    expect(createStorageFromEnv({ GCS_BUCKET: "b", GCS_CREDENTIALS_JSON: '{"project_id":"p","client_email":"x@y","private_key":"k"}' })).toBeInstanceOf(GcsStorage);
    expect(createStorageFromEnv({ S3_BUCKET: "b", S3_ACCESS_KEY_ID: "a", S3_SECRET_ACCESS_KEY: "s" })).toBeInstanceOf(S3Storage);
    expect(createStorageFromEnv({})).toBeInstanceOf(LocalStorage);
  });

  it("accepts raw or base64 service account JSON", () => {
    const json = '{"a":1}';
    expect(decodeCredentials(json)).toBe(json);
    expect(decodeCredentials(Buffer.from(json).toString("base64"))).toBe(json);
  });

  it("rejects keys that escape the local root", async () => {
    const s: ObjectStorage = new LocalStorage("/tmp/jfa-storage-test");
    await expect(s.put("../evil", Buffer.from("x"), "text/plain")).rejects.toThrow();
    await s.put("a/b.txt", Buffer.from("hi"), "text/plain");
    expect((await s.get("a/b.txt")).toString()).toBe("hi");
  });
});
