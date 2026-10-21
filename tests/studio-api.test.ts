import { test, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));
import { GET, POST } from "@/app/api/studio/route";
import { GET as plan } from "@/app/api/plan/route";
import { sqlite, settings } from "@/lib/db";
import { createPost } from "@/lib/queue";
import { nextSlot } from "@/lib/scheduler";
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("ADMIN_EMAIL", "");
});
afterEach(() => vi.unstubAllEnvs());
const request = (body: unknown) =>
  new NextRequest("http://localhost:3000/api/studio", {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
test("studio accepts the actual browser analysis payload with no saved draft", async () => {
  const response = await POST(
    request({
      brandId: "default",
      action: "analyse",
      tool: "hook",
      platform: "instagram",
      input:
        "Stop wasting 20 hours on reports.\nHello everyone, welcome to my video.",
      title: "",
      thumbnail: "",
      duration: 30,
      format: "reel",
      language: "English",
      script: null,
    }),
  );
  expect(response.status).toBe(200);
  const result = (await response.json()).result;
  expect(result).toHaveLength(2);
  expect(result[0].score).toBeGreaterThan(result[1].score);
});
test("draft and hook library APIs preserve the difference between templates and connected AI", async () => {
  const library = await GET(
    new NextRequest("http://localhost:3000/api/studio?platform=linkedin"),
  );
  expect((await library.json()).library.hooks).toHaveLength(21);
  const response = await POST(
    request({
      action: "draft",
      title: "How to verify a news source",
      script: null,
    }),
  );
  expect(response.status).toBe(200);
  const draft = await response.json();
  expect(draft.script.generationMode).toBe("mock");
  expect(draft.mode).toBe("mock");
});
test("planning previews respect occupied posting slots without scheduling unapproved ideas", async () => {
  const brand = crypto.randomUUID();
  sqlite
    .prepare("INSERT INTO brands VALUES (?,?,?,?)")
    .run(brand, "local", "Weekly plan", JSON.stringify(settings()));
  const first = createPost(brand, "First source-backed explainer"),
    second = createPost(brand, "Second source-backed explainer");
  const reserved = createPost(brand, "Already scheduled"),
    occupied = nextSlot(settings(), Date.now() + 60000, [], 0);
  sqlite
    .prepare("UPDATE posts SET status='scheduled',scheduled_at=? WHERE id=?")
    .run(occupied, reserved);
  const response = await plan(
    new NextRequest(`http://localhost:3000/api/plan?brand=${brand}`),
  );
  expect(response.status).toBe(200);
  const output = await response.json();
  expect(output.slots).toHaveLength(2);
  expect(
    output.slots.every((slot: { at: number }) => slot.at !== occupied),
  ).toBe(true);
  expect(new Set(output.slots.map((s: { at: number }) => s.at)).size).toBe(2);
  expect(
    sqlite
      .prepare("SELECT id FROM jobs WHERE post_id IN (?,?)")
      .all(first, second),
  ).toHaveLength(0);
});
