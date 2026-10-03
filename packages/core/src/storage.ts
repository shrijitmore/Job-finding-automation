import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export interface ObjectStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
}

/** Local filesystem storage for development and tests. */
export class LocalStorage implements ObjectStorage {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new Error("Invalid storage key");
    return full;
  }

  async put(key: string, body: Buffer): Promise<void> {
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }
}

export interface S3StorageOptions {
  bucket: string;
  endpoint?: string;
  region?: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/** S3-compatible storage (AWS S3, Cloudflare R2, MinIO). */
export class S3Storage implements ObjectStorage {
  private readonly client: S3Client;

  constructor(private readonly opts: S3StorageOptions) {
    this.client = new S3Client({
      region: opts.region ?? "auto",
      endpoint: opts.endpoint,
      forcePathStyle: Boolean(opts.endpoint),
      credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey },
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.opts.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.opts.bucket, Key: key }));
    if (!res.Body) throw new Error(`Object ${key} has no body`);
    return Buffer.from(await res.Body.transformToByteArray());
  }
}

export interface GcsStorageOptions {
  bucket: string;
  /** Service account key JSON. When omitted, Application Default Credentials are used (e.g. on GCP). */
  credentialsJson?: string;
  /** Optional key prefix, e.g. "prod/". */
  prefix?: string;
}

/** Google Cloud Storage. */
export class GcsStorage implements ObjectStorage {
  private readonly bucketPromise: Promise<import("@google-cloud/storage").Bucket>;

  constructor(private readonly opts: GcsStorageOptions) {
    this.bucketPromise = import("@google-cloud/storage").then(({ Storage }) => {
      const creds = opts.credentialsJson ? (JSON.parse(decodeCredentials(opts.credentialsJson)) as { project_id?: string }) : undefined;
      const storage = new Storage(creds ? { credentials: creds as never, projectId: creds.project_id } : {});
      return storage.bucket(opts.bucket);
    });
  }

  private key(k: string) {
    return `${this.opts.prefix ?? ""}${k}`;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    const bucket = await this.bucketPromise;
    await bucket.file(this.key(key)).save(body, { contentType, resumable: false });
  }

  async get(key: string): Promise<Buffer> {
    const bucket = await this.bucketPromise;
    const [data] = await bucket.file(this.key(key)).download();
    return data;
  }
}

/** Accepts the service account JSON as raw JSON or base64 (easier to paste into env vars). */
export function decodeCredentials(value: string): string {
  const t = value.trim();
  return t.startsWith("{") ? t : Buffer.from(t, "base64").toString("utf8");
}

export function createStorageFromEnv(env: NodeJS.ProcessEnv = process.env): ObjectStorage {
  if (env.GCS_BUCKET) {
    return new GcsStorage({ bucket: env.GCS_BUCKET, credentialsJson: env.GCS_CREDENTIALS_JSON || undefined, prefix: env.GCS_PREFIX || undefined });
  }
  if (env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY) {
    return new S3Storage({
      bucket: env.S3_BUCKET,
      endpoint: env.S3_ENDPOINT || undefined,
      region: env.S3_REGION || "auto",
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    });
  }
  return new LocalStorage(env.LOCAL_STORAGE_DIR ?? path.resolve(process.cwd(), "storage-local"));
}
