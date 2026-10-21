import { test, expect } from "vitest";
import { MockPublisher, YouTubePublisher } from "../src/lib/publishers";
import type { Post } from "../src/lib/types";
const p = { id: "test", format: "image" } as Post,
  c = {
    id: "c",
    platform: "youtube" as const,
    account_id: "x",
    token: null,
    mode: "mock",
  };
test("mock publication is deterministic across retries", async () => {
  const pub = new MockPublisher();
  expect(await pub.publish(p, c)).toBe(await pub.publish(p, c));
});
test("YouTube rejects image format before any external call", async () => {
  await expect(new YouTubePublisher().publish(p, c)).rejects.toThrow(
    "requires a video",
  );
});
