import { cached } from "./cache";
import { reserve } from "./quota";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Asset } from "./types";
type Stock = {
  url: string;
  page: string;
  author: string;
  provider: "pexels" | "pixabay";
  kind: "image" | "video";
};
export interface StockProvider {
  search(query: string, kind: "image" | "video"): Promise<Stock | null>;
}
export class PexelsStock implements StockProvider {
  async search(query: string, kind: "image" | "video"): Promise<Stock | null> {
    if (!process.env.PEXELS_API_KEY) return null;
    return cached(`pexels:${kind}:${query}`, 86400000, async () => {
      reserve("pexels", 1, Number(process.env.PEXELS_DAILY_LIMIT || 10));
      const url = new URL(
        kind === "image"
          ? "https://api.pexels.com/v1/search"
          : "https://api.pexels.com/videos/search",
      );
      url.search = new URLSearchParams({
        query,
        orientation: "portrait",
        per_page: "3",
      }).toString();
      const r = await fetch(url, {
        headers: { Authorization: process.env.PEXELS_API_KEY! },
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) throw Error(`Pexels ${r.status}`);
      const j = await r.json();
      if (kind === "image") {
        const p = j.photos?.[0];
        return p
          ? {
              url: p.src.large2x,
              page: p.url,
              author: p.photographer,
              provider: "pexels" as const,
              kind,
            }
          : null;
      }
      const p = j.videos?.[0];
      const files = p?.video_files
        ?.filter(
          (f: { file_type: string; width: number }) =>
            f.file_type === "video/mp4" && f.width <= 1920,
        )
        .sort(
          (a: { width: number }, b: { width: number }) => b.width - a.width,
        );
      return files?.[0]
        ? {
            url: files[0].link,
            page: p.url,
            author: p.user.name,
            provider: "pexels" as const,
            kind,
          }
        : null;
    });
  }
}
export class PixabayStock implements StockProvider {
  async search(query: string, kind: "image" | "video"): Promise<Stock | null> {
    if (!process.env.PIXABAY_API_KEY) return null;
    return cached(`pixabay:${kind}:${query}`, 86400000, async () => {
      reserve("pixabay", 1, Number(process.env.PIXABAY_DAILY_LIMIT || 10));
      const url = new URL(
        kind === "image"
          ? "https://pixabay.com/api/"
          : "https://pixabay.com/api/videos/",
      );
      url.search = new URLSearchParams({
        key: process.env.PIXABAY_API_KEY!,
        q: query,
        safesearch: "true",
        per_page: "3",
        ...(kind === "image"
          ? { orientation: "vertical", image_type: "photo" }
          : {}),
      }).toString();
      const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw Error(`Pixabay ${r.status}`);
      const p = (await r.json()).hits?.[0];
      return p
        ? {
            url: kind === "image" ? p.largeImageURL : p.videos.medium.url,
            page: p.pageURL,
            author: p.user,
            provider: "pixabay" as const,
            kind,
          }
        : null;
    });
  }
}
export class MockStock implements StockProvider {
  async search() {
    return null;
  }
}
export async function stockAsset(
  root: string,
  id: string,
  query: string,
  kind: "image" | "video",
): Promise<Asset | null> {
  if (process.env.ENABLE_STOCK !== "true") return null;
  let stock: Stock | null = null;
  for (const provider of [new PexelsStock(), new PixabayStock()]) {
    try {
      stock = await provider.search(query, kind);
      if (stock) break;
    } catch {
      /* templates remain available on free quota exhaustion */
    }
  }
  if (!stock) return null;
  const url = new URL(stock.url);
  if (
    url.protocol !== "https:" ||
    !["pexels.com", "pixabay.com"].some(
      (d) => url.hostname === d || url.hostname.endsWith("." + d),
    )
  )
    throw Error("Unexpected stock asset host");
  const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw Error("Stock download failed");
  const bytes = Buffer.from(await r.arrayBuffer());
  if (bytes.length > 50 * 1024 * 1024)
    throw Error("Stock download exceeds local limit");
  const relative = `${id}/stock.${kind === "image" ? "jpg" : "mp4"}`;
  await mkdir(path.join(root, id), { recursive: true });
  await writeFile(path.join(root, relative), bytes);
  return {
    path: relative,
    kind,
    license: `${stock.provider === "pexels" ? "Pexels license https://www.pexels.com/license/" : "Pixabay content license https://pixabay.com/service/license-summary/"}; author ${stock.author}; verify permitted use`,
    source: stock.page,
    mock: false,
  };
}
