import { configured } from "./configuration";
import { sqlite } from "./db";
import type { Post, Script, Asset } from "./types";
export type NotificationState = {
  status: string;
  detail: string;
  revision: string;
  updatedAt: number;
  messageId?: string;
};
export function notificationState(id: string): NotificationState | null {
  const row = sqlite
    .prepare("SELECT value FROM cache WHERE key=?")
    .get(`notification:${id}`) as { value: string } | undefined;
  return row ? JSON.parse(row.value) : null;
}
export function whatsappSetup() {
  const missing = [
    "WHATSAPP_ACCESS_TOKEN",
    "WHATSAPP_PHONE_NUMBER_ID",
    "WHATSAPP_RECIPIENT",
    "WHATSAPP_TEMPLATE_NAME",
    "WHATSAPP_TEMPLATE_LANGUAGE",
    "WHATSAPP_GRAPH_VERSION",
  ].filter((k) => !configured(k));
  for (const [name, pattern] of [
    ["WHATSAPP_PHONE_NUMBER_ID", /^\d{5,30}$/],
    ["WHATSAPP_RECIPIENT", /^[1-9]\d{7,14}$/],
    ["WHATSAPP_GRAPH_VERSION", /^v\d{1,3}\.\d{1,2}$/],
    ["WHATSAPP_TEMPLATE_NAME", /^[a-z0-9_]{1,100}$/],
    ["WHATSAPP_TEMPLATE_LANGUAGE", /^[a-z]{2,3}(?:_[A-Z]{2})?$/],
  ] as [string, RegExp][])
    if (configured(name) && !pattern.test(configured(name)!))
      missing.push(name);
  const enabled = configured("WHATSAPP_ENABLED") === "true";
  return {
    enabled,
    ready: enabled && !missing.length,
    missing,
    hasWorkspaceURL: !!configured("WHATSAPP_WORKSPACE_URL"),
  };
}
function store(id: string, state: NotificationState) {
  sqlite
    .prepare(
      "INSERT INTO cache VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,expires_at=excluded.expires_at",
    )
    .run(`notification:${id}`, JSON.stringify(state), Number.MAX_SAFE_INTEGER);
}
export async function notifyReady(post: Post, revision: string) {
  const previous = notificationState(post.id);
  if (previous?.revision === revision && previous.status === "accepted") return;
  if (
    previous?.revision === revision &&
    ["sending", "uncertain"].includes(previous.status)
  )
    throw Error(
      "WhatsApp result uncertain: check WhatsApp before retrying to avoid duplicate alerts.",
    );
  const setup = whatsappSetup();
  const state = (status: string, detail: string, messageId?: string) =>
    store(post.id, {
      status,
      detail,
      revision,
      updatedAt: Date.now(),
      ...(messageId ? { messageId } : {}),
    });
  if (!setup.ready) {
    state(
      "setup",
      "Content is saved. Configure and enable WhatsApp alerts in Notifications & AI.",
    );
    throw Error("WhatsApp setup required");
  }
  const s = JSON.parse(post.script!) as Script;
  const a = JSON.parse(post.assets || "[]") as Asset[];
  const preview = s.generationMode === "mock" || a.some((x) => x.mock);
  const summary = preview
    ? "Preview package ready for review; template media may need finishing before you post."
    : "Video and posting copy ready for your final review and manual posting.";
  const base = configured("WHATSAPP_WORKSPACE_URL");
  const location = base
    ? `${base.replace(/\/$/, "")}/?brand=${encodeURIComponent(post.brand_id)}&post=${encodeURIComponent(post.id)}`
    : "Open Autopilot on your computer; this local website is not accessible on your phone.";
  state("sending", "Submitting alert to WhatsApp.");
  let response: Response;
  try {
    response = await fetch(
      `https://graph.facebook.com/${configured("WHATSAPP_GRAPH_VERSION")}/${configured("WHATSAPP_PHONE_NUMBER_ID")}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${configured("WHATSAPP_ACCESS_TOKEN")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: configured("WHATSAPP_RECIPIENT"),
          type: "template",
          template: {
            name: configured("WHATSAPP_TEMPLATE_NAME"),
            language: { code: configured("WHATSAPP_TEMPLATE_LANGUAGE") },
            components: [
              {
                type: "body",
                parameters: [post.title.slice(0, 200), summary, location].map(
                  (text) => ({ type: "text", text }),
                ),
              },
            ],
          },
        }),
        signal: AbortSignal.timeout(15000),
      },
    );
  } catch {
    state(
      "uncertain",
      "Connection interrupted. Check WhatsApp before sending another alert.",
    );
    throw Error(
      "WhatsApp result uncertain: check WhatsApp before retrying to avoid duplicate alerts.",
    );
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail =
      response.status === 429
        ? "WhatsApp rate limit. The worker will retry."
        : `WhatsApp rejected the alert (HTTP ${response.status}${body?.error?.code ? `, code ${body.error.code}` : ""}). Check recipient access, token and approved template.`;
    state(response.status === 429 ? "retrying" : "blocked", detail);
    throw Error(
      response.status === 429
        ? "WhatsApp rate limit"
        : `WhatsApp configuration rejected: ${detail}`,
    );
  }
  const id = body?.messages?.[0]?.id;
  if (!id) {
    state(
      "uncertain",
      "No message ID returned. Check WhatsApp before retrying.",
    );
    throw Error(
      "WhatsApp result uncertain: check WhatsApp before retrying to avoid duplicate alerts.",
    );
  }
  state(
    "accepted",
    "WhatsApp accepted the alert. Delivery to your phone is not yet confirmed.",
    id,
  );
}
