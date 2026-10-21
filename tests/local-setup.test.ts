import { test, expect, afterEach, vi } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  rmdirSync,
} from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { ensureLocalConfiguration } from "../scripts/local-configuration";
const directories: string[] = [];
function fixture() {
  mkdirSync("data", { recursive: true });
  const directory = mkdtempSync(path.resolve("data/setup-test-"));
  directories.push(directory);
  writeFileSync(
    path.join(directory, ".env.example"),
    "AUTH_SECRET=\nTOKEN_ENCRYPTION_KEY=\nAPP_URL=http://localhost:3000\nDATABASE_PATH=autopilot.sqlite\n",
  );
  return directory;
}
afterEach(() => {
  for (const directory of directories.splice(0)) {
    if (!path.resolve(directory).startsWith(path.resolve("data") + path.sep))
      throw Error("Invalid test fixture directory");
    for (const file of readdirSync(directory))
      unlinkSync(path.join(directory, file));
    rmdirSync(directory);
  }
  vi.unstubAllEnvs();
});
test("first run creates local keys and later runs preserve them", () => {
  vi.stubEnv("AUTH_SECRET", "");
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", "");
  const directory = fixture();
  expect(ensureLocalConfiguration(directory).created).toBe(true);
  const content = readFileSync(path.join(directory, ".env"), "utf8");
  expect(content).toMatch(/TOKEN_ENCRYPTION_KEY=[a-f0-9]{64}/);
  expect(content).toContain("APP_URL=http://127.0.0.1:3000");
  expect(ensureLocalConfiguration(directory).updated).toEqual([]);
  expect(readFileSync(path.join(directory, ".env"), "utf8")).toBe(content);
});
test("copying the example first does not leave blank security keys", () => {
  vi.stubEnv("AUTH_SECRET", "");
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", "");
  const directory = fixture();
  writeFileSync(
    path.join(directory, ".env"),
    readFileSync(path.join(directory, ".env.example")),
  );
  expect(ensureLocalConfiguration(directory).updated).toEqual([
    "AUTH_SECRET",
    "TOKEN_ENCRYPTION_KEY",
  ]);
});
test("setup never creates a replacement key over existing encrypted account records", () => {
  vi.stubEnv("AUTH_SECRET", "");
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", "");
  const directory = fixture(),
    content = readFileSync(path.join(directory, ".env.example"), "utf8");
  writeFileSync(path.join(directory, ".env"), content);
  const db = new Database(path.join(directory, "autopilot.sqlite"));
  db.exec(
    "CREATE TABLE connections(id TEXT,token TEXT); INSERT INTO connections VALUES ('fixture','encrypted');",
  );
  db.close();
  expect(() => ensureLocalConfiguration(directory)).toThrow(
    "original TOKEN_ENCRYPTION_KEY",
  );
  expect(readFileSync(path.join(directory, ".env"), "utf8")).toBe(content);
});
