import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema";
import { defaults } from "./types";
const file = process.env.DATABASE_PATH || "data/autopilot.sqlite";
if (process.env.DATABASE_URL)
  throw Error(
    "This build uses SQLite. DATABASE_URL/Postgres requires a repository adapter; clear DATABASE_URL for local mode.",
  );
mkdirSync(dirname(file), { recursive: true });
export const sqlite = new Database(file);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("busy_timeout = 5000");
export const db = drizzle(sqlite, { schema });
sqlite.exec(`
CREATE TABLE IF NOT EXISTS tenants(id TEXT PRIMARY KEY,name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS brands(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),name TEXT NOT NULL,settings TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS posts(id TEXT PRIMARY KEY,brand_id TEXT NOT NULL REFERENCES brands(id),title TEXT NOT NULL,format TEXT NOT NULL,language TEXT NOT NULL,status TEXT NOT NULL,script TEXT,assets TEXT,checks TEXT,scheduled_at INTEGER,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,brand_id TEXT NOT NULL REFERENCES brands(id),post_id TEXT REFERENCES posts(id),stage TEXT NOT NULL,idempotency_key TEXT NOT NULL UNIQUE,status TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,run_at INTEGER NOT NULL,locked_at INTEGER,error TEXT,payload TEXT NOT NULL DEFAULT '{}');
CREATE INDEX IF NOT EXISTS jobs_due ON jobs(status,run_at);
CREATE TABLE IF NOT EXISTS connections(id TEXT PRIMARY KEY,brand_id TEXT NOT NULL REFERENCES brands(id),platform TEXT NOT NULL,account_id TEXT NOT NULL,token TEXT,mode TEXT NOT NULL,UNIQUE(brand_id,platform));
CREATE TABLE IF NOT EXISTS publications(id TEXT PRIMARY KEY,post_id TEXT NOT NULL REFERENCES posts(id),platform TEXT NOT NULL,external_id TEXT,status TEXT NOT NULL,mode TEXT NOT NULL,published_at INTEGER,UNIQUE(post_id,platform));
CREATE TABLE IF NOT EXISTS metrics(id TEXT PRIMARY KEY,publication_id TEXT NOT NULL REFERENCES publications(id),day TEXT NOT NULL,views INTEGER NOT NULL,likes INTEGER NOT NULL,comments INTEGER NOT NULL,shares INTEGER NOT NULL,watch_seconds INTEGER NOT NULL,UNIQUE(publication_id,day));
CREATE TABLE IF NOT EXISTS usage(id TEXT PRIMARY KEY,provider TEXT NOT NULL,day TEXT NOT NULL,units INTEGER NOT NULL,UNIQUE(provider,day));
CREATE TABLE IF NOT EXISTS comments(id TEXT PRIMARY KEY,brand_id TEXT NOT NULL REFERENCES brands(id),platform TEXT NOT NULL,body TEXT NOT NULL,draft TEXT NOT NULL,status TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS logs(id TEXT PRIMARY KEY,brand_id TEXT NOT NULL,level TEXT NOT NULL,event TEXT NOT NULL,detail TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS cache(key TEXT PRIMARY KEY,value TEXT NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS storage_objects(backend TEXT NOT NULL,key TEXT NOT NULL,bytes INTEGER NOT NULL,PRIMARY KEY(backend,key));
`);
sqlite
  .prepare("INSERT OR IGNORE INTO tenants VALUES (?,?)")
  .run("local", "My workspace");
sqlite
  .prepare("INSERT OR IGNORE INTO brands VALUES (?,?,?,?)")
  .run("default", "local", "My Creator Channel", JSON.stringify(defaults));
export function log(
  brandId: string,
  event: string,
  detail: unknown,
  level = "info",
) {
  sqlite
    .prepare("INSERT INTO logs VALUES (?,?,?,?,?,?)")
    .run(
      crypto.randomUUID(),
      brandId,
      level,
      event,
      JSON.stringify(detail),
      Date.now(),
    );
  console.log(JSON.stringify({ level, event, brandId, detail }));
}
export function settings(brandId = "default") {
  const b = sqlite.prepare("SELECT * FROM brands WHERE id=?").get(brandId) as
    { settings: string; name: string } | undefined;
  if (!b) throw Error("Brand not found");
  return {
    ...defaults,
    ...JSON.parse(b.settings),
    brandName: b.name,
  } as typeof defaults;
}
