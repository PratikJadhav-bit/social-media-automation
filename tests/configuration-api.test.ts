import { beforeEach, afterEach, test, expect, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));
import { POST } from "@/app/api/configuration/route";
import { GET as workspace } from "@/app/api/workspace/route";
import { sqlite } from "@/lib/db";
import { configured } from "@/lib/configuration";
import { requireSameOrigin } from "@/lib/request-origin";
beforeEach(() => {
  vi.stubEnv("ADMIN_EMAIL", "");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", "1".repeat(64));
});
afterEach(() => {
  sqlite
    .prepare(
      "DELETE FROM cache WHERE key LIKE 'credential:%' OR key LIKE 'configuration:%'",
    )
    .run();
  vi.unstubAllEnvs();
});
const request = (body: unknown, origin = "http://localhost:3000") =>
  new NextRequest("http://localhost:3000/api/configuration", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
test("owner saves encrypted credentials without exposing them in workspace data", async () => {
  const response = await POST(
    request({
      credentials: {
        GOOGLE_CLIENT_ID: "qa-id",
        GOOGLE_CLIENT_SECRET: "qa-private-secret",
      },
    }),
  );
  expect(response.status).toBe(200);
  expect(configured("GOOGLE_CLIENT_SECRET")).toBe("qa-private-secret");
  const row = sqlite
    .prepare(
      "SELECT value FROM cache WHERE key='credential:GOOGLE_CLIENT_SECRET'",
    )
    .get() as { value: string };
  expect(row.value).not.toContain("qa-private-secret");
  const output = await (
    await workspace(new NextRequest("http://localhost:3000/api/workspace"))
  ).text();
  expect(output).not.toContain("qa-private-secret");
  expect(output).not.toContain("qa-id");
  expect(
    (await POST(request({ credentials: { GOOGLE_CLIENT_SECRET: "" } }))).status,
  ).toBe(200);
  expect(configured("GOOGLE_CLIENT_SECRET")).toBe("qa-private-secret");
});
test("configuration rejects cross-origin writes and unknown credential names", async () => {
  expect(
    (
      await POST(
        request(
          { credentials: { META_CLIENT_ID: "bad" } },
          "https://attacker.example",
        ),
      )
    ).status,
  ).toBe(400);
  expect(
    (await POST(request({ credentials: { UNSUPPORTED_SECRET: "bad" } })))
      .status,
  ).toBe(400);
  expect(configured("META_CLIENT_ID")).not.toBe("bad");
});
test("local host aliases work without accepting foreign browser origins", () => {
  const local = new NextRequest("http://localhost:3000/api/workspace", {
    headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" },
  });
  expect(() => requireSameOrigin(local, true)).not.toThrow();
  const foreign = new NextRequest("http://localhost:3000/api/workspace", {
    headers: { host: "127.0.0.1:3000", origin: "https://attacker.example" },
  });
  expect(() => requireSameOrigin(foreign, true)).toThrow("Unauthorized origin");
});
test("public media configuration rejects credentials and insecure URLs",async()=>{
  for(const url of ["http://cdn.example/media","https://user:secret@cdn.example/media","https://cdn.example/media?key=secret"]) expect((await POST(request({publicMediaURL:url}))).status).toBe(400);
  expect((await POST(request({publicMediaURL:"https://cdn.example/media/"}))).status).toBe(200);
  expect(configured("PUBLIC_MEDIA_URL")).toBe("https://cdn.example/media");
});
