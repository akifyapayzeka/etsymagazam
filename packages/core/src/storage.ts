import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnv } from "./env.js";

export interface Storage {
  /** Writes a buffer and returns the path/key it was stored under (relative). */
  write(relativePath: string, data: Buffer): Promise<string>;
  read(relativePath: string): Promise<Buffer>;
  /** A URL/path usable to reference the object (signed URL for S3, absolute path for local). */
  resolveUrl(relativePath: string): Promise<string>;
}

class LocalStorage implements Storage {
  constructor(private readonly root: string) {}

  async write(relativePath: string, data: Buffer): Promise<string> {
    const fullPath = path.join(this.root, relativePath);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, data);
    return relativePath;
  }

  async read(relativePath: string): Promise<Buffer> {
    return readFile(path.join(this.root, relativePath));
  }

  async resolveUrl(relativePath: string): Promise<string> {
    return path.join(this.root, relativePath);
  }
}

class S3Storage implements Storage {
  constructor(
    private readonly bucket: string,
    private readonly region: string,
    private readonly accessKeyId: string,
    private readonly secretAccessKey: string,
    private readonly endpoint?: string,
  ) {}

  private async client() {
    const { S3Client } = await import("@aws-sdk/client-s3");
    return new S3Client({
      region: this.region,
      credentials: { accessKeyId: this.accessKeyId, secretAccessKey: this.secretAccessKey },
      ...(this.endpoint ? { endpoint: this.endpoint, forcePathStyle: true } : {}),
    });
  }

  async write(relativePath: string, data: Buffer): Promise<string> {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.client();
    await client.send(new PutObjectCommand({ Bucket: this.bucket, Key: relativePath, Body: data }));
    return relativePath;
  }

  async read(relativePath: string): Promise<Buffer> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.client();
    const res = await client.send(new GetObjectCommand({ Bucket: this.bucket, Key: relativePath }));
    const chunks: Buffer[] = [];
    for await (const chunk of res.Body as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }

  async resolveUrl(relativePath: string): Promise<string> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const client = await this.client();
    return getSignedUrl(client, new GetObjectCommand({ Bucket: this.bucket, Key: relativePath }), {
      expiresIn: 3600,
    });
  }
}

let cached: Storage | undefined;

export function getStorage(): Storage {
  if (cached) return cached;
  const env = loadEnv();
  cached =
    env.STORAGE_DRIVER === "s3"
      ? new S3Storage(env.S3_BUCKET, env.S3_REGION, env.S3_ACCESS_KEY_ID, env.S3_SECRET_ACCESS_KEY, env.S3_ENDPOINT || undefined)
      : new LocalStorage(env.STORAGE_LOCAL_PATH);
  return cached;
}
