import { requireSameOrigin } from "@/lib/request-origin";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { access } from "@/lib/access";
import { sqlite, settings } from "@/lib/db";
import { mediaRoot } from "@/lib/media";
export async function POST(req: NextRequest) {
  try {
    requireSameOrigin(req, true);
    const form = await req.formData(),
      brand = String(form.get("brandId") || "default");
    await access(brand);
    if (!/^[a-zA-Z0-9-]+$/.test(brand)) throw Error("Invalid brand");
    const file = form.get("file");
    if (!(file instanceof File) || file.size > 2 * 1024 * 1024)
      throw Error("Choose a PNG/JPEG/WebP logo below 2 MB");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
      throw Error("Unsupported logo type");
    const dir = path.join(mediaRoot(), "logos");
    await mkdir(dir, { recursive: true });
    const relative = `logos/${brand}.png`;
    await sharp(Buffer.from(await file.arrayBuffer()), {
      limitInputPixels: 16000000,
    })
      .resize(300, 300, { fit: "inside" })
      .png()
      .toFile(path.join(mediaRoot(), relative));
    const b = settings(brand);
    sqlite
      .prepare("UPDATE brands SET settings=? WHERE id=?")
      .run(JSON.stringify({ ...b, logoPath: relative }), brand);
    return NextResponse.json({ ok: true, logoPath: relative });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
