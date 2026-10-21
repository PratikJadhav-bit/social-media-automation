import { test, expect, vi, afterEach } from "vitest";
import { connectionSetup } from "../src/lib/connection-setup";
import { sqlite, settings } from "../src/lib/db";
import { research } from "../src/lib/ideas";
vi.mock("../src/lib/trends", () => ({
  trends: vi.fn(async () => [
    {
      title: "New astronomy discovery",
      source: "Google Trends India",
      url: "https://example.com/space",
    },
  ]),
  semanticFilter: vi.fn(async (candidates) => candidates),
}));
afterEach(() => vi.unstubAllEnvs());
test("general discovery accepts a sourced topic outside the configured niche in mock mode", async () => {
  const id = crypto.randomUUID();
  sqlite
    .prepare("INSERT INTO brands VALUES (?,?,?,?)")
    .run(
      id,
      "local",
      "Discovery",
      JSON.stringify({ ...settings(), discoveryMode: "trending" }),
    );
  const ideas = await research(id);
  expect(ideas[0].title).toBe("New astronomy discovery");
  expect(ideas[0].url).toBe("https://example.com/space");
});
test("all connections expose missing setup without exposing credentials", () => {
  for (const key of [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "META_CLIENT_ID",
    "META_CLIENT_SECRET",
    "TOKEN_ENCRYPTION_KEY",
  ])
    vi.stubEnv(key, "");
  const setup = connectionSetup("http://127.0.0.1:3000");
  expect(Object.values(setup).every((s) => !s.ready)).toBe(true);
  vi.stubEnv("GOOGLE_CLIENT_ID", "private-id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "private-secret");
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", "a".repeat(64));
  const ready = connectionSetup("http://127.0.0.1:3000");
  expect(ready.youtube.ready).toBe(true);
  expect(JSON.stringify(ready)).not.toContain("private-secret");
  expect(ready.instagram.ready).toBe(false);
});
