import { sqlite } from "../src/lib/db";
import { runOnce, recurring } from "../src/lib/queue";
let stopped = false;
process.on("SIGTERM", () => {
  stopped = true;
});
process.on("SIGINT", () => {
  stopped = true;
});
async function main() {
  do {
    sqlite
      .prepare(
        "INSERT INTO cache VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,expires_at=excluded.expires_at",
      )
      .run(
        "worker-heartbeat",
        JSON.stringify({ updatedAt: Date.now() }),
        Date.now() + 5 * 60000,
      );
    recurring();
    await runOnce(25);
    if (process.argv.includes("--once")) break;
    await new Promise((r) => setTimeout(r, 5000));
  } while (!stopped);
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
