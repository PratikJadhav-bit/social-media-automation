import { test, expect } from "vitest";
import { nextSlot } from "../src/lib/scheduler";
import { quality } from "../src/lib/quality";
import { MockLLM } from "../src/lib/providers";
import { defaults } from "../src/lib/types";
test("IST morning, evening, rollover and jitter", () => {
  const at = nextSlot(defaults, Date.parse("2026-10-10T02:00:00Z"));
  expect(new Date(at).toISOString()).toBe("2026-10-10T03:30:00.000Z");
  expect(new Date(nextSlot(defaults, at + 1)).toISOString()).toBe(
    "2026-10-10T12:30:00.000Z",
  );
  expect(
    new Date(nextSlot(defaults, Date.parse("2026-10-10T13:00Z"))).toISOString(),
  ).toBe("2026-10-11T03:30:00.000Z");
  expect(nextSlot(defaults, at, [], 60)).toBe(at + 60000);
});
test("DST uses timezone rules", () => {
  const b = { ...defaults, timezone: "America/New_York" };
  expect(
    new Date(nextSlot(b, Date.parse("2026-03-08T00:00Z"))).toISOString(),
  ).toBe("2026-03-08T13:00:00.000Z");
});
test("quality blocks unsafe wording and unlicensed media, requires legal review", async () => {
  const s = await new MockLLM().generate(
    "Tenant rights",
    "reel",
    "English",
    defaults,
  );
  expect(quality(s, [], "English", defaults).requiresHuman).toBe(true);
  expect(quality(s, [], "English", defaults).passed).toBe(false);
  s.body += " guaranteed win";
  s.caption = "";
  const q = quality(
    s,
    [{ path: "x", kind: "image", license: "", source: "", mock: false }],
    "English",
    defaults,
  );
  expect(q.passed).toBe(false);
  expect(q.failures).toHaveLength(3);
});
