import { XMLParser } from "fast-xml-parser";
import { cached } from "./cache";
import { sqlite } from "./db";
import { reserve } from "./quota";
import { spawn } from "node:child_process";
export type Trend = {
  title: string;
  source: string;
  url?: string;
  publishedAt?: number;
  interest?: number;
  context?: string;
};
export type FeedHealth = {
  checkedAt: number;
  sources: {
    name: string;
    count: number;
    status: "available" | "unavailable";
  }[];
};
export function feedHealth(region = "IN"): FeedHealth | null {
  const row = sqlite
    .prepare("SELECT value FROM cache WHERE key=?")
    .get(`research-health:${region}`) as { value: string } | undefined;
  return row ? JSON.parse(row.value) : null;
}
export async function trends(niche: string, region = "IN"): Promise<Trend[]> {
  region = /^[A-Z]{2}$/.test(region) ? region : "IN";
  const feeds = (
    process.env.RSS_FEEDS ||
    `https://trends.google.com/trending/rss?geo=${region},https://news.google.com/rss?hl=en&gl=${region}&ceid=${region}:en`
  )
    .split(",")
    .filter(Boolean);
  return cached(
    `trends:v3:${region}:${niche}:${feeds.join(",")}`,
    5 * 60000,
    async () => {
      const parser = new XMLParser(),
        health: FeedHealth = { checkedAt: Date.now(), sources: [] };
      const batches = await Promise.all(
        feeds.map(async (feed) => {
          let name = "Public feed";
          try {
            const url = new URL(feed);
            name = url.hostname;
            if (url.protocol !== "https:") throw Error("HTTPS required");
            const response = await fetch(url, {
              signal: AbortSignal.timeout(12000),
            });
            if (!response.ok) throw Error("Source unavailable");
            const xml = await response.text();
            if (xml.length > 2_000_000) throw Error("Feed too large");
            const document = parser.parse(xml),
              raw = document.rss?.channel?.item || document.feed?.entry || [];
            const candidates: Trend[] = [];
            for (const item of (Array.isArray(raw) ? raw : [raw]).slice(
              0,
              100,
            )) {
              if (typeof item.title !== "string") continue;
              const article = Array.isArray(item["ht:news_item"])
                ? item["ht:news_item"][0]
                : item["ht:news_item"];
              const link = article?.["ht:news_item_url"] || item.link;
              const publishedAt = Date.parse(
                item.pubDate || item.published || "",
              );
              const traffic = String(item["ht:approx_traffic"] || "").replace(
                /[, +]/g,
                "",
              );
              const magnitude = /m/i.test(traffic)
                ? 1_000_000
                : /k/i.test(traffic)
                  ? 1000
                  : 1;
              const interest = parseFloat(traffic) * magnitude;
              let safeLink: string | undefined;
              if (typeof link === "string")
                try {
                  const parsed = new URL(link);
                  if (["http:", "https:"].includes(parsed.protocol))
                    safeLink = parsed.href;
                } catch {}
              candidates.push({
                title: item.title.slice(0, 200),
                source:
                  name === "trends.google.com"
                    ? `Google Trends ${region}`
                    : `News signal · ${name}`,
                url: safeLink,
                publishedAt: Number.isFinite(publishedAt)
                  ? publishedAt
                  : undefined,
                interest: Number.isFinite(interest) ? interest : undefined,
                context:
                  typeof article?.["ht:news_item_title"] === "string"
                    ? article["ht:news_item_title"]
                        .replace(/<[^>]*>/g, "")
                        .slice(0, 500)
                    : undefined,
              });
            }
            health.sources.push({
              name,
              count: candidates.length,
              status: candidates.length ? "available" : "unavailable",
            });
            return candidates;
          } catch {
            health.sources.push({ name, count: 0, status: "unavailable" });
            return [];
          }
        }),
      );
      const result = batches.flat();
      if (process.env.YOUTUBE_API_KEY)
        try {
          reserve(
            "youtube-trends",
            1,
            Number(process.env.YOUTUBE_DAILY_TREND_LIMIT || 2),
          );
          const response = await fetch(
            `https://www.googleapis.com/youtube/v3/videos?part=snippet&chart=mostPopular&regionCode=${region}&maxResults=20&key=${process.env.YOUTUBE_API_KEY}`,
            { signal: AbortSignal.timeout(12000) },
          );
          if (response.ok) {
            const data = await response.json();
            result.push(
              ...(data.items || []).map(
                (item: {
                  id: string;
                  snippet: { title: string; publishedAt: string };
                }) => ({
                  title: item.snippet.title.slice(0, 200),
                  source: `YouTube popular ${region}`,
                  url: `https://www.youtube.com/watch?v=${item.id}`,
                  publishedAt: Date.parse(item.snippet.publishedAt),
                }),
              ),
            );
            health.sources.push({
              name: "YouTube",
              count: data.items?.length || 0,
              status: "available",
            });
          }
        } catch {
          health.sources.push({
            name: "YouTube",
            count: 0,
            status: "unavailable",
          });
        }
      sqlite
        .prepare(
          "INSERT INTO cache VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,expires_at=excluded.expires_at",
        )
        .run(
          `research-health:${region}`,
          JSON.stringify(health),
          Date.now() + 86400000,
        );
      return [
        ...new Map(
          result.map((item) => [item.title.trim().toLowerCase(), item]),
        ).values(),
      ];
    },
  );
}
export function embed(texts: string[]): Promise<number[][]> {
  return new Promise((resolve, reject) => {
    const child = spawn("python", ["scripts/research.py", "embeddings"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "",
      error = "";
    child.stdout.on("data", (c) => {
      out += c;
    });
    child.stderr.on("data", (c) => {
      error += c;
    });
    child.on("error", reject);
    const timeout = setTimeout(() => child.kill(), 180000);
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0)
        reject(Error(`Embedding adapter failed: ${error.slice(-300)}`));
      else
        try {
          resolve(JSON.parse(out));
        } catch (e) {
          reject(e);
        }
    });
    child.stdin.end(JSON.stringify(texts));
  });
}
export async function semanticFilter(candidates: Trend[], past: string[]) {
  if (
    process.env.ENABLE_EMBEDDINGS !== "true" ||
    !past.length ||
    !candidates.length
  )
    return candidates;
  const texts = [...past, ...candidates.map((c) => c.title)];
  const vectors = await cached(
    `embeddings:${JSON.stringify(texts)}`,
    30 * 86400000,
    () => embed(texts),
  );
  const dot = (a: number[], b: number[]) =>
    a.reduce((n, v, i) => n + v * b[i], 0);
  const kept: Trend[] = [];
  const known = vectors.slice(0, past.length);
  for (let i = 0; i < candidates.length; i++) {
    const v = vectors[past.length + i];
    if (!known.some((k) => dot(k, v) > 0.82)) {
      kept.push(candidates[i]);
      known.push(v);
    }
  }
  return kept;
}
