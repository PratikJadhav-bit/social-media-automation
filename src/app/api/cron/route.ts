import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { recurring, runOnce } from "@/lib/queue";
export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SECRET,
    actual = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (
    !expected ||
    !actual ||
    expected.length !== actual.length ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  recurring();
  return NextResponse.json({ processed: await runOnce(25) });
}
