import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import Database from "better-sqlite3";
function hasEncryptedCredentials(directory: string, content: string) {
  const configured =
    content
      .match(/^DATABASE_PATH=(.*)$/m)?.[1]
      .trim()
      .replace(/^['"]|['"]$/g, "") || "data/autopilot.sqlite";
  const file = path.resolve(directory, configured);
  if (!existsSync(file)) return false;
  let db: Database.Database | undefined;
  try {
    db = new Database(file, { readonly: true });
    const tables = new Set(
      (
        db
          .prepare("SELECT name FROM sqlite_master WHERE type='table'")
          .all() as { name: string }[]
      ).map((row) => row.name),
    );
    return (
      !!(
        tables.has("connections") &&
        db
          .prepare("SELECT id FROM connections WHERE token IS NOT NULL LIMIT 1")
          .get()
      ) ||
      !!(
        tables.has("cache") &&
        db
          .prepare(
            "SELECT key FROM cache WHERE key LIKE 'credential:%' LIMIT 1",
          )
          .get()
      )
    );
  } catch {
    return true;
  } finally {
    db?.close();
  }
}
export function ensureLocalConfiguration(directory = process.cwd()) {
  const file = path.join(directory, ".env"),
    created = !existsSync(file);
  let content = readFileSync(
    created ? path.join(directory, ".env.example") : file,
    "utf8",
  );
  const updated: string[] = [];
  for (const name of ["AUTH_SECRET", "TOKEN_ENCRYPTION_KEY"]) {
    const pattern = new RegExp(`^${name}=(.*)$`, "m"),
      value = content
        .match(pattern)?.[1]
        ?.trim()
        .replace(/^['"]|['"]$/g, "");
    if (value || process.env[name]) continue;
    if (
      name === "TOKEN_ENCRYPTION_KEY" &&
      hasEncryptedCredentials(directory, content)
    )
      throw Error(
        "Existing encrypted credentials need their original TOKEN_ENCRYPTION_KEY. Restore it in .env before starting; no keys were replaced.",
      );
    const line = `${name}=${randomBytes(32).toString("hex")}`;
    content = pattern.test(content)
      ? content.replace(pattern, line)
      : `${content.trimEnd()}\n${line}\n`;
    updated.push(name);
  }
  if (created)
    content = content.replace(/^APP_URL=.*$/m, "APP_URL=http://127.0.0.1:3000");
  if (created || updated.length)
    writeFileSync(file, content, { flag: created ? "wx" : "w", mode: 0o600 });
  return { created, updated };
}
