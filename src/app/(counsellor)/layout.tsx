import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CounsellorGate } from "@/components/counsellor-gate";
import { CounsellorShell } from "@/components/counsellor-shell";

export const dynamic = "force-dynamic";

export default async function CounsellorLayout({ children }: { children: React.ReactNode }) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) redirect("/login");

  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await sb.from("profiles").select("role").eq("user_id", user.id).maybeSingle();

  // Not a counsellor yet -> show the secret gate instead of the dashboard.
  if (profile?.role !== "counsellor") {
    return <CounsellorGate />;
  }

  return <CounsellorShell>{children}</CounsellorShell>;
}
