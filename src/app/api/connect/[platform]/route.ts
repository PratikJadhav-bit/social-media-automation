import { requestOrigin } from "@/lib/request-origin";
import { configured } from "@/lib/configuration";
import { connectionSetup } from "@/lib/connection-setup";
import { NextRequest, NextResponse } from "next/server";
import { access } from "@/lib/access";
import { encrypt } from "@/lib/security";
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ platform: string }> },
) {
  try {
    const { platform } = await params;
    if (!["instagram", "facebook", "youtube"].includes(platform))
      throw Error("Unknown platform");
    const brand = req.nextUrl.searchParams.get("brand") || "default";
    await access(brand);
    const setup = connectionSetup(requestOrigin(req))[platform];
    if (!setup.ready)
      throw Error(`Connection setup required: ${setup.missing.join(", ")}`);
    const canonical = new URL(setup.redirectUri).origin;
    if (canonical !== requestOrigin(req))
      return NextResponse.redirect(
        new URL(req.nextUrl.pathname + req.nextUrl.search, canonical),
      );
    const youtube = platform === "youtube",
      clientId = configured(youtube ? "GOOGLE_CLIENT_ID" : "META_CLIENT_ID");
    if (!clientId)
      throw Error(
        `Set ${youtube ? "GOOGLE" : "META"}_CLIENT_ID and CLIENT_SECRET to enable OAuth`,
      );
    const state = crypto.randomUUID(),
      redirectUri = setup.redirectUri;
    const url = new URL(
      youtube
        ? "https://accounts.google.com/o/oauth2/v2/auth"
        : `https://www.facebook.com/${process.env.META_API_VERSION || "v23.0"}/dialog/oauth`,
    );
    url.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      response_type: "code",
      scope: youtube
        ? "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly"
        : platform === "facebook"
          ? "pages_show_list,pages_read_engagement,pages_manage_posts"
          : "pages_show_list,pages_read_engagement,instagram_basic,instagram_content_publish,instagram_manage_insights,instagram_manage_comments",
      ...(youtube ? { access_type: "offline", prompt: "consent" } : {}),
    }).toString();
    const res = NextResponse.redirect(url);
    res.cookies.set(
      "connect-state",
      encrypt({ state, brand, platform, redirectUri, createdAt: Date.now() }),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: req.nextUrl.protocol === "https:",
        maxAge: 600,
        path: "/api/connect",
      },
    );
    return res;
  } catch (e) {
    const target = new URL("/", requestOrigin(req));
    target.searchParams.set("connectionError", String(e));
    return NextResponse.redirect(target);
  }
}
