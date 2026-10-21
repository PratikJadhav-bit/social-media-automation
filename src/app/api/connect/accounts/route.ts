import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { access } from "@/lib/access";
import { sqlite } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/security";
import { requireSameOrigin } from "@/lib/request-origin";
type Pending = {
  brand: string;
  platform: "instagram" | "facebook";
  accounts: {
    id: string;
    name: string;
    accessToken: string;
    expiresAt: number;
  }[];
};
async function pending(req: NextRequest) {
  const nonce = req.cookies.get("connect-selection")?.value;
  if (!nonce || !/^[a-f0-9-]{36}$/.test(nonce))
    throw Error("No pending account selection.");
  const row = sqlite
    .prepare("SELECT value FROM cache WHERE key=? AND expires_at>?")
    .get(`pending-meta:${nonce}`, Date.now()) as { value: string } | undefined;
  if (!row)
    throw Error("Account selection expired. Connect the account again.");
  const value = decrypt<Pending>(JSON.parse(row.value));
  await access(value.brand);
  return { nonce, value };
}
export async function GET(req: NextRequest) {
  try {
    const { value } = await pending(req);
    return NextResponse.json({
      brandId: value.brand,
      platform: value.platform,
      accounts: value.accounts.map((a) => ({ id: a.id, name: a.name })),
    });
  } catch {
    return NextResponse.json({ accounts: [] });
  }
}
export async function POST(req: NextRequest) {
  try {
    requireSameOrigin(req, true);
    const { nonce, value } = await pending(req);
    const { id } = z
      .object({ id: z.string().max(100) })
      .parse(await req.json());
    const account = value.accounts.find((a) => a.id === id);
    if (!account) throw Error("Choose one of the available accounts.");
    sqlite.transaction(() => {
      sqlite
        .prepare(
          "INSERT INTO connections VALUES (?,?,?,?,?,?) ON CONFLICT(brand_id,platform) DO UPDATE SET account_id=excluded.account_id,token=excluded.token,mode=excluded.mode",
        )
        .run(
          crypto.randomUUID(),
          value.brand,
          value.platform,
          account.id,
          encrypt({
            accessToken: account.accessToken,
            expiresAt: account.expiresAt,
          }),
          "live",
        );
      sqlite
        .prepare("DELETE FROM cache WHERE key=?")
        .run(`pending-meta:${nonce}`);
    })();
    const response = NextResponse.json({ ok: true, brandId: value.brand });
    response.cookies.set("connect-selection", "", {
      maxAge: 0,
      path: "/api/connect",
    });
    return response;
  } catch {
    return NextResponse.json(
      {
        error:
          "Could not connect this account. Retry the login if the selection has expired.",
      },
      { status: 400 },
    );
  }
}
