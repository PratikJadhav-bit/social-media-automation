import { NextResponse } from "next/server";
import { sqlite } from "@/lib/db";
import { access } from "@/lib/access";
import { mediaFile } from "@/lib/media";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const p = (await params).path;
    if (
      p.length !== 2 ||
      p.some(
        (segment) =>
          !segment ||
          segment === "." ||
          segment === ".." ||
          /[\\/\0]/.test(segment),
      )
    )
      throw Error("Invalid media path");
    if (p[0] === "logos") {
      if (p.length !== 2 || !/^[a-zA-Z0-9-]+\.png$/.test(p[1]))
        throw Error("Invalid logo");
      await access(p[1].slice(0, -4));
    } else {
      const row = sqlite
        .prepare("SELECT brand_id FROM posts WHERE id=?")
        .get(p[0]) as { brand_id: string } | undefined;
      if (!row) return new NextResponse("Not found", { status: 404 });
      await access(row.brand_id);
    }
    const data = await mediaFile(p.join("/"));
    const ext = p.at(-1)?.split(".").at(-1);
    const types: Record<string, string> = {
      jpg: "image/jpeg",
      png: "image/png",
      mp4: "video/mp4",
      mp3: "audio/mpeg",
      wav: "audio/wav",
      json: "application/json",
    };
    const headers: Record<string, string> = {
      "Content-Type": types[ext || ""] || "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Accept-Ranges": "bytes",
      "Content-Length": String(data.length),
    };
    const range = request.headers.get("range");
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2]))
        return new NextResponse(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${data.length}` },
        });
      const suffix = !match[1];
      const start = suffix
        ? Math.max(0, data.length - Number(match[2]))
        : Number(match[1]);
      const end =
        suffix || !match[2]
          ? data.length - 1
          : Math.min(data.length - 1, Number(match[2]));
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start > end ||
        start >= data.length
      )
        return new NextResponse(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${data.length}` },
        });
      headers["Content-Range"] = `bytes ${start}-${end}/${data.length}`;
      headers["Content-Length"] = String(end - start + 1);
      return new NextResponse(data.subarray(start, end + 1), {
        status: 206,
        headers,
      });
    }
    return new NextResponse(data, { headers });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
