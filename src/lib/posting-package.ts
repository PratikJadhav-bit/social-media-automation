import path from "node:path";
import { readFile, realpath, stat } from "node:fs/promises";
import { zipSync, strToU8 } from "fflate";
import type { Post, Script, Asset } from "./types";
export function postingText(post: Post) {
  const s = JSON.parse(post.script!) as Script;
  const checks = JSON.parse(post.checks || "{}");
  return [
    post.title,
    `Format: ${post.format} · Language: ${post.language}`,
    "Post manually after reviewing the media and source claims.",
    s.generationNote || "",
    ...(checks.failures || []).map((v: string) => `FIX: ${v}`),
    ...(checks.warnings || []).map((v: string) => `REVIEW: ${v}`),
    "\nINSTAGRAM / FACEBOOK CAPTION",
    `${s.caption}\n\n${s.hashtags.join(" ")}`,
    "\nYOUTUBE TITLE",
    s.seoTitle,
    "\nYOUTUBE DESCRIPTION",
    `${s.description}\n\n${s.hashtags.join(" ")}`,
    "\nHASHTAGS",
    s.hashtags.join(" "),
    "\nSCRIPT",
    `${s.hook}\n${s.body}\n${s.cta}`,
    "\nON-SCREEN TEXT",
    s.onScreen.join("\n"),
    "\nSOURCES TO VERIFY",
    s.sources.join("\n"),
    "\nMEDIA LICENSES",
    ...(JSON.parse(post.assets || "[]") as Asset[]).map(
      (a) =>
        `${path.basename(a.path)}: ${a.license} · ${a.source}${a.mock ? " · preview media" : ""}`,
    ),
  ]
    .filter(Boolean)
    .join("\n");
}
export async function postingZip(post: Post) {
  if (
    !post.script ||
    !post.assets ||
    !["review", "ready", "posted", "scheduled", "published"].includes(
      post.status,
    )
  )
    throw Error("Finish generating the content before downloading.");
  const root = await realpath(
    /*turbopackIgnore: true*/ process.env.MEDIA_DIR || "data/media",
  );
  const files: Record<string, Uint8Array> = {
    "posting-copy.txt": strToU8(postingText(post)),
    "content.json": strToU8(
      JSON.stringify(
        {
          title: post.title,
          format: post.format,
          language: post.language,
          script: JSON.parse(post.script),
          checks: JSON.parse(post.checks || "{}"),
          assets: JSON.parse(post.assets),
        },
        null,
        2,
      ),
    ),
  };
  let total = 0;
  for (const [i, a] of (JSON.parse(post.assets) as Asset[]).entries()) {
    const file = await realpath(path.resolve(root, a.path));
    if (!file.startsWith(root + path.sep)) throw Error("Invalid media path");
    total += (await stat(file)).size;
    if (total > 128 * 1024 * 1024)
      throw Error(
        "This package is large. Download its media files individually.",
      );
    files[`media/${String(i + 1).padStart(2, "0")}-${path.basename(file)}`] =
      await readFile(file);
  }
  return zipSync(files, { level: 0 });
}
