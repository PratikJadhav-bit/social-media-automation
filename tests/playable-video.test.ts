import { test, expect } from "vitest";
import { assets, mediaFile } from "../src/lib/media";
import { MockLLM } from "../src/lib/providers";
import { defaults } from "../src/lib/types";
test("default Reel generation produces an actual playable MP4", async () => {
  const script = await new MockLLM().generate(
    "Verify a source before sharing",
    "reel",
    "English",
    defaults,
  );
  script.duration = 15;
  const generated = await assets(crypto.randomUUID(), script, defaults, "reel");
  const video = generated.find((asset) => asset.kind === "video")!;
  expect(video.path.endsWith(".mp4")).toBe(true);
  const bytes = await mediaFile(video.path);
  expect(bytes.subarray(4, 8).toString()).toBe("ftyp");
  expect(bytes.length).toBeGreaterThan(10000);
  expect(video.mock).toBe(true);
}, 90000);
