import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";

/** Derives a 32 byte key from ENCRYPTION_KEY (any string, hex or base64 recommended). */
export function deriveKey(secret: string): Buffer {
  if (!secret || secret.length < 16) {
    throw new Error("ENCRYPTION_KEY must be at least 16 characters");
  }
  return createHash("sha256").update(secret).digest();
}

/** Encrypts a JSON-serialisable value. Output: v1.<iv>.<tag>.<ciphertext> (base64url). */
export function encryptJson(value: unknown, secret: string): string {
  const key = deriveKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptJson<T = unknown>(payload: string, secret: string): T {
  const [version, iv, tag, data] = payload.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Unrecognised ciphertext format");
  const decipher = createDecipheriv(ALGO, deriveKey(secret), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const plain = Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]);
  return JSON.parse(plain.toString("utf8")) as T;
}

export function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Shows the last four characters of a secret, for display in settings. */
export function maskSecret(secret: string): string {
  if (secret.length <= 4) return "****";
  return `****${secret.slice(-4)}`;
}
