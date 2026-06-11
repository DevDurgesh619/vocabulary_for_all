import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// OAuth (Google) redirect target. The redirect URL stays clean (just /auth/callback)
// so it matches Supabase's allowlist; the post-login destination is carried in the
// short-lived `lexica_next` cookie (set before sign-in). Falls back to role-based routing.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  const queryNext = searchParams.get("next");
  const cookieNext = request.cookies.get("lexica_next")?.value;
  const decoded = cookieNext ? safeDecode(cookieNext) : null;
  const next = (queryNext && queryNext.startsWith("/") && queryNext) || (decoded && decoded.startsWith("/") && decoded) || null;

  let dest = "/login?error=oauth";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      dest = next || "/dashboard";
      if (!next) {
        const { data: auth } = await supabase.auth.getUser();
        if (auth.user) {
          const { data } = await supabase.from("profiles").select("role").eq("user_id", auth.user.id).maybeSingle();
          if (data?.role === "counsellor") dest = "/counsellor";
        }
      }
    }
  }

  const res = NextResponse.redirect(`${origin}${dest}`);
  res.cookies.delete("lexica_next");
  return res;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
