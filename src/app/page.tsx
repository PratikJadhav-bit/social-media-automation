import Dashboard from "@/components/dashboard";
import { tenant } from "@/lib/access";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Page() {
  try {
    await tenant();
  } catch {
    redirect("/login");
  }
  return <Dashboard />;
}
