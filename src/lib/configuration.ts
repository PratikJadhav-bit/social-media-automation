import { sqlite } from "./db";
import { decrypt, encrypt } from "./security";
export const credentialNames = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "META_CLIENT_ID",
  "META_CLIENT_SECRET",
  "GEMINI_API_KEY",
  "GROQ_API_KEY",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_RECIPIENT",
  "WHATSAPP_TEMPLATE_NAME",
  "WHATSAPP_TEMPLATE_LANGUAGE",
  "WHATSAPP_GRAPH_VERSION",
  "WHATSAPP_WORKSPACE_URL",
] as const;
export type CredentialName = (typeof credentialNames)[number];
export function configured(name: string): string | undefined {
  if (name === "WHATSAPP_ENABLED") {
    const row = sqlite
      .prepare(
        "SELECT value FROM cache WHERE key='configuration:whatsapp-enabled'",
      )
      .get() as { value: string } | undefined;
    if (row) return JSON.parse(row.value);
  }
  if (name === "PUBLIC_MEDIA_URL") {
    const row = sqlite
      .prepare(
        "SELECT value FROM cache WHERE key='configuration:public-media-url'",
      )
      .get() as { value: string } | undefined;
    if (row) return JSON.parse(row.value);
  }
  if ((credentialNames as readonly string[]).includes(name)) {
    const row = sqlite
      .prepare("SELECT value FROM cache WHERE key=?")
      .get(`credential:${name}`) as { value: string } | undefined;
    if (row)
      try {
        return decrypt<{ value: string }>(JSON.parse(row.value)).value;
      } catch {
        /* Keep env fallback available if a key was changed. */
      }
  }
  if (name === "PROVIDER_MODE" || name === "PUBLISH_MODE") {
    const row = sqlite
      .prepare(
        `SELECT value FROM cache WHERE key='configuration:${name === "PROVIDER_MODE" ? "provider-mode" : "publish-mode"}'`,
      )
      .get() as { value: string } | undefined;
    if (row) return JSON.parse(row.value);
  }
  return process.env[name];
}
export function saveCredential(name: CredentialName, value: string) {
  sqlite
    .prepare(
      "INSERT INTO cache VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,expires_at=excluded.expires_at",
    )
    .run(
      `credential:${name}`,
      JSON.stringify(encrypt({ value })),
      Number.MAX_SAFE_INTEGER,
    );
}
export function providerMode() {
  return configured("PROVIDER_MODE") || "mock";
}
