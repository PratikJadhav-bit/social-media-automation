import { auth } from "@/auth";
import { sqlite } from "./db";
export async function tenant() {
  if (process.env.NODE_ENV !== "production" && !process.env.ADMIN_EMAIL)
    return "local";
  const s = await auth();
  if (!s) throw Error("Unauthorized");
  return (s as unknown as { tenantId: string }).tenantId;
}
export async function access(brandId: string) {
  const t = await tenant();
  if (
    !sqlite
      .prepare("SELECT id FROM brands WHERE id=? AND tenant_id=?")
      .get(brandId, t)
  )
    throw Error("Unauthorized");
  return t;
}
