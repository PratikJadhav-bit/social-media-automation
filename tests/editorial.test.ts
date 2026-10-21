import { test, expect } from "vitest";
import { hookLibrary, runEditorial, reviewScript } from "../src/lib/editorial";
import { MockLLM } from "../src/lib/providers";
import { defaults } from "../src/lib/types";
test("vendored hook libraries and executable tools produce actual reports", async () => {
  const [instagram, youtube, linkedin] = await Promise.all([
    hookLibrary("instagram"),
    hookLibrary("youtube"),
    hookLibrary("linkedin"),
  ]);
  expect([
    instagram.hooks.length,
    youtube.hooks.length,
    linkedin.hooks.length,
  ]).toEqual([26, 21, 21]);
  const cleaned = (await runEditorial(
    "humanize",
    "We leverage robust tools. https://example.com/leverage",
  )) as { text: string };
  expect(cleaned.text).not.toContain("leverage robust");
  expect(cleaned.text).toContain("https://example.com/leverage");
  const hook = (await runEditorial(
    "hook",
    "Stop wasting 20 hours on reports.",
  )) as { score: number };
  expect(hook.score).toBeGreaterThan(0);
  const beats = (await runEditorial(
    "beats",
    "Stop wasting 20 hours on reports.\nCheck the original source before making a claim.\nSave the checklist.",
  )) as { total_seconds: number; beats: unknown[] };
  expect(beats.beats.length).toBeGreaterThan(0);
  expect(beats.total_seconds).toBeGreaterThan(0);
  const caption = (await runEditorial(
    "caption",
    "Check the source before sharing. #Research",
  )) as { visible: string; checks: unknown[] };
  expect(caption.visible).toContain("Check the source");
  expect(caption.checks.length).toBeGreaterThan(0);
  const title = (await runEditorial("title", "How to check a source", {
    thumbnail: "CHECK FIRST",
  })) as { score: number }[];
  expect(title[0].score).toBeGreaterThanOrEqual(0);
}, 30000);
test("non-English scripts retain their joiners and get no misleading English score", async () => {
  const draft = "क्\u200dषेत्र में तथ्य जाँचें।";
  expect(
    ((await runEditorial("humanize", draft)) as { text: string }).text,
  ).toBe(draft);
  const script = await new MockLLM().generate(
    "Source checks",
    "reel",
    "Hindi",
    defaults,
  );
  expect((await reviewScript(script, "Hindi")).status).toBe("limited");
});
test("retention and outlier analysis use supplied measurements", async () => {
  const data = JSON.stringify(
    [100, 120, 140, 800].map((views, index) => ({
      channel: "QA",
      title: `Report ${index}`,
      views,
    })),
  );
  const result = (await runEditorial("youtube-outliers", data)) as {
    outliers: { multiple: number }[];
  };
  expect(result.outliers[0].multiple).toBeGreaterThan(5);
  const retention = (await runEditorial(
    "retention",
    "position,retention\n0,100\n10,90\n20,70\n30,60\n40,55\n50,52\n75,50\n100,45",
    { duration: 300 },
  )) as { points: number; hook_leak: number };
  expect(retention.points).toBe(8);
  expect(retention.hook_leak).toBe(10);
}, 30000);
