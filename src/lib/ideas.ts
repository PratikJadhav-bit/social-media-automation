import { providerMode } from "./configuration";
import { sqlite, settings } from "./db";
import { trends, semanticFilter, type Trend } from "./trends";
const topics = [
  "Consumer complaint documents",
  "Rental deposit documents",
  "Cyber fraud first steps",
  "FIR and complaint differences",
  "Online shopping proof of purchase",
  "Workplace rights official guidance",
  "Digital privacy basics",
  "Rental agreement checklist",
  "Consumer helpline overview",
  "Identity theft documentation",
  "Credit report dispute records",
  "Traffic challan verification",
  "Property document checklist",
  "Domestic violence support sources",
  "Online marketplace refunds",
  "Banking complaint records",
  "Electricity billing disputes",
  "Housing society complaint records",
  "Insurance claim documentation",
  "Hospital billing queries",
  "Police complaint acknowledgments",
  "Public information requests",
  "Ecommerce return policies",
  "School fee complaint sources",
  "Employment contract checklist",
  "Defective product evidence",
  "Digital payment dispute records",
  "Emergency contact preparedness",
];
export function similarity(a: string, b: string) {
  const tokens = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, "")
        .split(/\s+/)
        .filter((x) => x.length > 2),
    );
  const x = tokens(a),
    y = tokens(b);
  return (
    [...x].filter((t) => y.has(t)).length /
    Math.max(1, new Set([...x, ...y]).size)
  );
}
export async function research(brandId: string) {
  const b = settings(brandId);
  const legal = /legal|rights|law/i.test(b.niche);
  let candidates: Trend[] = legal
    ? topics.map((title) => ({ title, source: "Curated editorial seed" }))
    : Array.from({ length: 28 }, (_, i) => ({
        title: `${b.niche}: ${["beginner checklist", "common misconception", "practical tip", "question to ask"][i % 4]} ${i + 1}`,
        source: "Editorial seed; review relevance",
      }));
  if (b.discoveryMode === "trending") {
    candidates = await trends("", b.discoveryRegion || "IN");
    if (!candidates.length) return [];
  } else if (providerMode() === "live")
    candidates.push(...(await trends(b.niche, b.discoveryRegion || "IN")));
  const old = (
    sqlite.prepare("SELECT title FROM posts WHERE brand_id=?").all(brandId) as {
      title: string;
    }[]
  ).map((p) => p.title);
  const active = (
    sqlite
      .prepare(
        "SELECT COUNT(*) n FROM posts WHERE brand_id=? AND status IN ('idea','generating','review','scheduled')",
      )
      .get(brandId) as { n: number }
  ).n;
  const words = b.niche
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);
  candidates = candidates.filter(
    (c) =>
      !old.some((t) => similarity(t, c.title) > 0.55) &&
      (b.discoveryMode === "trending" ||
        !c.url ||
        words.some((w) => c.title.toLowerCase().includes(w))),
  );
  candidates = await semanticFilter(candidates, old).catch(() => candidates);
  return candidates
    .map((c) => ({
      ...c,
      score: Math.min(
        98,
        60 +
          (c.interest
            ? Math.min(20, Math.log10(Math.max(1, c.interest)) * 3)
            : 0) +
          (c.publishedAt && Date.now() - c.publishedAt < 24 * 3600000 ? 5 : 0) +
          (b.discoveryMode === "trending"
            ? 0
            : words.filter((w) => c.title.toLowerCase().includes(w)).length *
              8) +
          (c.source.startsWith("Curated") ? 15 : 0),
      ),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, b.discoveryMode === "trending" ? 10 : Math.max(0, 28 - active));
}
