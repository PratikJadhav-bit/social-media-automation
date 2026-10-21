import { requestOrigin } from "@/lib/request-origin";
import { configured } from "@/lib/configuration";
import { NextRequest, NextResponse } from "next/server";
import { access } from "@/lib/access";
import { decrypt, encrypt } from "@/lib/security";
import { sqlite } from "@/lib/db";
type State = {
  state: string;
  brand: string;
  platform: string;
  redirectUri: string;
  createdAt: number;
};
async function json(url: string, init?: RequestInit) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw Error(`OAuth API failed (${r.status})`);
  return r.json();
}
export async function GET(req: NextRequest) {
  try {
    const cookie = req.cookies.get("connect-state")?.value;
    if (!cookie) throw Error("OAuth state missing");
    const s = decrypt<State>(cookie);
    if (
      s.state !== req.nextUrl.searchParams.get("state") ||
      Date.now() - s.createdAt > 600000
    )
      throw Error("Invalid OAuth state");
    await access(s.brand);
    const code = req.nextUrl.searchParams.get("code");
    if (!code) throw Error("OAuth permission denied");
    let accountId: string,
      tokens: {
        accessToken: string;
        refreshToken?: string;
        expiresAt?: number;
      };
    if (s.platform === "youtube") {
      const j = await json("https://oauth2.googleapis.com/token", {
        method: "POST",
        body: new URLSearchParams({
          code,
          client_id: configured("GOOGLE_CLIENT_ID")!,
          client_secret: configured("GOOGLE_CLIENT_SECRET")!,
          redirect_uri: s.redirectUri,
          grant_type: "authorization_code",
        }),
      });
      const channels = await json(
        "https://www.googleapis.com/youtube/v3/channels?part=id&mine=true",
        { headers: { Authorization: `Bearer ${j.access_token}` } },
      );
      accountId = channels.items?.[0]?.id;
      if (!accountId) throw Error("No YouTube channel found");
      const previous = sqlite
        .prepare(
          "SELECT token FROM connections WHERE brand_id=? AND platform=?",
        )
        .get(s.brand, s.platform) as { token: string } | undefined;
      let previousRefresh: string | undefined;
      if (previous?.token)
        try {
          previousRefresh = decrypt<{ refreshToken?: string }>(
            previous.token,
          ).refreshToken;
        } catch {}
      tokens = {
        accessToken: j.access_token,
        refreshToken: j.refresh_token || previousRefresh,
        expiresAt: Date.now() + j.expires_in * 1000,
      };
    } else {
      const base = `https://graph.facebook.com/${process.env.META_API_VERSION || "v23.0"}`;
      const j = await json(`${base}/oauth/access_token`, {
        method: "POST",
        body: new URLSearchParams({
          code,
          client_id: configured("META_CLIENT_ID")!,
          client_secret: configured("META_CLIENT_SECRET")!,
          redirect_uri: s.redirectUri,
        }),
      });
      const long = await json(`${base}/oauth/access_token`, {
        method: "POST",
        body: new URLSearchParams({
          grant_type: "fb_exchange_token",
          client_id: configured("META_CLIENT_ID")!,
          client_secret: configured("META_CLIENT_SECRET")!,
          fb_exchange_token: j.access_token,
        }),
      });
      const pages = await json(
        `${base}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}`,
        { headers: { Authorization: `Bearer ${long.access_token}` } },
      );
      const eligible = (pages.data || []).filter(
        (page: {
          instagram_business_account?: unknown;
          access_token?: string;
        }) =>
          page.access_token &&
          (s.platform === "facebook" || page.instagram_business_account),
      );
      if (!eligible.length)
        throw Error(
          "No eligible Facebook Page / linked Instagram professional account",
        );
      if (eligible.length > 1) {
        const nonce = crypto.randomUUID();
        const value = {
          brand: s.brand,
          platform: s.platform,
          accounts: eligible.map(
            (page: {
              id: string;
              name?: string;
              access_token: string;
              instagram_business_account?: { id: string; username?: string };
            }) => ({
              id:
                s.platform === "facebook"
                  ? page.id
                  : page.instagram_business_account!.id,
              name:
                s.platform === "facebook"
                  ? page.name || "Facebook Page"
                  : page.instagram_business_account!.username ||
                    page.name ||
                    "Instagram account",
              accessToken: page.access_token,
              expiresAt: Date.now() + (long.expires_in || 5184000) * 1000,
            }),
          ),
        };
        sqlite
          .prepare("INSERT INTO cache VALUES (?,?,?)")
          .run(
            `pending-meta:${nonce}`,
            JSON.stringify(encrypt(value)),
            Date.now() + 600000,
          );
        const target = new URL("/", process.env.APP_URL || requestOrigin(req));
        target.searchParams.set("selectAccount", "1");
        target.searchParams.set("brand", s.brand);
        const response = NextResponse.redirect(target);
        response.cookies.set("connect-selection", nonce, {
          httpOnly: true,
          sameSite: "lax",
          secure: target.protocol === "https:",
          maxAge: 600,
          path: "/api/connect",
        });
        response.cookies.set("connect-state", "", {
          maxAge: 0,
          path: "/api/connect",
        });
        return response;
      }
      const page = eligible[0];
      accountId =
        s.platform === "facebook"
          ? page.id
          : page.instagram_business_account.id;
      tokens = {
        accessToken: page.access_token,
        expiresAt: Date.now() + (long.expires_in || 5184000) * 1000,
      };
    }
    sqlite
      .prepare(
        "INSERT INTO connections VALUES (?,?,?,?,?,?) ON CONFLICT(brand_id,platform) DO UPDATE SET account_id=excluded.account_id,token=excluded.token,mode=excluded.mode",
      )
      .run(
        crypto.randomUUID(),
        s.brand,
        s.platform,
        accountId,
        encrypt(tokens),
        "live",
      );
    const res = NextResponse.redirect(
      new URL(
        `/?connected=1&brand=${encodeURIComponent(s.brand)}`,
        process.env.APP_URL || requestOrigin(req),
      ),
    );
    res.cookies.set("connect-state", "", { maxAge: 0, path: "/api/connect" });
    return res;
  } catch (e) {
    const target = new URL("/", requestOrigin(req));
    target.searchParams.set(
      "connectionError",
      String(e).includes("No eligible")
        ? "No eligible account found. Link an Instagram professional account to a Facebook Page and grant access to that Page."
        : String(e).includes("No YouTube")
          ? "No YouTube channel found for this Google account. Create or select a channel and reconnect."
          : String(e).includes("state")
            ? "The login session expired or the callback hostname changed. Start Connect live account again from this website."
            : "Connection was not completed. Check developer app permissions and the registered callback URL, then retry.",
    );
    const res = NextResponse.redirect(target);
    res.cookies.set("connect-state", "", { maxAge: 0, path: "/api/connect" });
    return res;
  }
}
