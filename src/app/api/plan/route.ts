import { NextRequest, NextResponse } from "next/server";
import { access } from "@/lib/access";
import { settings, sqlite } from "@/lib/db";
import { nextSlot } from "@/lib/scheduler";
import type { Post } from "@/lib/types";
export async function GET(req: NextRequest) {
  try {
    const brand = req.nextUrl.searchParams.get("brand") || "default";
    await access(brand);
    const config = settings(brand),
      now = Date.now();
    const ideas = sqlite
      .prepare(
        "SELECT * FROM posts WHERE brand_id=? AND status='idea' ORDER BY created_at DESC LIMIT 14",
      )
      .all(brand) as Post[];
    const occupied = (
      sqlite
        .prepare(
          "SELECT scheduled_at FROM posts WHERE brand_id=? AND status IN ('scheduled','publishing','published') AND scheduled_at>?",
        )
        .all(brand, now) as { scheduled_at: number }[]
    ).map((p) => p.scheduled_at);
    const slots = ideas.map((post) => {
      const at = nextSlot(config, now + 60000, occupied, 0);
      occupied.push(at);
      return {
        id: post.id,
        title: post.title,
        format: post.format,
        language: post.language,
        at,
      };
    });
    return NextResponse.json({
      timezone: config.timezone,
      slots,
      note: "Planning preview only. Generate and approve each draft before it enters the publishing schedule.",
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "The plan could not load. Choose an existing channel and try again.",
      },
      { status: 400 },
    );
  }
}
