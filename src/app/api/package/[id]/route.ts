import { NextRequest, NextResponse } from "next/server";
import { access } from "@/lib/access";
import { sqlite } from "@/lib/db";
import { postingZip } from "@/lib/posting-package";
import type { Post } from "@/lib/types";
export const runtime = "nodejs";
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const post = sqlite.prepare("SELECT * FROM posts WHERE id=?").get(id) as
      Post | undefined;
    if (!post)
      return NextResponse.json(
        { error: "Content not found." },
        { status: 404 },
      );
    await access(post.brand_id);
    const zip = await postingZip(post);
    return new Response(new Uint8Array(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="content-${post.id}.zip"`,
        "Cache-Control": "private, no-store",
        "Content-Length": String(zip.length),
      },
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Could not download the package. Sign in and check that its media is available; individual downloads are also available.",
      },
      { status: 400 },
    );
  }
}
