import { configured } from "@/lib/configuration";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { sqlite } from "./db";
import { decrypt, encrypt } from "./security";
import { mediaRoot } from "./media";
import { reserve } from "./quota";
import type { Platform, Post, Script, Asset } from "./types";
export interface Publisher {
  publish(post: Post, connection: Connection): Promise<string>;
}
export type Connection = {
  id: string;
  platform: Platform;
  account_id: string;
  token: string | null;
  mode: string;
};
type Tokens = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
};
export class MockPublisher implements Publisher {
  async publish(p: Post, c: Connection) {
    return `mock:${c.platform}:${p.id}`;
  }
}
export async function connectionToken(c: Connection) {
  if (!c.token) throw Error("Connect an account first");
  let t = decrypt<Tokens>(c.token);
  if (t.expiresAt && t.expiresAt < Date.now() + 60000) {
    if (c.platform !== "youtube" || !t.refreshToken)
      throw Error("Token expired: reconnect Meta account");
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: configured("GOOGLE_CLIENT_ID")!,
        client_secret: configured("GOOGLE_CLIENT_SECRET")!,
        refresh_token: t.refreshToken,
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw Error("Token refresh failed");
    const j = await r.json();
    t = {
      ...t,
      accessToken: j.access_token,
      expiresAt: Date.now() + j.expires_in * 1000,
    };
    sqlite
      .prepare("UPDATE connections SET token=? WHERE id=?")
      .run(encrypt(t), c.id);
  }
  return t.accessToken;
}
async function api(url: string, init: RequestInit) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(60000) });
  if (!r.ok)
    throw Error(
      `Platform request failed (${r.status}); check permissions and rate limits`,
    );
  return r.json();
}
function content(p: Post) {
  const s = JSON.parse(p.script || "{}") as Script,
    a = JSON.parse(p.assets || "[]") as Asset[];
  if (!s.caption || a.length === 0 || a.some((x) => x.mock))
    throw Error("Live publishing requires complete, non-mock assets");
  return { s, a };
}
function mediaUrl(a: Asset) {
  const base = configured("PUBLIC_MEDIA_URL");
  if (!base?.startsWith("https://"))
    throw Error(
      "Meta needs a public HTTPS media URL; export media manually or configure hosting",
    );
  return `${base.replace(/\/$/, "")}/${a.path.split("/").map(encodeURIComponent).join("/")}`;
}
export class InstagramPublisher implements Publisher {
  async publish(p: Post, c: Connection) {
    const { s, a } = content(p);
    const accessToken = await connectionToken(c);
    const base = `https://graph.facebook.com/${process.env.META_API_VERSION || "v23.0"}`;
    const create = async (fields: Record<string, string>) =>
      api(`${base}/${c.account_id}/media`, {
        method: "POST",
        body: new URLSearchParams({ ...fields, access_token: accessToken }),
      });
    const caption = `${s.caption}\n${s.hashtags.join(" ")}\nAI-assisted content.`;
    let container: { id: string };
    if (p.format === "carousel") {
      const children = [];
      for (const image of a.filter((x) => x.kind === "image")) {
        children.push(
          (
            await create({
              image_url: mediaUrl(image),
              is_carousel_item: "true",
            })
          ).id,
        );
      }
      container = await create({
        media_type: "CAROUSEL",
        children: children.join(","),
        caption,
      });
    } else if (p.format === "reel") {
      const video = a.find((x) => x.kind === "video");
      if (!video || !video.path.endsWith(".mp4"))
        throw Error("Reel requires MP4");
      container = await create({
        media_type: "REELS",
        video_url: mediaUrl(video),
        caption,
        share_to_feed: "true",
      });
    } else
      container = await create({
        image_url: mediaUrl(a.find((x) => x.kind === "image")!),
        caption,
      });
    // Persist container so a crash cannot lose the remote handle.
    sqlite
      .prepare(
        "UPDATE publications SET external_id=?,status=? WHERE post_id=? AND platform=?",
      )
      .run(container.id, "container_created", p.id, "instagram");
    for (let i = 0; i < 12; i++) {
      const j = await api(`${base}/${container.id}?fields=status_code`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (j.status_code === "FINISHED") break;
      if (j.status_code === "ERROR" || j.status_code === "EXPIRED")
        throw Error("Instagram media processing failed");
      if (i === 11)
        throw Error(
          "Instagram processing timed out; reconcile container before retry",
        );
      await new Promise((r) => setTimeout(r, 5000));
    }
    const result = await api(`${base}/${c.account_id}/media_publish`, {
      method: "POST",
      body: new URLSearchParams({
        creation_id: container.id,
        access_token: accessToken,
      }),
    });
    return result.id;
  }
}
export class FacebookPublisher implements Publisher {
  async publish(p: Post, c: Connection) {
    const { s, a } = content(p),
      accessToken = await connectionToken(c),
      base = `https://graph.facebook.com/${process.env.META_API_VERSION || "v23.0"}`,
      caption = `${s.caption}\nAI-assisted content.`;
    if (p.format === "reel") {
      const video = a.find((x) => x.kind === "video");
      if (!video?.path.endsWith(".mp4"))
        throw Error("Facebook Reel requires MP4");
      const started = await api(`${base}/${c.account_id}/video_reels`, {
        method: "POST",
        body: new URLSearchParams({
          upload_phase: "start",
          access_token: accessToken,
        }),
      });
      const upload = new URL(started.upload_url);
      if (
        upload.protocol !== "https:" ||
        upload.hostname !== "rupload.facebook.com"
      )
        throw Error("Unexpected Facebook upload host");
      sqlite
        .prepare(
          "UPDATE publications SET external_id=?,status=? WHERE post_id=? AND platform=?",
        )
        .run(started.video_id, "upload_started", p.id, "facebook");
      await api(upload.toString(), {
        method: "POST",
        headers: {
          Authorization: `OAuth ${accessToken}`,
          file_url: mediaUrl(video),
        },
      });
      await api(`${base}/${c.account_id}/video_reels`, {
        method: "POST",
        body: new URLSearchParams({
          upload_phase: "finish",
          video_id: started.video_id,
          video_state: "PUBLISHED",
          description: caption,
          access_token: accessToken,
        }),
      });
      return started.video_id;
    }
    if (p.format === "carousel") {
      const fields: Record<string, string> = {
        message: caption,
        access_token: accessToken,
      };
      let index = 0;
      for (const image of a.filter(
        (x) => x.kind === "image" && !x.path.includes("thumbnail"),
      )) {
        const photo = await api(`${base}/${c.account_id}/photos`, {
          method: "POST",
          body: new URLSearchParams({
            url: mediaUrl(image),
            published: "false",
            access_token: accessToken,
          }),
        });
        fields[`attached_media[${index++}]`] = JSON.stringify({
          media_fbid: photo.id,
        });
      }
      return (
        await api(`${base}/${c.account_id}/feed`, {
          method: "POST",
          body: new URLSearchParams(fields),
        })
      ).id;
    }
    return (
      await api(`${base}/${c.account_id}/photos`, {
        method: "POST",
        body: new URLSearchParams({
          url: mediaUrl(a.find((x) => x.kind === "image")!),
          caption,
          access_token: accessToken,
        }),
      })
    ).id;
  }
}
export class YouTubePublisher implements Publisher {
  async publish(p: Post, c: Connection) {
    if (p.format !== "reel") throw Error("YouTube requires a video");
    const { s, a } = content(p);
    const video = a.find((x) => x.kind === "video");
    if (!video?.path.endsWith(".mp4"))
      throw Error("YouTube requires rendered MP4");
    reserve(
      "youtube-upload",
      1,
      Number(process.env.YOUTUBE_DAILY_UPLOAD_LIMIT || 2),
    );
    const accessToken = await connectionToken(c);
    const bytes = await readFile(path.join(mediaRoot(), video.path));
    const r = await fetch(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Upload-Content-Type": "video/mp4",
          "X-Upload-Content-Length": String(bytes.length),
        },
        body: JSON.stringify({
          snippet: {
            title: s.seoTitle,
            description: `${s.description}\n${s.caption}\n#Shorts`,
            tags: s.hashtags,
          },
          status: {
            privacyStatus: "private",
            selfDeclaredMadeForKids: false,
            containsSyntheticMedia: true,
          },
        }),
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!r.ok) throw Error(`YouTube session failed (${r.status})`);
    const location = r.headers.get("location");
    if (!location?.startsWith("https://"))
      throw Error("Missing upload session");
    sqlite
      .prepare(
        "UPDATE publications SET external_id=?,status=? WHERE post_id=? AND platform=?",
      )
      .run(location, "upload_started", p.id, "youtube");
    const out = await api(location, {
      method: "PUT",
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(bytes.length),
      },
      body: bytes,
    });
    return out.id;
  }
}
export function publisher(platform: Platform, mode: string): Publisher {
  if (mode === "mock") return new MockPublisher();
  return platform === "instagram"
    ? new InstagramPublisher()
    : platform === "youtube"
      ? new YouTubePublisher()
      : new FacebookPublisher();
}
