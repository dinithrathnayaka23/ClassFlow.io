"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  TriangleAlert,
} from "lucide-react";
import { Brand } from "@/components/Brand";
import { api } from "@/lib/api";
import { Notice } from "@/components/ui";

type TokenCheck = { valid: boolean; email: string; fullName: string };

function ResetPasswordPage() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";

  const [account, setAccount] = useState<TokenCheck | null>(null);
  // Separate from `error`: a dead link is a terminal state that replaces the form,
  // whereas a rejected password is something the person can fix and try again.
  const [linkError, setLinkError] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  // The link is checked before the form renders, so an expired or already-used one says so
  // now rather than after the person has chosen and typed a new password twice.
  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setLinkError(
        "This reset link is missing its token. Open the link from your email exactly as it was sent, or request a new one.",
      );
      setChecking(false);
      return;
    }
    (async () => {
      try {
        const check = await api<TokenCheck>(
          `/auth/reset-password?token=${encodeURIComponent(token)}`,
        );
        if (!cancelled) setAccount(check);
      } catch (exception) {
        if (!cancelled) {
          setLinkError(
            exception instanceof Error
              ? exception.message
              : "This reset link is no longer valid.",
          );
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password.length > 72) {
      setError("Password must be 72 characters or fewer");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      await api("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      setDone(true);
    } catch (exception) {
      setError(
        exception instanceof Error
          ? exception.message
          : "Could not reset your password",
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
          <Link className="text-sm text-white/45 hover:text-neon" href="/login">
            <ArrowLeft className="mr-2 inline" size={15} />
            Sign in
          </Link>
        </div>

        <div className="mx-auto my-auto w-full max-w-md py-16">
          {checking && (
            <p className="text-sm text-white/40">Checking your reset link...</p>
          )}

          {!checking && linkError && (
            <>
              <span className="mb-5 grid h-11 w-11 place-items-center rounded-xl border border-red-400/30 bg-red-400/10 text-red-300">
                <TriangleAlert size={19} />
              </span>
              <h1 className="text-3xl font-black">This link has expired</h1>
              <p className="mt-3 text-sm leading-6 text-white/45">{linkError}</p>
              <Link
                href="/forgot-password"
                className="btn mt-8 w-full py-3"
              >
                Request a new link <ArrowRight size={16} />
              </Link>
              <p className="mt-6 text-sm text-white/60">
                Remembered your password?{" "}
                <Link
                  href="/login"
                  className="font-semibold text-neon hover:text-white transition"
                >
                  Sign in
                </Link>
              </p>
            </>
          )}

          {!checking && !linkError && done && (
            <>
              <span className="mb-5 grid h-11 w-11 place-items-center rounded-xl border border-neon/30 bg-neon/10 text-neon">
                <CheckCircle2 size={19} />
              </span>
              <h1 className="text-3xl font-black">Password changed</h1>
              <p className="mt-3 text-sm leading-6 text-white/45">
                You have been signed out on every device, and this link will not
                work again. Sign in with your new password to carry on.
              </p>
              <button
                className="btn mt-8 w-full py-3"
                onClick={() => {
                  router.push("/login");
                  router.refresh();
                }}
              >
                Go to sign in <ArrowRight size={16} />
              </button>
            </>
          )}

          {!checking && !linkError && !done && account && (
            <>
              <div className="mb-8">
                <span className="mb-5 grid h-11 w-11 place-items-center rounded-xl border border-neon/30 bg-neon/10 text-neon">
                  <LockKeyhole size={19} />
                </span>
                <h1 className="text-3xl font-black">Choose a new password</h1>
                <p className="mt-2 text-sm leading-6 text-white/45">
                  For{" "}
                  <span className="text-white/70">{account.email}</span>. Once
                  you save it, every device signed in to this account is signed
                  out.
                </p>
              </div>

              <Notice error={error} />
              <form className="flex flex-col gap-5" onSubmit={submit}>
                {/*
                  The address is rendered into a hidden field so a password manager knows
                  which account it is being asked to update, rather than offering to save a
                  bare password against no login.
                */}
                <input
                  type="email"
                  hidden
                  readOnly
                  autoComplete="username"
                  value={account.email}
                />
                <label>
                  <span className="label">New password</span>
                  <div className="relative">
                    <input
                      className="input pr-10"
                      type={showPassword ? "text" : "password"}
                      placeholder="At least 8 characters"
                      autoComplete="new-password"
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
                <label>
                  <span className="label">Confirm new password</span>
                  <div className="relative">
                    <input
                      className="input pr-10"
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="Type it again"
                      autoComplete="new-password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      aria-label={
                        showConfirmPassword ? "Hide password" : "Show password"
                      }
                      onClick={() => setShowConfirmPassword((s) => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-white/50 hover:text-neon"
                    >
                      {showConfirmPassword ? (
                        <EyeOff size={18} />
                      ) : (
                        <Eye size={18} />
                      )}
                    </button>
                  </div>
                </label>
                <button className="btn w-full py-3" disabled={loading}>
                  {loading ? "Saving..." : "Save new password"}{" "}
                  <ArrowRight size={16} />
                </button>
              </form>
            </>
          )}
        </div>
      </section>

      <aside className="relative hidden overflow-hidden border-l border-line bg-neon/[.035] p-12 lg:flex lg:flex-col lg:justify-end">
        <div className="absolute left-1/3 top-1/4 h-72 w-72 rounded-full bg-neon/15 blur-[100px]" />
        <div className="relative max-w-xl">
          <p className="text-xs font-bold uppercase tracking-[.3em] text-neon">
            Account recovery
          </p>
          <p className="mt-6 text-5xl font-black leading-tight tracking-[-.04em]">
            One link, one use, then straight back to teaching.
          </p>
          <p className="mt-6 max-w-lg leading-7 text-white/45">
            Saving a new password signs out every session on the account, so a
            reset closes the door behind it.
          </p>
        </div>
      </aside>
    </main>
  );
}

export default function ResetPasswordRoute() {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-screen place-items-center text-sm text-white/40">
          Loading...
        </main>
      }
    >
      <ResetPasswordPage />
    </Suspense>
  );
}
