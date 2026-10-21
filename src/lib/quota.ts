import { localParts } from "./scheduler";
import { sqlite, settings } from "./db";
export function quotaUsage(brandId: string) {
  const parts = localParts(new Date(), settings(brandId).timezone),
    localDay = `${parts.year}-${parts.month}-${parts.day}`,
    utcDay = new Date().toISOString().slice(0, 10);
  const limits: Record<string, number> = {
    gemini: Number(process.env.GEMINI_DAILY_LIMIT || 20),
    groq: Number(process.env.GROQ_DAILY_LIMIT || 20),
    ollama: 100,
    pexels: Number(process.env.PEXELS_DAILY_LIMIT || 10),
    pixabay: Number(process.env.PIXABAY_DAILY_LIMIT || 10),
    "youtube-upload": Number(process.env.YOUTUBE_DAILY_UPLOAD_LIMIT || 2),
    "youtube-trends": Number(process.env.YOUTUBE_DAILY_TREND_LIMIT || 2),
    "r2-write": Number(process.env.R2_DAILY_WRITE_LIMIT || 100),
  };
  return (
    sqlite
      .prepare("SELECT provider,units,day FROM usage WHERE day IN (?,?)")
      .all(utcDay, localDay) as {
      day: string;
      provider: string;
      units: number;
    }[]
  )
    .filter((r) =>
      r.provider.startsWith("generation:")
        ? r.provider === `generation:${brandId}` && r.day === localDay
        : r.day === utcDay &&
          (!r.provider.startsWith("studio:") ||
            r.provider === `studio:${brandId}`),
    )
    .map((r) => {
      const limit = r.provider.startsWith("generation:")
        ? settings(brandId).dailyLimit
        : r.provider.startsWith("studio:")
          ? 10
          : limits[r.provider] || 100;
      return {
        ...r,
        provider: r.provider.startsWith("generation:")
          ? "Content generation"
          : r.provider.startsWith("studio:")
            ? "Studio drafts"
            : r.provider,
        limit,
        percent: Math.min(
          100,
          Math.round((r.units / Math.max(1, limit)) * 100),
        ),
      };
    });
}
export function reserve(
  provider: string,
  units: number,
  limit: number,
  day = new Date().toISOString().slice(0, 10),
) {
  if (
    !Number.isFinite(limit) ||
    limit < 0 ||
    !Number.isInteger(units) ||
    units <= 0
  )
    throw Error("Invalid quota configuration");
  return sqlite.transaction(() => {
    const row = sqlite
      .prepare("SELECT units FROM usage WHERE provider=? AND day=?")
      .get(provider, day) as { units: number } | undefined;
    if ((row?.units || 0) + units > limit)
      throw Error(`Quota guard: ${provider} paused at configured daily limit`);
    sqlite
      .prepare(
        "INSERT INTO usage VALUES (?,?,?,?) ON CONFLICT(provider,day) DO UPDATE SET units=units+excluded.units",
      )
      .run(crypto.randomUUID(), provider, day, units);
  })();
}
export async function retry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= attempts - 1) throw e;
      await new Promise((r) =>
        setTimeout(r, Math.min(30000, 1000 * 2 ** i) + Math.random() * 300),
      );
    }
  }
}
