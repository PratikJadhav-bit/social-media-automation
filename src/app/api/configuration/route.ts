import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { tenant } from "@/lib/access";
import { requireSameOrigin } from "@/lib/request-origin";
import { credentialNames, saveCredential } from "@/lib/configuration";
import { sqlite } from "@/lib/db";
export async function POST(req: NextRequest) {
  try {
    requireSameOrigin(req, true);
    if ((await tenant()) !== "local")
      throw Error("Only the workspace owner can change app credentials.");
    const input = z
      .object({
        credentials: z
          .partialRecord(
            z.enum(
              credentialNames.filter((name) => !name.startsWith("WHATSAPP_")),
            ),
            z.string().trim().max(4096),
          )
          .default({}),
        publishingEnabled: z.boolean().optional(),
        publicMediaURL: z
          .string()
          .max(2000)
          .optional()
          .refine((value) => {
            if (!value) return true;
            try {
              const url = new URL(value);
              return (
                url.protocol === "https:" &&
                !url.username &&
                !url.password &&
                !url.search &&
                !url.hash
              );
            } catch {
              return false;
            }
          }),
        mode: z.enum(["mock", "live"]).optional(),
      })
      .parse(await req.json());
    sqlite.transaction(() => {
      if (input.publicMediaURL)
        sqlite
          .prepare(
            "INSERT INTO cache VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,expires_at=excluded.expires_at",
          )
          .run(
            "configuration:public-media-url",
            JSON.stringify(input.publicMediaURL.replace(/\/$/, "")),
            Number.MAX_SAFE_INTEGER,
          );
      for (const [name, value] of Object.entries(input.credentials))
        if (value)
          saveCredential(name as (typeof credentialNames)[number], value);
      if (input.publishingEnabled !== undefined)
        sqlite
          .prepare(
            "INSERT INTO cache VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,expires_at=excluded.expires_at",
          )
          .run(
            "configuration:publish-mode",
            JSON.stringify(input.publishingEnabled ? "live" : "mock"),
            Number.MAX_SAFE_INTEGER,
          );
      if (input.mode)
        sqlite
          .prepare(
            "INSERT INTO cache VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,expires_at=excluded.expires_at",
          )
          .run(
            "configuration:provider-mode",
            JSON.stringify(input.mode),
            Number.MAX_SAFE_INTEGER,
          );
    })();
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = String(e);
    return NextResponse.json(
      {
        error: message.includes("TOKEN_ENCRYPTION_KEY")
          ? "Run npm run setup and restart the website before saving credentials. This creates a stable encryption key."
          : message.includes("Unauthorized")
            ? "Sign in and submit from this website."
            : "Could not save settings. Check the fields and try again; existing credentials have been preserved.",
      },
      { status: 400 },
    );
  }
}
