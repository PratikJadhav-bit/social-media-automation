import { test, expect, vi, afterEach } from "vitest";
import {
  InstagramPublisher,
  FacebookPublisher,
  YouTubePublisher,
  type Connection,
} from "../src/lib/publishers";
import { encrypt } from "../src/lib/security";
import { defaults, type Post } from "../src/lib/types";
import { MockLLM } from "../src/lib/providers";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { mediaRoot } from "../src/lib/media";
afterEach(() => vi.unstubAllGlobals());
function connection(platform: Connection["platform"]): Connection {
  process.env.TOKEN_ENCRYPTION_KEY = "b".repeat(64);
  process.env.PUBLIC_MEDIA_URL = "https://media.example.com";
  return {
    id: "unit-" + platform,
    account_id: "account",
    platform,
    mode: "live",
    token: encrypt({
      accessToken: "unit-test-token",
      expiresAt: Date.now() + 3600000,
    }),
  };
}
async function post(format: Post["format"]): Promise<Post> {
  return {
    id: crypto.randomUUID(),
    brand_id: "default",
    title: "Unit post",
    format,
    language: "English",
    status: "scheduled",
    scheduled_at: Date.now(),
    created_at: Date.now(),
    checks: null,
    script: JSON.stringify(
      await new MockLLM().generate("Unit post", format, "English", defaults),
    ),
    assets: JSON.stringify([
      {
        path: "unit/card.jpg",
        kind: "image",
        license: "Original",
        source: "test",
        mock: false,
      },
      ...(format === "reel"
        ? [
            {
              path: "unit/video.mp4",
              kind: "video",
              license: "Original",
              source: "test",
              mock: false,
            },
          ]
        : []),
    ]),
  };
}
test("Instagram creates, verifies container processing, and publishes", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ id: "container" }))
    .mockResolvedValueOnce(Response.json({ status_code: "FINISHED" }))
    .mockResolvedValueOnce(Response.json({ id: "remote-post" }));
  vi.stubGlobal("fetch", fetch);
  expect(
    await new InstagramPublisher().publish(
      await post("image"),
      connection("instagram"),
    ),
  ).toBe("remote-post");
  expect(fetch).toHaveBeenCalledTimes(3);
  const body = fetch.mock.calls[0][1].body as URLSearchParams;
  expect(body.get("image_url")).toBe("https://media.example.com/unit/card.jpg");
  expect(body.get("caption")).toContain("AI-assisted");
});
test("Facebook Reel follows start, upload, finish protocol", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        video_id: "fb-video",
        upload_url: "https://rupload.facebook.com/video-upload/test",
      }),
    )
    .mockResolvedValueOnce(Response.json({ success: true }))
    .mockResolvedValueOnce(Response.json({ success: true }));
  vi.stubGlobal("fetch", fetch);
  expect(
    await new FacebookPublisher().publish(
      await post("reel"),
      connection("facebook"),
    ),
  ).toBe("fb-video");
  expect(
    (fetch.mock.calls[2][1].body as URLSearchParams).get("upload_phase"),
  ).toBe("finish");
});
test("YouTube creates a resumable upload with private visibility and AI disclosure", async () => {
  await mkdir(path.join(mediaRoot(), "unit"), { recursive: true });
  await writeFile(
    path.join(mediaRoot(), "unit/video.mp4"),
    Buffer.from("mock upload bytes"),
  );
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(null, {
        status: 200,
        headers: { location: "https://www.googleapis.com/upload/session-test" },
      }),
    )
    .mockResolvedValueOnce(Response.json({ id: "yt-video" }));
  vi.stubGlobal("fetch", fetch);
  expect(
    await new YouTubePublisher().publish(
      await post("reel"),
      connection("youtube"),
    ),
  ).toBe("yt-video");
  const body = JSON.parse(fetch.mock.calls[0][1].body);
  expect(body.status).toMatchObject({
    privacyStatus: "private",
    containsSyntheticMedia: true,
  });
  expect(fetch.mock.calls[1][1].method).toBe("PUT");
});
