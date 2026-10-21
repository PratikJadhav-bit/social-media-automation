import { providerMode } from "./configuration";
import sharp from "sharp";
import type { OverlayOptions } from "sharp";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Asset, Script, BrandSettings, Format } from "./types";
import type { ImageProvider, TTSProvider, VideoProvider } from "./providers";
import { stockAsset } from "./stock";
import { exportAssets } from "./storage";
import ffmpegPath from "ffmpeg-static";
const exec = promisify(execFile);
export const mediaRoot = () =>
  path.resolve(/*turbopackIgnore: true*/ process.env.MEDIA_DIR || "data/media");
const xml = (s: string) =>
  s.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
function wrap(text: string, width: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if ((line + " " + word).length > width && line) {
      lines.push(line);
      line = word;
    } else line += (line ? " " : "") + word;
  }
  if (line) lines.push(line);
  return lines;
}

export class TemplateImages implements ImageProvider {
  async generate(
    id: string,
    s: Script,
    b: BrandSettings,
    f: Format,
    background?: Asset,
  ): Promise<Asset[]> {
    await mkdir(path.join(/*turbopackIgnore: true*/ mediaRoot(), id), {
      recursive: true,
    });
    const height = f === "reel" ? 1920 : 1350;
    const stock =
      background ||
      (providerMode() === "live"
        ? await stockAsset(
            mediaRoot(),
            id,
            process.env.STOCK_QUERY || "India city",
            "image",
          )
        : null);
    const cards =
      f === "carousel"
        ? s.onScreen.slice(0, 5)
        : f === "reel"
          ? s.onScreen.slice(0, 6)
          : [s.onScreen[0]];
    const result: Asset[] = [];
    for (let i = 0; i < cards.length; i++) {
      const lines = wrap(cards[i], 24).slice(0, 8),
        font = xml(b.font || "sans-serif");
      const disclaimer = wrap(b.disclaimer, 65);
      const titleStart = Math.max(370, height * 0.38);
      const svg = `<svg width="1080" height="${height}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${b.color}"/><stop offset="1" stop-color="#15283e"/></linearGradient></defs><rect width="1080" height="${height}" fill="url(#g)" opacity="${stock ? ".88" : "1"}"/><circle cx="1050" cy="320" r="420" fill="white" opacity=".06"/><text x="85" y="170" fill="#ddd8ff" font-size="30" font-family="${font}">${xml((b.brandName || "CREATOR CHANNEL").toUpperCase())}</text>${lines.map((line, n) => `<text x="85" y="${titleStart + n * 82}" fill="white" font-family="${font}" font-weight="bold" font-size="64">${xml(line)}</text>`).join("")}<text x="85" y="${height - 230}" fill="white" font-size="32" font-family="${font}">Save this. Share awareness.</text>${disclaimer.map((line, n) => `<text x="85" y="${height - 130 + n * 30}" fill="#ddd8ff" font-size="23" font-family="${font}">${xml(line)}</text>`).join("")}</svg>`;
      const base = stock
        ? sharp(
            await readFile(
              path.join(/*turbopackIgnore: true*/ mediaRoot(), stock.path),
            ),
          ).resize(1080, height, { fit: "cover" })
        : sharp({
            create: { width: 1080, height, channels: 4, background: b.color },
          });
      const layers: OverlayOptions[] = [{ input: Buffer.from(svg) }];
      if (b.logoPath && /^logos\/[a-zA-Z0-9-]+\.png$/.test(b.logoPath)) {
        const logo = await sharp(
          await readFile(
            path.join(/*turbopackIgnore: true*/ mediaRoot(), b.logoPath),
          ),
        )
          .resize(110, 110, { fit: "inside" })
          .png()
          .toBuffer();
        layers.push({ input: logo, top: 65, left: 870 });
      }
      const relative = `${id}/card-${i}.jpg`;
      await base
        .composite(layers)
        .jpeg({ quality: 90 })
        .toFile(path.join(/*turbopackIgnore: true*/ mediaRoot(), relative));
      result.push({
        path: relative,
        kind: "image",
        license: `Original template; ${stock?.license || "no stock"}`,
        source: stock?.source || "local template",
        mock: providerMode() !== "live",
      });
    }
    return result;
  }
}
export class LocalStableDiffusion implements ImageProvider {
  async generate(id: string, s: Script, b: BrandSettings, f: Format) {
    const url = new URL(
      process.env.STABLE_DIFFUSION_URL || "http://127.0.0.1:7860",
    );
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
      throw Error("Stable Diffusion must run locally");
    url.pathname = "/sdapi/v1/txt2img";
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: `Editorial background for ${b.niche}, subtle textures, no text, no letters, no logos`,
        negative_prompt: "text, letters, watermark, logos",
        width: 512,
        height: 768,
        steps: 20,
      }),
      signal: AbortSignal.timeout(180000),
    });
    if (!r.ok) throw Error(`Local Stable Diffusion failed (${r.status})`);
    const image = (await r.json()).images?.[0];
    if (typeof image !== "string" || image.length > 30 * 1024 * 1024)
      throw Error("Invalid local generated image");
    await mkdir(path.join(mediaRoot(), id), { recursive: true });
    const relative = `${id}/ai-background.png`;
    await sharp(Buffer.from(image, "base64"))
      .png()
      .toFile(path.join(mediaRoot(), relative));
    return new TemplateImages().generate(id, s, b, f, {
      path: relative,
      kind: "image",
      license: "Local AI-generated background; verify model license",
      source: "local Stable Diffusion",
      mock: false,
    });
  }
}
export class MockTTS implements TTSProvider {
  async synthesize(
    id: string,
    _text = "",
    _voice = "",
    duration = 30,
  ): Promise<Asset> {
    await mkdir(path.join(/*turbopackIgnore: true*/ mediaRoot(), id), {
      recursive: true,
    });
    const samples = 24000 * Math.max(15, Math.min(45, duration)),
      buf = Buffer.alloc(44 + samples * 2);
    buf.write("RIFF");
    buf.writeUInt32LE(buf.length - 8, 4);
    buf.write("WAVEfmt ", 8);
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(1, 22);
    buf.writeUInt32LE(24000, 24);
    buf.writeUInt32LE(48000, 28);
    buf.writeUInt16LE(2, 32);
    buf.writeUInt16LE(16, 34);
    buf.write("data", 36);
    buf.writeUInt32LE(samples * 2, 40);
    const relative = `${id}/voice.wav`;
    await writeFile(
      path.join(/*turbopackIgnore: true*/ mediaRoot(), relative),
      buf,
    );
    return {
      path: relative,
      kind: "audio",
      license: "Original mock silence",
      source: "mock",
      mock: true,
    };
  }
}
export class EdgeTTS implements TTSProvider {
  async synthesize(id: string, text: string, voice: string): Promise<Asset> {
    const relative = `${id}/voice.mp3`;
    await exec(
      "python",
      [
        "scripts/media.py",
        "tts",
        "--text",
        text,
        "--voice",
        voice,
        "--output",
        path.join(/*turbopackIgnore: true*/ mediaRoot(), relative),
      ],
      { timeout: 180000 },
    );
    return {
      path: relative,
      kind: "audio",
      license: "Generated speech; review service terms",
      source: "edge-tts / Piper fallback",
      mock: false,
    };
  }
}
export class FFmpegVideo implements VideoProvider {
  async assemble(
    id: string,
    images: Asset[],
    audio: Asset,
    s: Script,
  ): Promise<Asset> {
    const relative = `${id}/video.mp4`,
      clip = images.find((a) => a.kind === "video");
    await exec(
      "python",
      [
        "scripts/media.py",
        "video",
        "--image",
        path.join(/*turbopackIgnore: true*/ mediaRoot(), images[0].path),
        "--audio",
        path.join(/*turbopackIgnore: true*/ mediaRoot(), audio.path),
        "--text",
        `${s.hook} ${s.body} ${s.cta}`,
        "--output",
        path.join(/*turbopackIgnore: true*/ mediaRoot(), relative),
        ...(audio.mock ? ["--mock"] : []),
        ...(clip
          ? [
              "--clip",
              path.join(/*turbopackIgnore: true*/ mediaRoot(), clip.path),
            ]
          : []),
      ],
      { timeout: 300000 },
    );
    const { stdout } = await exec(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "json",
        path.join(/*turbopackIgnore: true*/ mediaRoot(), relative),
      ],
      { timeout: 30000 },
    );
    const duration = Number(JSON.parse(stdout).format.duration);
    if (duration < 15 || duration > 45.5)
      throw Error("Rendered video must be 15–45 seconds");
    return {
      path: relative,
      kind: "video",
      license: `Original template + generated voice; ${clip?.license || "no stock or music"}`,
      source: clip?.source || "ffmpeg",
      mock: audio.mock,
    };
  }
}
export class MockVideo implements VideoProvider {
  async assemble(
    id: string,
    _images: Asset[],
    _audio: Asset,
    s: Script,
  ): Promise<Asset> {
    const relative = `${id}/video-preview.json`;
    await writeFile(
      path.join(/*turbopackIgnore: true*/ mediaRoot(), relative),
      JSON.stringify({
        mock: true,
        duration: s.duration,
        message:
          "The playable render could not finish. This storyboard preserves the draft for another rendering attempt.",
      }),
    );
    return {
      path: relative,
      kind: "video",
      license: "Original mock storyboard",
      source: "mock storyboard",
      mock: true,
    };
  }
}
export class PreviewVideo implements VideoProvider {
  async assemble(
    id: string,
    images: Asset[],
    audio: Asset,
    s: Script,
  ): Promise<Asset> {
    const directory = path.join(/*turbopackIgnore: true*/ mediaRoot(), id);
    const cards = images.filter((asset) => asset.kind === "image").slice(0, 6);
    if (!cards.length)
      throw Error("Generate images before assembling a video.");
    const beat = s.duration / cards.length;
    const list =
      cards
        .map((card) => `file '${path.basename(card.path)}'\nduration ${beat}`)
        .join("\n") + `\nfile '${path.basename(cards.at(-1)!.path)}'\n`;
    await writeFile(path.join(directory, "storyboard.txt"), list);
    const relative = `${id}/video.mp4`;
    await exec(
      process.env.FFMPEG_PATH || ffmpegPath || "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        path.join(directory, "storyboard.txt"),
        "-i",
        path.join(/*turbopackIgnore: true*/ mediaRoot(), audio.path),
        "-t",
        String(s.duration),
        "-vf",
        audio.mock || images.some((a) => a.mock) || s.generationMode === "mock"
          ? "fps=24,scale=720:1280,format=yuv420p"
          : "fps=24,scale=1080:1920,format=yuv420p",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "27",
        "-c:a",
        "aac",
        "-af",
        "apad",
        "-shortest",
        "-movflags",
        "+faststart",
        path.join(/*turbopackIgnore: true*/ mediaRoot(), relative),
      ],
      { timeout: 180000, windowsHide: true, maxBuffer: 1024 * 1024 },
    );
    return {
      path: relative,
      kind: "video",
      license: "Original template and preview audio; no music",
      source: audio.mock
        ? "Playable preview · silent audio"
        : "Playable preview · generated voice",
      mock:
        audio.mock ||
        images.some((asset) => asset.mock) ||
        s.generationMode === "mock",
    };
  }
}
export async function assets(
  id: string,
  s: Script,
  b: BrandSettings,
  f: Format,
  language = "English",
) {
  const provider =
    providerMode() === "live" &&
    process.env.IMAGE_PROVIDER === "stable-diffusion"
      ? new LocalStableDiffusion()
      : new TemplateImages();
  const images = await provider.generate(id, s, b, f);
  let all = images;
  if (f === "reel") {
    let voice: Asset;
    try {
      voice =
        providerMode() === "live"
          ? await new EdgeTTS().synthesize(
              id,
              `${s.hook} ${s.body} ${s.cta}`,
              language === "Hindi"
                ? b.hindiVoice || "hi-IN-SwaraNeural"
                : language === "Marathi"
                  ? b.marathiVoice || "mr-IN-AarohiNeural"
                  : b.voice,
            )
          : await new MockTTS().synthesize(id, "", "", s.duration);
    } catch {
      voice = await new MockTTS().synthesize(id, "", "", s.duration);
    }
    const clip =
      providerMode() === "live"
        ? await stockAsset(
            mediaRoot(),
            id,
            process.env.STOCK_QUERY || "India city",
            "video",
          )
        : null;
    const video =
      process.env.RENDER_VIDEO === "true"
        ? await new FFmpegVideo()
            .assemble(id, clip ? [...images, clip] : images, voice, s)
            .catch(() => new PreviewVideo().assemble(id, images, voice, s))
        : await new PreviewVideo()
            .assemble(id, images, voice, s)
            .catch((error: unknown) => {
              console.warn('Video rendering fell back to a storyboard:', error instanceof Error ? error.message.slice(0, 500) : 'Unknown encoder failure');
              return new MockVideo().assemble(id, images, voice, s);
            });
    const thumbnail = `${id}/thumbnail.png`;
    await sharp(
      await readFile(
        path.join(/*turbopackIgnore: true*/ mediaRoot(), images[0].path),
      ),
    )
      .resize(1280, 720, { fit: "contain", background: b.color })
      .png()
      .toFile(path.join(/*turbopackIgnore: true*/ mediaRoot(), thumbnail));
    all = [
      ...images,
      voice,
      video,
      { ...images[0], path: thumbnail },
      ...(clip ? [clip] : []),
    ];
  }
  if (s.generationMode === "mock")
    all = all.map((asset) => ({ ...asset, mock: true }));
  await exportAssets(all, mediaRoot());
  return all;
}
export async function mediaFile(relative: string) {
  const root = mediaRoot(),
    resolved = path.resolve(root, relative);
  if (!resolved.startsWith(root + path.sep)) throw Error("Invalid media path");
  return readFile(/*turbopackIgnore: true*/ resolved);
}
