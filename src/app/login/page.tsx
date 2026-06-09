"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpenCheck, Loader2 } from "lucide-react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
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
      if (mode === "signup") {
        const { error } = await sb.auth.signUp({ email, password });
        if (error) throw error;
        // If email confirmation is disabled, a session exists immediately.
        const { data } = await sb.auth.getSession();
        if (data.session) router.push("/dashboard");
        else setMsg("Account created. Check your email to confirm, then sign in.");
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/dashboard");
        router.refresh();
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Shell>
      <Card className="animate-in">
        <CardContent className="pt-6">
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
      <style>{`.input{width:100%;height:2.75rem;border-radius:calc(var(--radius) - .25rem);border:1px solid var(--color-input);background:var(--color-card);padding:0 .85rem;font-size:.9rem;outline:none}.input:focus{box-shadow:0 0 0 2px var(--color-ring)}`}</style>
    </Shell>
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
