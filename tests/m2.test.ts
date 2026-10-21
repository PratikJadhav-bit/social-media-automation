import { test, expect } from "vitest";
import { MockLLM, scriptSchema } from "../src/lib/providers";
import { defaults } from "../src/lib/types";
import { similarity } from "../src/lib/ideas";
test("mock scripts use validated contract and Hindi", async () => {
  const s = await new MockLLM().generate(
    "Consumer complaints",
    "reel",
    "Hindi",
    defaults,
  );
  expect(scriptSchema.parse(s).duration).toBe(30);
  expect(s.body).toMatch(/[\u0900-\u097f]/);
});
test("duplicate titles are detected", () => {
  expect(similarity("Know your tenant rights", "Know your tenant rights")).toBe(
    1,
  );
  expect(similarity("Tenant rights", "Online shopping")).toBe(0);
});
