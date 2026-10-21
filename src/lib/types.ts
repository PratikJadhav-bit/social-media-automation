export type Platform = "instagram" | "youtube" | "facebook";
export type Format = "reel" | "carousel" | "image";
export type BrandSettings = {
  discoveryRegion?: string;
  discoveryMode?: "trending" | "niche";
  autoGenerate?: boolean;
  niche: string;
  voiceExamples?: string;
  tone: string;
  languages: string[];
  timezone: string;
  times: string[];
  autoApprove: boolean;
  disclaimer: string;
  color: string;
  voice: string;
  dailyLimit: number;
  bannedWords: string[];
  paused: boolean;
  font?: string;
  logoPath?: string;
  brandName?: string;
  hindiVoice?: string;
  marathiVoice?: string;
};
export type Script = {
  hookOptions?: string[];
  generationMode?: "mock" | "live";
  generationNote?: string;
  hook: string;
  body: string;
  cta: string;
  caption: string;
  hashtags: string[];
  seoTitle: string;
  description: string;
  onScreen: string[];
  duration: number;
  factualRisk: boolean;
  sources: string[];
};
export type Asset = {
  path: string;
  kind: "image" | "video" | "audio";
  license: string;
  source: string;
  mock: boolean;
};
export type Post = {
  id: string;
  brand_id: string;
  title: string;
  format: Format;
  language: string;
  status: string;
  script: string | null;
  assets: string | null;
  checks: string | null;
  scheduled_at: number | null;
  editorial?: import("./editorial").EditorialReport;
  notification?: { status: string; detail: string; updatedAt: number } | null;
  created_at: number;
};
export const platforms: Platform[] = ["instagram", "youtube", "facebook"];
export function platformsForFormat(format: Format): Platform[] {
  return format === "reel" ? platforms : ["instagram", "facebook"];
}
export const defaults: BrandSettings = {
  discoveryMode: "trending",
  autoGenerate: true,
  niche: "Trending topics and useful everyday explainers",
  tone: "Clear, empathetic, practical",
  languages: ["English", "Hindi"],
  timezone: "Asia/Kolkata",
  times: ["09:00", "18:00"],
  autoApprove: false,
  disclaimer: "Educational content; verify current sources",
  color: "#6957e8",
  voice: "en-IN-NeerjaNeural",
  dailyLimit: 2,
  bannedWords: ["guaranteed win", "bribe"],
  paused: false,
};
