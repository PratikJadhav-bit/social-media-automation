import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { timingSafeEqual } from "node:crypto";
import { createHash } from "node:crypto";
import { sqlite } from "./lib/db";
function equal(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (c, request) => {
        if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD)
          return null;
        const ip = request.headers.get("x-real-ip") || "local";
        const key = `auth:${createHash("sha256").update(ip).digest("hex")}:${Math.floor(Date.now() / 600000)}`;
        const failures = Number(
          (
            sqlite.prepare("SELECT value FROM cache WHERE key=?").get(key) as
              { value: string } | undefined
          )?.value || 0,
        );
        if (failures >= 10) return null;
        const valid =
          equal(String(c.email), process.env.ADMIN_EMAIL) &&
          equal(String(c.password), process.env.ADMIN_PASSWORD);
        if (!valid) {
          sqlite
            .prepare(
              "INSERT INTO cache VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,expires_at=excluded.expires_at",
            )
            .run(key, String(failures + 1), Date.now() + 600000);
          return null;
        }
        return equal(String(c.email), process.env.ADMIN_EMAIL) &&
          equal(String(c.password), process.env.ADMIN_PASSWORD)
          ? {
              id: "local-owner",
              email: process.env.ADMIN_EMAIL,
              name: "Workspace owner",
            }
          : null;
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.tenantId = "local";
      return token;
    },
    session({ session, token }) {
      (session as unknown as { tenantId: string }).tenantId = String(
        token.tenantId,
      );
      return session;
    },
  },
});
