import { test, expect } from "vitest";
import { sqlite, settings } from "../src/lib/db";
import { createPost, startPost, runOnce, approve } from "../src/lib/queue";
test("mock pipeline: idea → review → schedule → publish → analytics", async () => {
  const b = "test-" + crypto.randomUUID();
  sqlite
    .prepare("INSERT INTO brands VALUES (?,?,?,?)")
    .run(b, "local", "Test", JSON.stringify(settings()));
  for (const platform of ["instagram", "youtube", "facebook"])
    sqlite
      .prepare("INSERT INTO connections VALUES (?,?,?,?,?,?)")
      .run(crypto.randomUUID(), b, platform, "demo", null, "mock");
  const id = createPost(b, "Consumer complaint documents", "reel", "English");
  startPost(b, id);
  await runOnce(10, b);
  let p = sqlite.prepare("SELECT * FROM posts WHERE id=?").get(id) as {
    status: string;
    assets: string;
  };
  expect(p.status).toBe("review");
  expect(JSON.parse(p.assets)[0].path).toContain(".jpg");
  approve(b, id);
  sqlite.prepare("UPDATE jobs SET run_at=0 WHERE post_id=?").run(id);
  await runOnce(10, b);
  p = sqlite.prepare("SELECT * FROM posts WHERE id=?").get(id) as typeof p;
  expect(p.status).toBe("published");
  sqlite.prepare("UPDATE jobs SET run_at=0 WHERE brand_id=?").run(b);
  await runOnce(10, b);
  expect(
    (
      sqlite
        .prepare(
          "SELECT COUNT(*) n FROM metrics m JOIN publications p ON m.publication_id=p.id WHERE p.post_id=?",
        )
        .get(id) as { n: number }
    ).n,
  ).toBe(3);
  await runOnce(10, b);
  expect(
    (
      sqlite
        .prepare("SELECT COUNT(*) n FROM publications WHERE post_id=?")
        .get(id) as { n: number }
    ).n,
  ).toBe(3);
}, 30000);
