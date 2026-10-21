import { mkdir, copyFile, readFile } from "node:fs/promises";
import path from "node:path";
import type { Asset } from "./types";
import { sqlite } from "./db";
import { reserve } from "./quota";
export interface StorageProvider {
  export(assets: Asset[], sourceRoot: string): Promise<void>;
}
export class ManualStorage implements StorageProvider {
  async export() {
    /* Authenticated local files can be downloaded from the asset library. */
  }
}
export class PublicLocalStorage implements StorageProvider {
  async export(assets: Asset[], sourceRoot: string) {
    const root = process.env.PUBLIC_MEDIA_DIR;
    if (!root)
      throw Error(
        "PUBLIC_MEDIA_DIR must point to a dedicated public media directory",
      );
    const destination = path.resolve(root);
    for (const a of assets) {
      if (a.mock) continue;
      const target = path.resolve(destination, a.path);
      if (!target.startsWith(destination + path.sep))
        throw Error("Invalid media path");
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(path.join(sourceRoot, a.path), target);
    }
  }
}
export function reserveStorage(
  backend: string,
  key: string,
  bytes: number,
  cap: number,
) {
  sqlite.transaction(() => {
    const total = (
      sqlite
        .prepare(
          "SELECT COALESCE(SUM(bytes),0) n FROM storage_objects WHERE backend=?",
        )
        .get(backend) as { n: number }
    ).n;
    const existing =
      (
        sqlite
          .prepare(
            "SELECT bytes FROM storage_objects WHERE backend=? AND key=?",
          )
          .get(backend, key) as { bytes: number } | undefined
      )?.bytes || 0;
    if (!Number.isFinite(cap) || total - existing + bytes > cap)
      throw Error("Storage quota guard: export paused");
    sqlite
      .prepare(
        "INSERT INTO storage_objects VALUES (?,?,?) ON CONFLICT(backend,key) DO UPDATE SET bytes=excluded.bytes",
      )
      .run(backend, key, bytes);
  })();
}
export class R2Storage implements StorageProvider {
  async export(assets: Asset[], sourceRoot: string) {
    const account = process.env.R2_ACCOUNT_ID,
      bucket = process.env.R2_BUCKET;
    if (
      !account ||
      !bucket ||
      !process.env.R2_ACCESS_KEY_ID ||
      !process.env.R2_SECRET_ACCESS_KEY
    )
      throw Error(
        "Configure optional R2 credentials and a dedicated empty bucket",
      );
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = new S3Client({
      region: "auto",
      endpoint: `https://${account}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
      maxAttempts: 1,
    });
    for (const asset of assets) {
      if (asset.mock) continue;
      const resolved = path.resolve(sourceRoot, asset.path);
      if (!resolved.startsWith(path.resolve(sourceRoot) + path.sep))
        throw Error("Invalid media path");
      const body = await readFile(resolved);
      reserveStorage(
        `r2:${bucket}`,
        asset.path,
        body.length,
        Number(process.env.R2_STORAGE_CAP_BYTES || 5 * 1024 ** 3),
      );
      reserve("r2-write", 1, Number(process.env.R2_DAILY_WRITE_LIMIT || 100));
      const types: Record<string, string> = {
        jpg: "image/jpeg",
        png: "image/png",
        mp4: "video/mp4",
        mp3: "audio/mpeg",
        wav: "audio/wav",
      };
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: asset.path,
          Body: body,
          ContentType:
            types[asset.path.split(".").at(-1)!] || "application/octet-stream",
          Metadata: { license: Buffer.from(asset.license).toString("base64") },
        }),
      );
    }
    client.destroy();
  }
}
export async function exportAssets(assets: Asset[], sourceRoot: string) {
  const storage =
    process.env.STORAGE_PROVIDER === "r2"
      ? new R2Storage()
      : process.env.PUBLIC_MEDIA_DIR
        ? new PublicLocalStorage()
        : new ManualStorage();
  await storage.export(assets, sourceRoot);
}
