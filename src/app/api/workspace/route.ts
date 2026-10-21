import { feedHealth } from "@/lib/trends";
import { manualPosting } from "@/lib/delivery";
import { whatsappSetup, notificationState } from "@/lib/whatsapp";
import { readiness } from "@/lib/readiness";
import { configured, providerMode } from "@/lib/configuration";
import { requireSameOrigin, requestOrigin } from "@/lib/request-origin";
import { connectionSetup } from "@/lib/connection-setup";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sqlite, settings, log } from "@/lib/db";
import { tenant, access } from "@/lib/access";
import { createPost, startPost, approve, enqueue, runOnce } from "@/lib/queue";
import { defaults, platforms } from "@/lib/types";
import { scriptSchema } from "@/lib/providers";
import { bestTimes } from "@/lib/analytics";
import { quotaUsage } from "@/lib/quota";
import { saveMetric } from "@/lib/analytics";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function error(e: unknown) {
  const raw = String(e);
  const message =
    e instanceof z.ZodError
      ? `Check ${e.issues[0]?.path.join(" ") || "the form"}: ${e.issues[0]?.message || "a field needs attention"}.`
      : raw.includes("Unauthorized")
        ? "Sign in and submit this action from the website."
        : raw.replace(/^Error: /, "");
  return NextResponse.json(
    { error: message },
    { status: raw.includes("Unauthorized") ? 401 : 400 },
  );
}
export async function GET(req: NextRequest) {
  try {
    const t = await tenant(),
      brandId = req.nextUrl.searchParams.get("brand") || "default";
    await access(brandId);
    const brands = sqlite
      .prepare("SELECT id,name FROM brands WHERE tenant_id=?")
      .all(t);
    const posts = sqlite
      .prepare(
        "SELECT * FROM posts WHERE brand_id=? ORDER BY created_at DESC LIMIT 200",
      )
      .all(brandId) as import("@/lib/types").Post[];
    for (const post of posts) {
      const row = sqlite
        .prepare("SELECT value FROM cache WHERE key=?")
        .get(`editorial:${post.id}`) as { value: string } | undefined;
      if (row) post.editorial = JSON.parse(row.value);
      post.notification = notificationState(post.id);
    }
    return NextResponse.json({
      brandId,
      manualPosting: manualPosting(),
      whatsapp: whatsappSetup(),
      brands,
      readiness: readiness(brandId, requestOrigin(req)),
      publishingEnabled: configured("PUBLISH_MODE") === "live",
      publicMediaURL: configured("PUBLIC_MEDIA_URL") || "",
      connectionSetup: connectionSetup(requestOrigin(req)),
      ideaSources: (
        sqlite
          .prepare(
            "SELECT detail FROM logs WHERE brand_id=? AND event='idea.source' ORDER BY created_at DESC LIMIT 200",
          )
          .all(brandId) as { detail: string }[]
      ).map((row) => JSON.parse(row.detail)),
      settings: settings(brandId),
      feedHealth: feedHealth(settings(brandId).discoveryRegion || "IN"),
      posts,
      connections: sqlite
        .prepare(
          "SELECT id,platform,account_id,mode FROM connections WHERE brand_id=?",
        )
        .all(brandId),
      jobs: sqlite
        .prepare(
          "SELECT * FROM jobs WHERE brand_id=? ORDER BY run_at DESC LIMIT 100",
        )
        .all(brandId),
      logs: sqlite
        .prepare(
          "SELECT * FROM logs WHERE brand_id=? ORDER BY created_at DESC LIMIT 50",
        )
        .all(brandId),
      metrics: sqlite
        .prepare(
          "SELECT m.*,pub.platform,p.title,pub.mode FROM metrics m JOIN publications pub ON pub.id=m.publication_id JOIN posts p ON p.id=pub.post_id WHERE p.brand_id=? ORDER BY day DESC LIMIT 200",
        )
        .all(brandId),
      usage: quotaUsage(brandId),
      comments: sqlite
        .prepare("SELECT * FROM comments WHERE brand_id=?")
        .all(brandId),
      mode: providerMode(),
      engineReady: !!(
        configured("GEMINI_API_KEY") ||
        configured("GROQ_API_KEY") ||
        process.env.ENABLE_OLLAMA === "true"
      ),
    });
  } catch (e) {
    return error(e);
  }
}
const configSchema = z.object({
  discoveryRegion: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  discoveryMode: z.enum(["trending", "niche"]).optional(),
  autoGenerate: z.boolean().optional(),
  voiceExamples: z.string().max(5000).optional(),
  niche: z.string().min(1).max(300),
  tone: z.string().min(1).max(200),
  languages: z.array(z.enum(["English", "Hindi", "Marathi"])).min(1),
  timezone: z.string().refine((s) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: s });
      return true;
    } catch {
      return false;
    }
  }),
  times: z
    .array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/))
    .length(2)
    .refine((a) => a[0] !== a[1]),
  autoApprove: z.boolean(),
  disclaimer: z.string().min(1).max(150),
  color: z.string().regex(/^#[a-f0-9]{6}$/i),
  voice: z.string().max(100),
  dailyLimit: z.number().int().min(1).max(2),
  bannedWords: z.array(z.string().max(100)).max(50),
  paused: z.boolean(),
});
export async function POST(req: NextRequest) {
  try {
    requireSameOrigin(req);
    const body = await req.json();
    const brandId = z.string().parse(body.brandId || "default");
    await access(brandId);
    const { action } = body;
    let processed: number | undefined;
    if (action === "create") {
      const v = z
        .object({
          title: z.string().min(4).max(200),
          format: z.enum(["reel", "carousel", "image"]),
          language: z.enum(["English", "Hindi", "Marathi"]),
        })
        .parse(body);
      createPost(brandId, v.title, v.format, v.language);
    } else if (action === "generate") {
      startPost(brandId, z.string().parse(body.id));
      await runOnce(5, brandId);
    } else if (action === "research")
      enqueue(
        brandId,
        null,
        "research",
        `${brandId}:research:manual:${crypto.randomUUID()}`,
      );
    else if (action === "run") processed = await runOnce(10, brandId);
    else if (action === "importMetrics") {
      const v = z
        .object({
          publicationId: z.string(),
          day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          views: z.number().int().nonnegative(),
          likes: z.number().int().nonnegative(),
          comments: z.number().int().nonnegative(),
          shares: z.number().int().nonnegative(),
          watchSeconds: z.number().int().nonnegative(),
        })
        .parse(body.metrics);
      if (
        !sqlite
          .prepare(
            "SELECT pub.id FROM publications pub JOIN posts p ON p.id=pub.post_id WHERE pub.id=? AND p.brand_id=? AND pub.mode=?",
          )
          .get(v.publicationId, brandId, "live")
      )
        throw Error("Live publication not found in this brand");
      saveMetric(
        v.publicationId,
        v.day,
        v.views,
        v.likes,
        v.comments,
        v.shares,
        v.watchSeconds,
      );
    } else if (action === "notifyReady") {
      const p = sqlite
        .prepare("SELECT * FROM posts WHERE id=? AND brand_id=?")
        .get(z.string().parse(body.id), brandId) as
        import("@/lib/types").Post | undefined;
      if (!p || !["ready", "posted"].includes(p.status))
        throw Error("Finish the package before sending its alert.");
      const revision = JSON.parse(p.checks || "{}").deliveryRevision;
      if (!revision)
        throw Error(
          "Save edits to rebuild this older draft before sending an alert.",
        );
      const state = notificationState(p.id);
      if (state && ["uncertain", "sending"].includes(state.status))
        throw Error(
          "Check WhatsApp first; the previous alert may already have been accepted.",
        );
      const key = `${p.id}:notify:${revision}`;
      enqueue(brandId, p.id, "notify", key, Date.now(), { revision });
      sqlite
        .prepare(
          "UPDATE jobs SET status='pending',attempts=0,run_at=? WHERE idempotency_key=? AND status IN ('blocked','dead')",
        )
        .run(Date.now(), key);
      await runOnce(2, brandId);
    } else if (action === "markPosted") {
      const result = sqlite
        .prepare(
          "UPDATE posts SET status='posted' WHERE id=? AND brand_id=? AND status='ready'",
        )
        .run(z.string().parse(body.id), brandId);
      if (!result.changes)
        throw Error("Only ready packages can be marked as manually posted.");
    } else if (action === "approve")
      approve(
        brandId,
        z.string().parse(body.id),
        body.platforms
          ? z.array(z.enum(platforms)).min(1).max(3).parse(body.platforms)
          : undefined,
      );
    else if (action === "reject") {
      sqlite
        .prepare(
          "UPDATE posts SET status='rejected' WHERE id=? AND brand_id=? AND status IN ('idea','review','ready')",
        )
        .run(z.string().parse(body.id), brandId);
    } else if (action === "edit") {
      const s = scriptSchema.parse(body.script);
      sqlite.transaction(() => {
        const result = sqlite
          .prepare(
            "UPDATE posts SET script=?,checks=NULL,assets=NULL,status='generating' WHERE id=? AND brand_id=? AND status IN ('review','ready')",
          )
          .run(JSON.stringify(s), body.id, brandId);
        if (!result.changes) throw Error("Only review posts are editable");
        enqueue(
          brandId,
          body.id,
          "assets",
          `${body.id}:edit-assets:${crypto.randomUUID()}`,
          Date.now(),
          { revision: true },
        );
      })();
    } else if (action === "settings") {
      const v = configSchema.parse(body.settings),
        existing = settings(brandId);
      const font = z.string().max(80).optional().parse(body.settings.font);
      const hindiVoice = z
          .string()
          .max(100)
          .optional()
          .parse(body.settings.hindiVoice),
        marathiVoice = z
          .string()
          .max(100)
          .optional()
          .parse(body.settings.marathiVoice);
      sqlite
        .prepare("UPDATE brands SET settings=? WHERE id=?")
        .run(
          JSON.stringify({ ...existing, ...v, font, hindiVoice, marathiVoice }),
          brandId,
        );
    } else if (action === "optimize") {
      const suggested = bestTimes(brandId);
      if (!suggested.ready)
        throw Error(
          "Need at least 20 distinct live posts and 5 samples per hour before optimizing",
        );
      sqlite
        .prepare("UPDATE brands SET settings=? WHERE id=?")
        .run(
          JSON.stringify({ ...settings(brandId), times: suggested.times }),
          brandId,
        );
    } else if (action === "brand") {
      const t = await tenant();
      sqlite
        .prepare("INSERT INTO brands VALUES (?,?,?,?)")
        .run(
          crypto.randomUUID(),
          t,
          z.string().min(2).max(80).parse(body.name),
          JSON.stringify(defaults),
        );
    } else if (action === "connectMock") {
      const platform = z.enum(platforms).parse(body.platform);
      sqlite
        .prepare(
          "INSERT INTO connections VALUES (?,?,?,?,?,?) ON CONFLICT(brand_id,platform) DO UPDATE SET mode=excluded.mode,account_id=excluded.account_id,token=NULL",
        )
        .run(
          crypto.randomUUID(),
          brandId,
          platform,
          "Demo account",
          null,
          "mock",
        );
    } else if (action === "disconnect")
      sqlite
        .prepare("DELETE FROM connections WHERE brand_id=? AND platform=?")
        .run(brandId, z.enum(platforms).parse(body.platform));
    else if (action === "retry") {
      const j = sqlite
        .prepare(
          "SELECT * FROM jobs WHERE id=? AND brand_id=? AND status IN ('dead','blocked')",
        )
        .get(body.id, brandId);
      if (!j) throw Error("Paused or failed job not found");
      sqlite
        .prepare(
          "UPDATE jobs SET status='pending',attempts=0,run_at=? WHERE id=? AND brand_id=?",
        )
        .run(Date.now(), body.id, brandId);
    } else if (action === "commentApprove")
      sqlite
        .prepare(
          "UPDATE comments SET status='approved' WHERE id=? AND brand_id=?",
        )
        .run(body.id, brandId);
    else if (action === "commentReject")
      sqlite
        .prepare(
          "UPDATE comments SET status='rejected' WHERE id=? AND brand_id=?",
        )
        .run(body.id, brandId);
    else if (action === "commentEdit")
      sqlite
        .prepare(
          "UPDATE comments SET draft=?,status='pending' WHERE id=? AND brand_id=?",
        )
        .run(z.string().min(1).max(1000).parse(body.draft), body.id, brandId);
    else throw Error("Unknown action");
    log(brandId, `workspace.${action}`, { id: body.id });
    return NextResponse.json({
      ok: true,
      processed,
      postStatus:
        action === "generate"
          ? (
              sqlite
                .prepare("SELECT status FROM posts WHERE id=? AND brand_id=?")
                .get(body.id, brandId) as { status: string } | undefined
            )?.status
          : undefined,
    });
  } catch (e) {
    return error(e);
  }
}
