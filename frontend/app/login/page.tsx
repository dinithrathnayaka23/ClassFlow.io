"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, LockKeyhole, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { Brand } from "@/components/Brand";
import { api, User } from "@/lib/api";
import { Notice } from "@/components/ui";

const demos = [
  ["Teacher", "teacher@classflow.com", "Teacher123!"],
  ["Student", "student@classflow.com", "Student123!"],
];

function LoginPage() {
  const router = useRouter();
  const search = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const registered = search.get("registered") === "true";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const user = await api<User>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      router.push(
        search.get("next") || `/${user.role.toLowerCase()}/dashboard`,
      );
      router.refresh();
    } catch (exception) {
      setError(
        exception instanceof Error ? exception.message : "Could not sign in",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[.9fr_1.1fr]">
      <section className="flex min-h-screen flex-col px-6 py-7 sm:px-12">
        <div className="flex items-center justify-between">
          <Brand />
          <Link className="text-sm text-white/45 hover:text-neon" href="/">
            <ArrowLeft className="mr-2 inline" size={15} />
            Home
          </Link>
        </div>
        <div className="mx-auto my-auto w-full max-w-md py-16">
          <div className="mb-8">
            <span className="mb-5 grid h-11 w-11 place-items-center rounded-xl border border-neon/30 bg-neon/10 text-neon">
              <LockKeyhole size={19} />
            </span>
            <h1 className="text-3xl font-black">Welcome back</h1>
            <p className="mt-2 text-sm text-white/45">
              Sign in to continue to your ClassFlow workspace.
            </p>
          </div>
          
          {registered && (
            <div className="mb-6 rounded-lg border border-green-500/30 bg-green-500/10 p-4 flex gap-3">
              <CheckCircle2 size={20} className="text-green-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sm text-green-400">Account created successfully!</p>
                <p className="text-xs text-green-400/70 mt-1">Please sign in with your credentials.</p>
              </div>
            </div>
          )}
          
          <Notice error={error} />
          <form className="space-y-3" onSubmit={submit}>
            <label>
              <span className="label">Email address</span>
              <input
                className="input"
                type="email"
                placeholder="your@email.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              <span className="label">Password</span>
              <div className="relative">
                <input
                  className="input pr-10"
                  type={showPassword ? "text" : "password"}
                  placeholder="Your password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-white/50 hover:text-neon"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            <button className="btn w-full py-3" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"} <ArrowRight size={16} />
            </button>
          </form>
          
          <div className="mt-8 border-t border-line pt-6 space-y-6">
            <div>
              <p className="label mb-3">Demo accounts (for testing)</p>
              <div className="grid grid-cols-2 gap-2">
                {demos.map(([role, mail, pass]) => (
                  <button
                    key={role}
                    className="btn-secondary px-3 py-2 text-xs"
                    onClick={() => {
                      setEmail(mail);
                      setPassword(pass);
                    }}
                  >
                    {role} Demo
                  </button>
                ))}
                <button
                  className="btn-secondary px-3 py-2 text-xs col-span-2"
                  onClick={() => {
                    setEmail("admin@classflow.com");
                    setPassword("Admin123!");
                  }}
                >
                  Admin Demo
                </button>
              </div>
            </div>
            
            <div className="border-t border-line pt-6">
              <p className="text-sm text-white/60">
                Don't have an account?{" "}
                <Link href="/signup" className="font-semibold text-neon hover:text-white transition">
                  Create one
                </Link>
              </p>
            </div>
          </div>
        </div>
      </section>
      <aside className="relative hidden overflow-hidden border-l border-line bg-neon/[.035] p-12 lg:flex lg:flex-col lg:justify-end">
        <div className="absolute left-1/3 top-1/4 h-72 w-72 rounded-full bg-neon/15 blur-[100px]" />
        <div className="relative max-w-xl">
          <p className="text-xs font-bold uppercase tracking-[.3em] text-neon">
            ClassFlow for tuition classes
          </p>
          <p className="mt-6 text-5xl font-black leading-tight tracking-[-.04em]">
            Every lesson, deadline and conversation in the right place.
          </p>
          <p className="mt-6 max-w-lg leading-7 text-white/45">
            Built around the way real tuition teams teach, learn and follow up.
          </p>
        </div>
      </aside>
    </main>
  );
}

export default function LoginRoute() {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-screen place-items-center text-sm text-white/40">
          Loading sign in...
        </main>
      }
    >
      <LoginPage />
    </Suspense>
  );
}
