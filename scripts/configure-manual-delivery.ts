import { sqlite, settings } from "../src/lib/db";
import { enqueue } from "../src/lib/queue";
for (const row of sqlite.prepare("SELECT id FROM brands").all() as {
  id: string;
}[]) {
  sqlite
    .prepare("UPDATE brands SET settings=? WHERE id=?")
    .run(
      JSON.stringify({
        ...settings(row.id),
        autoGenerate: true,
        autoApprove: false,
      }),
      row.id,
    );
}
sqlite
  .prepare(
    "INSERT OR REPLACE INTO cache VALUES ('configuration:publish-mode','\"mock\"',?)",
  )
  .run(Number.MAX_SAFE_INTEGER);
sqlite
  .prepare(
    "UPDATE jobs SET status='blocked',locked_at=NULL,error='Automatic posting is disabled; post this package manually.' WHERE stage='publish' AND status IN ('pending','running')",
  )
  .run();
for (const post of sqlite
  .prepare(
    "SELECT id,brand_id,checks FROM posts WHERE status='review' AND assets IS NOT NULL AND script IS NOT NULL",
  )
  .all() as { id: string; brand_id: string; checks: string }[]) {
  const q = JSON.parse(post.checks || "{}");
  if (!q.passed) continue;
  const revision = q.deliveryRevision || `manual-migration:${post.id}`;
  sqlite
    .prepare(
      "UPDATE posts SET status='ready',scheduled_at=NULL,checks=? WHERE id=?",
    )
    .run(JSON.stringify({ ...q, deliveryRevision: revision }), post.id);
  enqueue(
    post.brand_id,
    post.id,
    "notify",
    `${post.id}:notify:${revision}`,
    Date.now(),
    { revision },
  );
}
console.log(
  "Manual posting configured. Automatic generation enabled within each channel daily cap; existing complete drafts are available as ready packages.",
);
