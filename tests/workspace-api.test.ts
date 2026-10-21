import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));
import { auth } from "@/auth";
import { GET, POST } from "@/app/api/workspace/route";
import { GET as mediaGET } from "@/app/api/media/[...path]/route";
import { GET as connectGET } from "@/app/api/connect/[platform]/route";
import { sqlite } from "@/lib/db";
beforeEach(() => {
  vi.stubEnv("ADMIN_EMAIL", "");
  vi.stubEnv("NODE_ENV", "test");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
test("each unconfigured live connection returns a useful dashboard error", async () => {
  for (const key of [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "META_CLIENT_ID",
    "META_CLIENT_SECRET",
    "TOKEN_ENCRYPTION_KEY",
  ])
    vi.stubEnv(key, "");
  for (const platform of ["instagram", "facebook", "youtube"]) {
    const response = await connectGET(
      new NextRequest(`http://localhost:3000/api/connect/${platform}`),
      { params: Promise.resolve({ platform }) },
    );
    expect(response.status).toBe(307);
    const target = new URL(response.headers.get("location")!);
    expect(target.pathname).toBe("/");
    expect(target.searchParams.get("connectionError")).toContain(
      "Connection setup required",
    );
    expect(response.headers.get("set-cookie")).toBeNull();
  }
});
const request = (body: unknown, origin = "http://localhost:3000") =>
  new NextRequest("http://localhost:3000/api/workspace", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
async function action(
  action: string,
  brandId: string,
  extra: Record<string, unknown> = {},
) {
  const response = await POST(request({ action, brandId, ...extra }));
  expect(response.status, await response.clone().text()).toBe(200);
  return response.json();
}
async function workspace(brand = "default") {
  const response = await GET(
    new NextRequest(`http://localhost:3000/api/workspace?brand=${brand}`),
  );
  expect(response.status).toBe(200);
  return response.json();
}
test("rejects cross-origin writes, invalid input and inaccessible brand", async () => {
  expect(
    (
      await POST(
        request(
          {
            action: "create",
            title: "Title",
            format: "image",
            language: "English",
          },
          "https://attacker.example",
        ),
      )
    ).status,
  ).toBe(401);
  expect(
    (await POST(request({ action: "create", title: "x", format: "invalid" })))
      .status,
  ).toBe(400);
  expect(
    (
      await GET(
        new NextRequest("http://localhost:3000/api/workspace?brand=missing"),
      )
    ).status,
  ).toBe(401);
});
test("production requires sign-in and enforces tenant ownership", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("ADMIN_EMAIL", "qa@example.test");
  expect(
    (await GET(new NextRequest("http://localhost:3000/api/workspace"))).status,
  ).toBe(401);
  vi.mocked(auth).mockResolvedValueOnce({ tenantId: "other-tenant" } as never);
  expect(
    (await GET(new NextRequest("http://localhost:3000/api/workspace"))).status,
  ).toBe(401);
});
test("API workflow regenerates edits, schedules only compatible platforms, serves media and preserves idempotency", async () => {
  const name = `API QA ${crypto.randomUUID()}`;
  await action("brand", "default", { name });
  const brand = (await workspace()).brands.find(
    (b: { name: string }) => b.name === name,
  ).id;
  await action("create", brand, {
    title: "QA: consumer documentation",
    format: "image",
    language: "English",
  });
  const id = (await workspace(brand)).posts[0].id;
  await action("generate", brand, { id });
  await action("run", brand);
  let state = await workspace(brand);
  expect(state.posts[0].status).toBe("review");
  const script = JSON.parse(state.posts[0].script);
  script.hook = "Edited QA hook";
  script.onScreen = ["Edited QA visual"];
  await action("edit", brand, { id, script });
  state = await workspace(brand);
  expect(state.posts[0].status).toBe("generating");
  expect(state.posts[0].assets).toBeNull();
  await action("run", brand);
  state = await workspace(brand);
  expect(state.posts[0].status).toBe("review");
  const asset = JSON.parse(state.posts[0].assets)[0];
  const response = await mediaGET(
    new Request("http://localhost:3000/api/media/" + asset.path),
    { params: Promise.resolve({ path: asset.path.split("/") }) },
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/jpeg");
  expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(1000);
  const partial = await mediaGET(
    new Request("http://localhost:3000/api/media/" + asset.path, {
      headers: { range: "bytes=0-63" },
    }),
    { params: Promise.resolve({ path: asset.path.split("/") }) },
  );
  expect(partial.status).toBe(206);
  expect((await partial.arrayBuffer()).byteLength).toBe(64);
  expect(partial.headers.get("content-range")).toMatch(/^bytes 0-63\//);
  const invalidRange = await mediaGET(
    new Request("http://localhost:3000/api/media/" + asset.path, {
      headers: { range: "bytes=999999999-" },
    }),
    { params: Promise.resolve({ path: asset.path.split("/") }) },
  );
  expect(invalidRange.status).toBe(416);
  const traversal = await mediaGET(
    new Request("http://localhost:3000/api/media/test"),
    { params: Promise.resolve({ path: [id, "../other-tenant/secret.jpg"] }) },
  );
  expect(traversal.status).toBe(404);
  const nested = await mediaGET(
    new Request("http://localhost:3000/api/media/test"),
    {
      params: Promise.resolve({
        path: [id, "..", "other-tenant", "secret.jpg"],
      }),
    },
  );
  expect(nested.status).toBe(404);
  for (const platform of ["instagram", "facebook"])
    await action("connectMock", brand, { platform });
  await action("approve", brand, { id });
  state = await workspace(brand);
  const publishJobs = state.jobs.filter(
    (j: { stage: string }) => j.stage === "publish",
  );
  expect(publishJobs).toHaveLength(2);
  expect(
    publishJobs
      .map((j: { payload: string }) => JSON.parse(j.payload).platform)
      .sort(),
  ).toEqual(["facebook", "instagram"]);
  sqlite.prepare("UPDATE jobs SET run_at=0 WHERE brand_id=?").run(brand);
  await action("run", brand);
  sqlite.prepare("UPDATE jobs SET run_at=0 WHERE brand_id=?").run(brand);
  await action("run", brand);
  state = await workspace(brand);
  expect(state.posts[0].status).toBe("published");
  expect(state.metrics).toHaveLength(2);
  await action("run", brand);
  expect(
    (
      sqlite
        .prepare("SELECT COUNT(*) n FROM publications WHERE post_id=?")
        .get(id) as { n: number }
    ).n,
  ).toBe(2);
}, 30000);
