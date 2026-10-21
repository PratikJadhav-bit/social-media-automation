import { sqlite } from "./db";
export async function cached<T>(
  key: string,
  ttl: number,
  load: () => Promise<T>,
): Promise<T> {
  const row = sqlite
    .prepare("SELECT value FROM cache WHERE key=? AND expires_at>?")
    .get(key, Date.now()) as { value: string } | undefined;
  if (row) return JSON.parse(row.value);
  const value = await load();
  sqlite
    .prepare(
      "INSERT INTO cache VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,expires_at=excluded.expires_at",
    )
    .run(key, JSON.stringify(value), Date.now() + ttl);
  return value;
}
