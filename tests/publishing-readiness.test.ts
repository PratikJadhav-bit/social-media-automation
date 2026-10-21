import { test, expect } from "vitest";
import { sqlite, settings } from "../src/lib/db";
import { createPost, approve, enqueue, runOnce } from "../src/lib/queue";
import { MockLLM } from "../src/lib/providers";
async function reviewPost() {
  const brand = crypto.randomUUID(),
    config = settings();
  sqlite
    .prepare("INSERT INTO brands VALUES (?,?,?,?)")
    .run(brand, "local", "Publishing readiness", JSON.stringify(config));
  const id = createPost(brand, "Read the source before sharing", "image");
  const script = await new MockLLM().generate(
    "Read the source before sharing",
    "image",
    "English",
    config,
  );
  sqlite
    .prepare("UPDATE posts SET status='review',script=?,assets=? WHERE id=?")
    .run(
      JSON.stringify(script),
      JSON.stringify([
        {
          path: `${id}/card.jpg`,
          kind: "image",
          license: "Original",
          source: "local",
          mock: true,
        },
      ]),
      id,
    );
  return { brand, id };
}
test("a post can finish publishing to one connected compatible account", async () => {
  const { brand, id } = await reviewPost();
  sqlite
    .prepare("INSERT INTO connections VALUES (?,?,?,?,?,?)")
    .run(crypto.randomUUID(), brand, "instagram", "mock", null, "mock");
  approve(brand, id);
  const jobs = sqlite
    .prepare("SELECT payload FROM jobs WHERE post_id=? AND stage='publish'")
    .all(id) as { payload: string }[];
  expect(jobs).toHaveLength(1);
  expect(JSON.parse(jobs[0].payload).platform).toBe("instagram");
  sqlite.prepare("UPDATE jobs SET run_at=0 WHERE post_id=?").run(id);
  await runOnce(2, brand);
  expect(
    (
      sqlite.prepare("SELECT status FROM posts WHERE id=?").get(id) as {
        status: string;
      }
    ).status,
  ).toBe("published");
});
test("missing connections preserve the review draft and do not queue doomed publications", async () => {
  const { brand, id } = await reviewPost();
  expect(() => approve(brand, id)).toThrow("Connect a compatible");
  expect(
    (
      sqlite.prepare("SELECT status FROM posts WHERE id=?").get(id) as {
        status: string;
      }
    ).status,
  ).toBe("review");
  expect(
    sqlite.prepare("SELECT id FROM jobs WHERE post_id=?").all(id),
  ).toHaveLength(0);
});
test("legacy jobs pause for setup without consuming retries or creating uncertain publications", async () => {
  const { brand, id } = await reviewPost();
  sqlite.prepare("UPDATE posts SET status='scheduled' WHERE id=?").run(id);
  enqueue(brand, id, "publish", `${id}:legacy`, 0, { platform: "instagram" });
  await runOnce(1, brand);
  const job = sqlite
    .prepare("SELECT status,attempts FROM jobs WHERE post_id=?")
    .get(id) as { status: string; attempts: number };
  expect(job.status).toBe("blocked");
  expect(job.attempts).toBe(0);
  expect(
    sqlite.prepare("SELECT id FROM publications WHERE post_id=?").all(id),
  ).toHaveLength(0);
});
