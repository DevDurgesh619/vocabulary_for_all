import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";

// Authed, per-user data — never prerender at build time.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Guard at the layout level too (middleware also redirects).
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const sb = await createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) redirect("/login");
  }
  return <AppShell>{children}</AppShell>;
}
