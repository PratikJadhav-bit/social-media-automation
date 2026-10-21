import { sqlite } from "../src/lib/db";
import { mkdir } from "node:fs/promises";
import path from "node:path";
const directory = process.env.BACKUP_DIR || "data/backups";
await mkdir(directory, { recursive: true });
const target = path.join(
  directory,
  `autopilot-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`,
);
await sqlite.backup(target);
console.log(`Database backup saved: ${target}. Back up media separately.`);
