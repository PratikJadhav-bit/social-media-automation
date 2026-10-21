import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
function key() {
  const k = process.env.TOKEN_ENCRYPTION_KEY;
  if (!k || !/^[a-f0-9]{64}$/i.test(k))
    throw Error("TOKEN_ENCRYPTION_KEY must be 32 random bytes in hex");
  return Buffer.from(k, "hex");
}
export function encrypt(value: unknown) {
  const iv = randomBytes(12),
    c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(JSON.stringify(value)), c.final()]);
  return [iv, c.getAuthTag(), body].map((b) => b.toString("base64")).join(".");
}
export function decrypt<T>(value: string): T {
  const parts = value.split(".");
  if (
    parts.length !== 3 ||
    parts.some((s) => Buffer.from(s, "base64").toString("base64") !== s)
  )
    throw Error("Invalid encrypted token");
  const [iv, tag, body] = parts.map((s) => Buffer.from(s, "base64"));
  const c = createDecipheriv("aes-256-gcm", key(), iv);
  c.setAuthTag(tag);
  return JSON.parse(Buffer.concat([c.update(body), c.final()]).toString());
}
