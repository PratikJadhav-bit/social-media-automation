import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { tenant } from "@/lib/access";
import { requireSameOrigin } from "@/lib/request-origin";
import { saveCredential, type CredentialName } from "@/lib/configuration";
import { sqlite } from "@/lib/db";
import { whatsappSetup } from "@/lib/whatsapp";
const fields = z.object({
  WHATSAPP_ACCESS_TOKEN: z.string().trim().max(4096).optional(),
  WHATSAPP_PHONE_NUMBER_ID: z
    .string()
    .trim()
    .regex(/^\d{5,30}$|^$/)
    .optional(),
  WHATSAPP_RECIPIENT: z
    .string()
    .trim()
    .regex(/^[1-9]\d{7,14}$|^$/)
    .optional(),
  WHATSAPP_TEMPLATE_NAME: z
    .string()
    .trim()
    .regex(/^[a-z0-9_]{1,100}$|^$/)
    .optional(),
  WHATSAPP_TEMPLATE_LANGUAGE: z
    .string()
    .trim()
    .regex(/^[a-z]{2,3}(?:_[A-Z]{2})?$|^$/)
    .optional(),
  WHATSAPP_GRAPH_VERSION: z
    .string()
    .trim()
    .regex(/^v\d{1,3}\.\d{1,2}$|^$/)
    .optional(),
  WHATSAPP_WORKSPACE_URL: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .refine((v) => {
      if (!v) return true;
      try {
        const u = new URL(v);
        return (
          u.protocol === "https:" &&
          !u.username &&
          !u.password &&
          !u.search &&
          !u.hash &&
          (u.pathname === "/" || u.pathname === "")
        );
      } catch {
        return false;
      }
    }),
});
export async function POST(req: NextRequest) {
  try {
    requireSameOrigin(req, true);
    if ((await tenant()) !== "local") throw Error("Unauthorized");
    const v = z
      .object({ enabled: z.boolean(), credentials: fields })
      .parse(await req.json());
    sqlite.transaction(() => {
      for (const [key, value] of Object.entries(v.credentials))
        if (value) saveCredential(key as CredentialName, value);
      sqlite
        .prepare(
          "INSERT INTO cache VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,expires_at=excluded.expires_at",
        )
        .run(
          "configuration:whatsapp-enabled",
          JSON.stringify(String(v.enabled)),
          Number.MAX_SAFE_INTEGER,
        );
    })();
    const setup = whatsappSetup();
    if (setup.ready)
      sqlite
        .prepare(
          "UPDATE jobs SET status='pending',attempts=0,run_at=? WHERE stage='notify' AND status='blocked' AND post_id IN (SELECT p.id FROM posts p JOIN cache c ON c.key='notification:'||p.id WHERE p.status='ready' AND json_extract(c.value,'$.status') IN ('setup','blocked'))",
        )
        .run(Date.now());
    return NextResponse.json({ ok: true, setup });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof z.ZodError
            ? `Check ${String(e.issues[0]?.path.at(-1))}. Use the field format shown.`
            : "Could not save WhatsApp settings. Sign in and check the encryption key; saved content is preserved.",
      },
      { status: 400 },
    );
  }
}
