import { test, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));
import { GET as start } from "@/app/api/connect/[platform]/route";
import { GET as callback } from "@/app/api/connect/callback/route";
import {
  GET as accounts,
  POST as select,
} from "@/app/api/connect/accounts/route";
import { sqlite } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/security";
beforeEach(() => {
  for (const [name, value] of Object.entries({
    NODE_ENV: "test",
    ADMIN_EMAIL: "",
    TOKEN_ENCRYPTION_KEY: "2".repeat(64),
    META_CLIENT_ID: "qa-meta",
    META_CLIENT_SECRET: "qa-meta-secret",
    GOOGLE_CLIENT_ID: "qa-google",
    GOOGLE_CLIENT_SECRET: "qa-google-secret",
    APP_URL: "http://127.0.0.1:3000",
  }))
    vi.stubEnv(name, value);
});
afterEach(() => {
  sqlite.prepare("DELETE FROM connections WHERE brand_id='default'").run();
  sqlite.prepare("DELETE FROM cache WHERE key LIKE 'pending-meta:%'").run();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function callbackRequest(platform = "instagram") {
  const state = encrypt({
    state: "qa-state",
    brand: "default",
    platform,
    redirectUri: "http://127.0.0.1:3000/api/connect/callback",
    createdAt: Date.now(),
  });
  return new NextRequest(
    "http://127.0.0.1:3000/api/connect/callback?state=qa-state&code=qa-code",
    { headers: { cookie: `connect-state=${state}` } },
  );
}
test("OAuth starts on the canonical host and Facebook avoids Instagram-only scopes", async () => {
  const response = await start(
    new NextRequest("http://localhost:3000/api/connect/facebook", {
      headers: { host: "127.0.0.1:3000" },
    }),
    { params: Promise.resolve({ platform: "facebook" }) },
  );
  const target = new URL(response.headers.get("location")!);
  expect(target.hostname).toBe("www.facebook.com");
  expect(target.searchParams.get("redirect_uri")).toBe(
    "http://127.0.0.1:3000/api/connect/callback",
  );
  expect(target.searchParams.get("scope")).not.toContain("instagram");
  expect(response.cookies.get("connect-state")).toBeDefined();
});
test("multiple eligible Meta accounts are selected without sending tokens to the browser", async () => {
  const values = [
    { access_token: "short" },
    { access_token: "long", expires_in: 3600 },
    {
      data: [
        {
          id: "p1",
          name: "First",
          access_token: "private-page-one",
          instagram_business_account: { id: "ig1", username: "first" },
        },
        {
          id: "p2",
          name: "Second",
          access_token: "private-page-two",
          instagram_business_account: { id: "ig2", username: "second" },
        },
      ],
    },
  ];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify(values.shift()), {
          headers: { "content-type": "application/json" },
        }),
    ),
  );
  const response = await callback(callbackRequest());
  expect(
    new URL(response.headers.get("location")!).searchParams.get(
      "selectAccount",
    ),
  ).toBe("1");
  const cookie = response.cookies.get("connect-selection")!;
  const header = `connect-selection=${cookie.value}`;
  const available = await accounts(
    new NextRequest("http://127.0.0.1:3000/api/connect/accounts", {
      headers: { cookie: header },
    }),
  );
  const text = await available.text();
  expect(text).toContain("second");
  expect(text).not.toContain("private-page");
  const selected = await select(
    new NextRequest("http://127.0.0.1:3000/api/connect/accounts", {
      method: "POST",
      headers: {
        host: "127.0.0.1:3000",
        origin: "http://127.0.0.1:3000",
        cookie: header,
        "content-type": "application/json",
      },
      body: JSON.stringify({ id: "ig2" }),
    }),
  );
  expect(selected.status).toBe(200);
  const connection = sqlite
    .prepare(
      "SELECT * FROM connections WHERE brand_id='default' AND platform='instagram'",
    )
    .get() as { account_id: string; token: string; mode: string };
  expect(connection.account_id).toBe("ig2");
  expect(connection.mode).toBe("live");
  expect(decrypt<{ accessToken: string }>(connection.token).accessToken).toBe(
    "private-page-two",
  );
  expect(
    (
      await (
        await accounts(
          new NextRequest("http://127.0.0.1:3000/api/connect/accounts", {
            headers: { cookie: header },
          }),
        )
      ).json()
    ).accounts,
  ).toEqual([]);
});
test("one eligible Instagram account among other Pages connects directly", async () => {
  const values = [
    { access_token: "short" },
    { access_token: "long", expires_in: 3600 },
    {
      data: [
        { id: "p1", access_token: "page-one" },
        {
          id: "p2",
          access_token: "page-two",
          instagram_business_account: { id: "ig2" },
        },
      ],
    },
  ];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(values.shift()))),
  );
  const response = await callback(callbackRequest());
  expect(
    new URL(response.headers.get("location")!).searchParams.get("connected"),
  ).toBe("1");
  expect(
    (
      sqlite
        .prepare(
          "SELECT account_id FROM connections WHERE brand_id='default' AND platform='instagram'",
        )
        .get() as { account_id: string }
    ).account_id,
  ).toBe("ig2");
});
test("YouTube reconnection preserves an existing refresh token", async () => {
  sqlite
    .prepare("INSERT INTO connections VALUES (?,?,?,?,?,?)")
    .run(
      crypto.randomUUID(),
      "default",
      "youtube",
      "old",
      encrypt({ accessToken: "old-token", refreshToken: "stable-refresh" }),
      "live",
    );
  const values = [
    { access_token: "new-token", expires_in: 3600 },
    { items: [{ id: "channel" }] },
  ];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(values.shift()))),
  );
  const response = await callback(callbackRequest("youtube"));
  expect(response.status).toBe(307);
  const row = sqlite
    .prepare(
      "SELECT token FROM connections WHERE brand_id='default' AND platform='youtube'",
    )
    .get() as { token: string };
  expect(decrypt<{ refreshToken: string }>(row.token).refreshToken).toBe(
    "stable-refresh",
  );
});
