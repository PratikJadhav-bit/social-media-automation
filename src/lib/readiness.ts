import { existsSync } from "node:fs";
import ffmpegPath from "ffmpeg-static";
import { configured, providerMode } from "./configuration";
import { connectionSetup } from "./connection-setup";
import { sqlite } from "./db";
import { manualPosting } from "./delivery";
import { whatsappSetup } from "./whatsapp";
export function readiness(brandId: string, origin: string) {
  const connections = sqlite
    .prepare("SELECT platform,mode FROM connections WHERE brand_id=?")
    .all(brandId) as { platform: string; mode: string }[];
  const pulse = sqlite
    .prepare("SELECT expires_at FROM cache WHERE key='worker-heartbeat'")
    .get() as { expires_at: number } | undefined;
  const checks = [
    {
      id: "worker",
      label: "Background worker",
      state: pulse && pulse.expires_at > Date.now() ? "ready" : "setup",
      detail:
        pulse && pulse.expires_at > Date.now()
          ? "Worker is running; trend research, generation and content-ready alerts are processed automatically."
          : "Run npm run worker for unattended processing. Generate and Run pending jobs also work from the dashboard.",
    },
    {
      id: "engine",
      label: "Content engine",
      state:
        providerMode() === "live" &&
        (configured("GEMINI_API_KEY") ||
          configured("GROQ_API_KEY") ||
          process.env.ENABLE_OLLAMA === "true")
          ? "configured"
          : "preview",
      detail:
        providerMode() === "live"
          ? "Connected providers are tried first; unavailable providers fall back to editable templates."
          : "Local template mode. Configure an AI provider for researched drafts.",
    },
    {
      id: "video",
      label: "Video rendering",
      state: ffmpegPath && existsSync(ffmpegPath) ? "ready" : "setup",
      detail:
        ffmpegPath && existsSync(ffmpegPath)
          ? "Local FFmpeg creates playable vertical previews."
          : "Install the bundled encoder or set FFMPEG_PATH. Storyboards remain available if rendering cannot run.",
    },
    {
      id: "publishing",
      label: "Live publishing",
      state: configured("PUBLISH_MODE") === "live" ? "enabled" : "preview",
      detail:
        configured("PUBLISH_MODE") === "live"
          ? "Enabled. Only approved content with live-ready assets and connected accounts is eligible."
          : "Live publishing is off. Enable it in Platform Connections after setup.",
    },
    ...["instagram", "youtube", "facebook"].map((platform) => ({
      id: platform,
      label: platform[0].toUpperCase() + platform.slice(1),
      state:
        connections.find((c) => c.platform === platform)?.mode ||
        (connectionSetup(origin)[platform].ready ? "configured" : "setup"),
      detail:
        connections.find((c) => c.platform === platform)?.mode === "live"
          ? "Account connected. Permissions and token validity are checked during platform requests."
          : "Connect a mock account for testing, or configure a developer app and connect a live account.",
    })),
  ];
  if (manualPosting()) {
    const wa = whatsappSetup();
    return [
      ...checks.slice(0, 3),
      {
        id: "manual",
        label: "Posting workflow",
        state: "ready",
        detail:
          "Content is packaged for download. You post manually; automatic publishing is disabled.",
      },
      {
        id: "whatsapp",
        label: "WhatsApp alerts",
        state: wa.ready ? "configured" : "setup",
        detail: wa.ready
          ? "Configured. API acceptance and delivery on your phone are different; test a ready package."
          : "Open Notifications & AI to configure your sender, recipient and approved content-ready template.",
      },
    ];
  }
  return checks;
}
