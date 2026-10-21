import type { Asset, BrandSettings, Script } from "./types";
export function quality(
  s: Script,
  media: Asset[],
  language: string,
  b: BrandSettings,
) {
  const text = `${s.hook} ${s.body} ${s.caption}`.toLowerCase();
  const failures: string[] = [];
  const warnings: string[] = [];
  if (media.length === 0) failures.push("Missing generated media");
  if (
    `${s.caption}\n${s.hashtags.join(" ")}\nAI-assisted content.`.length > 2200
  )
    failures.push("Shorten the caption and hashtags to fit 2,200 characters");
  if (s.hashtags.length > 5)
    failures.push("Choose up to five focused hashtags");
  if (s.seoTitle.length > 100)
    failures.push("YouTube title must fit 100 characters");
  if (s.description.length > 5000)
    failures.push("YouTube description must fit 5,000 characters");
  if (s.duration < 15 || s.duration > 45)
    failures.push("Duration must be 15–45 seconds");
  if (b.bannedWords.some((w) => text.includes(w.toLowerCase())))
    failures.push("Banned wording");
  if (/\b(fuck|shit|bastard)\b/i.test(text)) failures.push("Profanity");
  if (!s.caption.includes(b.disclaimer)) failures.push("Missing disclaimer");
  if (media.some((a) => !a.license)) failures.push("Missing license metadata");
  if (media.some((a) => /pexels|pixabay/i.test(a.source + " " + a.license)))
    warnings.push(
      "Stock license, attribution and depicted-person rights need verification",
    );
  if (
    ["Hindi", "Marathi"].includes(language) &&
    !/[\u0900-\u097f]/.test(s.body)
  )
    failures.push(`${language} script expected`);
  if (language === "English" && /[\u0900-\u097f]/.test(s.body))
    warnings.push("Verify caption language");
  const factualRisk =
    s.factualRisk ||
    /legal|rights|law|medical|finance/i.test(b.niche) ||
    /\b(section|guaranteed|court|FIR)\b/i.test(text);
  if (factualRisk)
    warnings.push(
      "Factual risk: human verification of current official sources required",
    );
  if (media.some((a) => a.mock))
    warnings.push("Mock media: cannot publish to live platforms");
  return {
    passed: failures.length === 0,
    failures,
    warnings,
    requiresHuman: factualRisk || warnings.length > 0,
  };
}
