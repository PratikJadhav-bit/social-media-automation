import { test, expect } from "vitest";
import { sqlite, settings } from "../src/lib/db";
import { reserve } from "../src/lib/quota";
import { enqueue, runOnce, createPost } from "../src/lib/queue";
import { research } from "../src/lib/ideas";
import { saveMetric, bestTimes } from "../src/lib/analytics";
import { reserveStorage } from "../src/lib/storage";
test("storage guard accounts for overwrites and stops at a conservative cap", () => {
  const backend = crypto.randomUUID();
  reserveStorage(backend, "asset", 100, 200);
  reserveStorage(backend, "asset", 150, 200);
  expect(() => reserveStorage(backend, "other", 51, 200)).toThrow(
    "Storage quota",
  );
  reserveStorage(backend, "other", 50, 200);
});
test("quota reservation is atomic and cannot exceed daily cap", () => {
  const key = crypto.randomUUID();
  reserve(key, 1, 2);
  reserve(key, 1, 2);
  expect(() => reserve(key, 1, 2)).toThrow("Quota guard");
  expect(
    (
      sqlite.prepare("SELECT units FROM usage WHERE provider=?").get(key) as {
        units: number;
      }
    ).units,
  ).toBe(2);
});
test("idempotency key enqueues one job and poison jobs reach dead letter", async () => {
  const b = "ops-" + crypto.randomUUID();
  sqlite
    .prepare("INSERT INTO brands VALUES (?,?,?,?)")
    .run(b, "local", "Operations", JSON.stringify(settings()));
  const post = createPost(b, "Test poison job");
  enqueue(b, post, "unknown", `${post}:bad`);
  enqueue(b, post, "unknown", `${post}:bad`);
  expect(
    (
      sqlite.prepare("SELECT COUNT(*) n FROM jobs WHERE brand_id=?").get(b) as {
        n: number;
      }
    ).n,
  ).toBe(1);
  for (let i = 0; i < 3; i++) {
    sqlite.prepare("UPDATE jobs SET run_at=0 WHERE brand_id=?").run(b);
    await runOnce(1, b);
  }
  expect(
    (
      sqlite.prepare("SELECT status FROM jobs WHERE brand_id=?").get(b) as {
        status: string;
      }
    ).status,
  ).toBe("dead");
});
test("research keeps a 14 day backlog without title duplicates", async () => {
  const b = "ideas-" + crypto.randomUUID();
  sqlite
    .prepare("INSERT INTO brands VALUES (?,?,?,?)")
    .run(
      b,
      "local",
      "Ideas",
      JSON.stringify({ ...settings(), discoveryMode: "niche" }),
    );
  const ideas = await research(b);
  expect(ideas).toHaveLength(28);
  for (const i of ideas) createPost(b, i.title);
  expect(await research(b)).toHaveLength(0);
});
test("best time optimizer excludes fabricated analytics", () => {
  expect(bestTimes("default").ready).toBe(false);
});
test("pausing preserves pending jobs and retry attempts until resume", async () => {
  const brand = "pause-" + crypto.randomUUID();
  const config = { ...settings(), paused: true };
  sqlite
    .prepare("INSERT INTO brands VALUES (?,?,?,?)")
    .run(brand, "local", "Paused test", JSON.stringify(config));
  const post = createPost(brand, "Paused QA content", "image");
  enqueue(brand, post, "script", `${post}:script`, 0);
  expect(await runOnce(5, brand)).toBe(0);
  const queued = sqlite
    .prepare("SELECT status,attempts FROM jobs WHERE post_id=?")
    .get(post) as { status: string; attempts: number };
  expect(queued).toEqual({ status: "pending", attempts: 0 });
  sqlite
    .prepare("UPDATE brands SET settings=? WHERE id=?")
    .run(JSON.stringify({ ...config, paused: false }), brand);
  await runOnce(5, brand);
  expect(
    (
      sqlite.prepare("SELECT status FROM posts WHERE id=?").get(post) as {
        status: string;
      }
    ).status,
  ).toBe("review");
});
