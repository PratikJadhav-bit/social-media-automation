import { test, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { unzipSync, strFromU8 } from "fflate";
vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));
vi.mock("@/lib/trends", () => ({
  trends: vi.fn(async () => [
    {
      title: "New battery technology explained",
      source: "Google Trends RSS",
      url: "https://example.com/research",
      interest: 100000,
      publishedAt: Date.now(),
    },
    {
      title: "City arts festival opens",
      source: "Google News RSS",
      url: "https://example.com/festival",
      interest: 100,
    },
  ]),
  feedHealth: () => null,
  semanticFilter: async (candidates: unknown[]) => candidates,
}));
import { sqlite } from "@/lib/db";
import { createPost, startPost, runOnce, approve, enqueue } from "@/lib/queue";
import { defaults, type Post, type Script } from "@/lib/types";
import { MockLLM } from "@/lib/providers";
import { saveCredential } from "@/lib/configuration";
import { notifyReady, notificationState } from "@/lib/whatsapp";
import { postingZip } from "@/lib/posting-package";
import { POST as saveNotifications } from "@/app/api/notifications/route";
import { POST as workspace } from "@/app/api/workspace/route";
let brand: string;
beforeEach(() => {
  vi.stubEnv("DELIVERY_MODE", "manual");
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", "a".repeat(64));
  vi.stubEnv("ADMIN_EMAIL", "");
  vi.stubEnv("NODE_ENV", "test");
  brand = crypto.randomUUID();
  sqlite.prepare("INSERT INTO brands VALUES (?,?,?,?)").run(
    brand,
    "local",
    "Manual delivery test",
    JSON.stringify({
      ...defaults,
      languages: ["English"],
      autoGenerate: true,
    }),
  );
  sqlite
    .prepare(
      "DELETE FROM cache WHERE key LIKE 'credential:WHATSAPP_%' OR key='configuration:whatsapp-enabled'",
    )
    .run();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function configure() {
  for (const [key, value] of Object.entries({
    WHATSAPP_ACCESS_TOKEN: "private-test-token",
    WHATSAPP_PHONE_NUMBER_ID: "1234567890",
    WHATSAPP_RECIPIENT: "919876543210",
    WHATSAPP_TEMPLATE_NAME: "content_ready",
    WHATSAPP_TEMPLATE_LANGUAGE: "en",
    WHATSAPP_GRAPH_VERSION: "v24.0",
  }))
    saveCredential(key as Parameters<typeof saveCredential>[0], value);
  sqlite
    .prepare(
      "INSERT OR REPLACE INTO cache VALUES ('configuration:whatsapp-enabled','\"true\"',?)",
    )
    .run(Number.MAX_SAFE_INTEGER);
}
async function fixture() {
  const id = createPost(brand, "A practical battery explainer");
  const s: Script = await new MockLLM().generate(
    "A practical battery explainer",
    "reel",
    "English",
    defaults,
  );
  s.caption += "\n" + defaults.disclaimer;
  s.generationMode = "mock";
  sqlite
    .prepare(
      "UPDATE posts SET script=?,assets='[]',checks=?,status='ready' WHERE id=?",
    )
    .run(
      JSON.stringify(s),
      JSON.stringify({ passed: true, deliveryRevision: "revision" }),
      id,
    );
  return sqlite.prepare("SELECT * FROM posts WHERE id=?").get(id) as Post;
}
function request(url: string, body: unknown, origin = "http://localhost:3000") {
  return new NextRequest(`http://localhost:3000${url}`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
test("full ranked trend → script → playable media → ZIP → paused alert flow never creates publishing jobs", async () => {
  enqueue(brand, null, "research", `${brand}:research`);
  await runOnce(10, brand);
  const posts = sqlite
    .prepare("SELECT * FROM posts WHERE brand_id=?")
    .all(brand) as Post[];
  expect(posts).toHaveLength(2);
  expect(posts.every((p) => p.status === "ready")).toBe(true);
  expect(
    sqlite
      .prepare("SELECT id FROM jobs WHERE brand_id=? AND stage='publish'")
      .all(brand),
  ).toHaveLength(0);
  expect(() => approve(brand, posts[0].id)).toThrow(
    "Automatic posting is disabled",
  );
  const files = unzipSync(await postingZip(posts[0]));
  expect(Object.keys(files).some((k) => k.endsWith(".mp4"))).toBe(true);
  const copy = strFromU8(files["posting-copy.txt"]);
  expect(copy).toContain("HASHTAGS");
  expect(copy).toContain("YOUTUBE TITLE");
  expect(copy).toContain("https://example.com/");
  expect(notificationState(posts[0].id)?.status).toBe("setup");
  const response = await workspace(
    request("/api/workspace", {
      action: "markPosted",
      brandId: brand,
      id: posts[0].id,
    }),
  );
  expect(response.status).toBe(200);
  expect(
    (
      sqlite
        .prepare("SELECT status FROM posts WHERE id=?")
        .get(posts[0].id) as Post
    ).status,
  ).toBe("posted");
}, 60000);
test("manual generation is enabled; legacy publishing jobs are blocked without network calls", async () => {
  const p = await fixture();
  enqueue(brand, p.id, "publish", `${p.id}:publish`, Date.now(), {
    platform: "youtube",
  });
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await runOnce(1, brand);
  expect(fetch).not.toHaveBeenCalled();
  expect(
    (
      sqlite.prepare("SELECT status FROM jobs WHERE post_id=?").get(p.id) as {
        status: string;
      }
    ).status,
  ).toBe("blocked");
});
test("WhatsApp sends an approved template and deduplicates accepted revisions", async () => {
  configure();
  const p = await fixture();
  const fetch = vi.fn(async () =>
    Response.json({ messages: [{ id: "wamid.test" }] }),
  );
  vi.stubGlobal("fetch", fetch);
  await notifyReady(p, "revision");
  await notifyReady(p, "revision");
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, options] = fetch.mock.calls[0] as unknown as [
    string,
    RequestInit,
  ];
  expect(url).toBe("https://graph.facebook.com/v24.0/1234567890/messages");
  const payload = JSON.parse(options.body as string);
  expect(payload.type).toBe("template");
  expect(payload.template.components[0].parameters).toHaveLength(3);
  expect(JSON.stringify(payload)).toContain("Preview package");
  expect(notificationState(p.id)?.status).toBe("accepted");
});
test("network uncertainty never retries blindly or claims delivery", async () => {
  configure();
  const p = await fixture();
  const fetch = vi.fn(async () => {
    throw Error("connection reset");
  });
  vi.stubGlobal("fetch", fetch);
  await expect(notifyReady(p, "revision")).rejects.toThrow("uncertain");
  await expect(notifyReady(p, "revision")).rejects.toThrow("uncertain");
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(notificationState(p.id)?.status).toBe("uncertain");
});
test("provider rejection preserves content with a recoverable notification status", async () => {
  configure();
  const p = await fixture();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json(
        { error: { code: 132001, message: "secret provider debug text" } },
        { status: 400 },
      ),
    ),
  );
  await expect(notifyReady(p, "revision")).rejects.toThrow(
    "configuration rejected",
  );
  expect(notificationState(p.id)?.status).toBe("blocked");
  expect(notificationState(p.id)?.detail).not.toContain("secret provider");
  expect(
    (sqlite.prepare("SELECT status FROM posts WHERE id=?").get(p.id) as Post)
      .status,
  ).toBe("ready");
});
test("WhatsApp configuration is encrypted, validated and same-origin protected", async () => {
  const body = {
    enabled: true,
    credentials: {
      WHATSAPP_ACCESS_TOKEN: "private-test-token",
      WHATSAPP_RECIPIENT: "919876543210",
    },
  };
  expect(
    (
      await saveNotifications(
        request("/api/notifications", body, "https://evil.example"),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await saveNotifications(
        request("/api/notifications", {
          enabled: true,
          credentials: { WHATSAPP_RECIPIENT: "+91 invalid" },
        }),
      )
    ).status,
  ).toBe(400);
  const r = await saveNotifications(request("/api/notifications", body));
  expect(r.status).toBe(200);
  expect(JSON.stringify(await r.json())).not.toContain("private-test-token");
  expect(
    (
      sqlite
        .prepare(
          "SELECT value FROM cache WHERE key='credential:WHATSAPP_ACCESS_TOKEN'",
        )
        .get() as { value: string }
    ).value,
  ).not.toContain("private-test-token");
});
test("package rejects an asset path escaping the media directory", async () => {
  const p = await fixture();
  p.assets = JSON.stringify([{ path: "../../package.json", kind: "image" }]);
  await expect(postingZip(p)).rejects.toThrow("Invalid media path");
});
