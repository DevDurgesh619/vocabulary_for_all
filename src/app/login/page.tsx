"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpenCheck, Loader2, ShieldCheck } from "lucide-react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { getRoleHome } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [counsellorFlow, setCounsellorFlow] = useState(false);

  useEffect(() => {
    setCounsellorFlow(nextParam() === "/counsellor");
  }, []);

  if (!isSupabaseConfigured) {
    return (
      <Shell>
        <Card>
          <CardContent className="space-y-3 pt-5 text-sm">
            <h2 className="text-base font-semibold">Connect Supabase to begin</h2>
            <p className="text-[var(--color-muted-foreground)]">
              Add your project URL and anon key to <code>.env.local</code>:
            </p>
            <pre className="overflow-x-auto rounded-lg bg-[var(--color-muted)] p-3 text-xs">
{`NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...`}
            </pre>
            <p className="text-[var(--color-muted-foreground)]">
              Run the migration in <code>supabase/migrations</code>, then restart the dev server.
            </p>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    setMsg(null);
    const sb = createClient();
    try {
      const next = nextParam();
      if (mode === "signup") {
        const { error } = await sb.auth.signUp({ email, password });
        if (error) throw error;
        // If email confirmation is disabled, a session exists immediately.
        const { data } = await sb.auth.getSession();
        if (data.session) router.push(next ?? (await getRoleHome(sb)));
        else setMsg("Account created. Check your email to confirm, then sign in.");
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push(next ?? (await getRoleHome(sb))); // counsellors -> /counsellor, students -> /dashboard
        router.refresh();
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function signInWithGoogle() {
    setErr(null);
    const sb = createClient();
    const next = nextParam();
    // Carry `next` in a short-lived cookie, NOT in the redirect URL — Supabase
    // rejects redirect URLs that don't exactly match its allowlist.
    if (next) document.cookie = `lexica_next=${encodeURIComponent(next)}; path=/; max-age=300; samesite=lax`;
    const { error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setErr(error.message);
  }

  return (
    <Shell>
      <Card className="animate-in">
        <CardContent className="space-y-4 pt-6">
          {counsellorFlow && (
            <div className="flex items-start gap-2 rounded-lg bg-[var(--color-accent)] p-3 text-xs text-[var(--color-accent-foreground)]">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <span><strong>Counsellor sign-in.</strong> Sign in below first — then you&apos;ll be asked for the counsellor secret.</span>
            </div>
          )}
          <button
            type="button"
            onClick={signInWithGoogle}
            className="flex h-11 w-full items-center justify-center gap-2.5 rounded-[calc(var(--radius)-0.25rem)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-medium transition-colors hover:bg-[var(--color-muted)]"
          >
            <GoogleIcon /> Continue with Google
          </button>
          <div className="flex items-center gap-3 text-xs text-[var(--color-muted-foreground)]">
            <span className="h-px flex-1 bg-[var(--color-border)]" /> or <span className="h-px flex-1 bg-[var(--color-border)]" />
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div className="flex rounded-lg bg-[var(--color-muted)] p-1 text-sm">
              {(["signin", "signup"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`flex-1 rounded-md py-1.5 font-medium transition-colors ${
                    mode === m ? "bg-[var(--color-card)] shadow-sm" : "text-[var(--color-muted-foreground)]"
                  }`}
                >
                  {m === "signin" ? "Sign in" : "Create account"}
                </button>
              ))}
            </div>
            <Field label="Email">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="you@example.com"
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder="••••••••"
              />
            </Field>
            {err && <p className="text-sm text-[var(--color-danger)]">{err}</p>}
            {msg && <p className="text-sm text-[var(--color-success)]">{msg}</p>}
            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <p className="text-center text-xs text-[var(--color-muted-foreground)]">
        Are you a counsellor?{" "}
        <a href="/counsellor" className="font-medium text-[var(--color-primary)] hover:underline">
          Counsellor access →
        </a>
      </p>
      <style>{`.input{width:100%;height:2.75rem;border-radius:calc(var(--radius) - .25rem);border:1px solid var(--color-input);background:var(--color-card);padding:0 .85rem;font-size:.9rem;outline:none}.input:focus{box-shadow:0 0 0 2px var(--color-ring)}`}</style>
    </Shell>
  );
}

// Where to go after login (e.g. /counsellor), read from ?next= without needing Suspense.
function nextParam(): string | null {
  if (typeof window === "undefined") return null;
  const n = new URLSearchParams(window.location.search).get("next");
  return n && n.startsWith("/") ? n : null;
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.27-4.74 3.27-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-5 py-10">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-lg">
          <BookOpenCheck className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Lexica</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Master 5,000 words — learn, test, and track every word.
        </p>
      </div>
      {children}
    </div>
  );
}
