"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, KeyRound, MailCheck } from "lucide-react";
import { Brand } from "@/components/Brand";
import { api } from "@/lib/api";
import { Notice } from "@/components/ui";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  // Quoted back from the API rather than written into this page, so the lifetime the user
  // is told is always the one the server actually enforces.
  const [expiresInMinutes, setExpiresInMinutes] = useState(0);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");

    const trimmedEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("Please enter a valid email address");
      return;
    }

    setLoading(true);
    try {
      const result = await api<{ message: string; expiresInMinutes: number }>(
        "/auth/forgot-password",
        { method: "POST", body: JSON.stringify({ email: trimmedEmail }) },
      );
      setExpiresInMinutes(result.expiresInMinutes);
      // The API answers the same way whether or not the address is registered, so this
      // screen must not claim the mail was sent to an account that exists. Saying "if"
      // is what keeps the page from becoming a way to find out who has one.
      setSent(true);
    } catch (exception) {
      setError(
        exception instanceof Error
          ? exception.message
          : "Could not send the reset link",
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
          {sent ? (
            <>
              <span className="mb-5 grid h-11 w-11 place-items-center rounded-xl border border-neon/30 bg-neon/10 text-neon">
                <MailCheck size={19} />
              </span>
              <h1 className="text-3xl font-black">Check your inbox</h1>
              <p className="mt-3 text-sm leading-6 text-white/45">
                If <span className="text-white/70">{email.trim()}</span> has a
                ClassFlow account, we have sent it a link to choose a new
                password. The link works only once
                {expiresInMinutes > 0
                  ? `, and expires in ${expiresInMinutes} minutes.`
                  : "."}
              </p>
              <p className="mt-4 text-sm leading-6 text-white/45">
                Nothing arrived? Check the spam folder, then{" "}
                <button
                  type="button"
                  className="font-semibold text-neon hover:text-white transition"
                  onClick={() => setSent(false)}
                >
                  try another address
                </button>
                .
              </p>
              <Link
                href="/login"
                className="btn mt-8 w-full py-3"
              >
                Back to sign in <ArrowRight size={16} />
              </Link>
            </>
          ) : (
            <>
              <div className="mb-8">
                <span className="mb-5 grid h-11 w-11 place-items-center rounded-xl border border-neon/30 bg-neon/10 text-neon">
                  <KeyRound size={19} />
                </span>
                <h1 className="text-3xl font-black">Forgot your password?</h1>
                <p className="mt-2 text-sm leading-6 text-white/45">
                  Enter the email address you signed up with and we will send
                  you a link to choose a new one.
                </p>
              </div>

              <Notice error={error} />
              <form className="flex flex-col gap-5" onSubmit={submit}>
                <label>
                  <span className="label">Email address</span>
                  <input
                    className="input"
                    type="email"
                    placeholder="your@email.com"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                <button className="btn w-full py-3" disabled={loading}>
                  {loading ? "Sending..." : "Send reset link"}{" "}
                  <ArrowRight size={16} />
                </button>
              </form>

              <div className="mt-8 border-t border-line pt-6">
                <p className="text-sm text-white/60">
                  Remembered it?{" "}
                  <Link
                    href="/login"
                    className="font-semibold text-neon hover:text-white transition"
                  >
                    Sign in
                  </Link>
                </p>
                <p className="mt-3 text-xs leading-5 text-white/35">
                  Administrator accounts are not recovered by email. If you are
                  an admin and cannot sign in, ask whoever runs this deployment
                  to rotate the password.
                </p>
              </div>
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
            A forgotten password should never cost you a lesson.
          </p>
          <p className="mt-6 max-w-lg leading-7 text-white/45">
            Reset links are single use and expire quickly, so getting back in
            never leaves a way in behind it.
          </p>
        </div>
      </aside>
    </main>
  );
}
