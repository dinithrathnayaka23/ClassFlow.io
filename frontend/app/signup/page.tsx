"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, UserPlus, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { Brand } from "@/components/Brand";
import { api } from "@/lib/api";
import { Notice } from "@/components/ui";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("STUDENT");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");

    // Validation
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    if (!email || !fullName) {
      setError("Please fill in all fields");
      return;
    }

    setLoading(true);
    try {
      await api("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          fullName,
          role,
        }),
      });

      // Redirect to login with success message
      router.push("/login?registered=true");
      router.refresh();
    } catch (exception) {
      setError(
        exception instanceof Error ? exception.message : "Could not create account"
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
              <UserPlus size={19} />
            </span>
            <h1 className="text-3xl font-black">Create your account</h1>
            <p className="mt-2 text-sm text-white/45">
              Join ClassFlow as a teacher or student to get started.
            </p>
          </div>

          <Notice error={error} />

          <form className="flex flex-col gap-5" onSubmit={submit}>
            <label>
              <span className="label">Full name</span>
              <input
                className="input"
                type="text"
                placeholder="Your full name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </label>

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
              <span className="label">I am a</span>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => setRole("TEACHER")}
                  className={`px-4 py-3 rounded-lg border-2 font-semibold transition ${
                    role === "TEACHER"
                      ? "border-neon bg-neon/10 text-neon"
                      : "border-line bg-white/5 text-white/60 hover:border-neon/50"
                  }`}
                >
                  Teacher
                </button>
                <button
                  type="button"
                  onClick={() => setRole("STUDENT")}
                  className={`px-4 py-3 rounded-lg border-2 font-semibold transition ${
                    role === "STUDENT"
                      ? "border-neon bg-neon/10 text-neon"
                      : "border-line bg-white/5 text-white/60 hover:border-neon/50"
                  }`}
                >
                  Student
                </button>
              </div>
            </label>

            <label>
              <span className="label">Password</span>
              <div className="relative">
                <input
                  className="input pr-10"
                  type={showPassword ? "text" : "password"}
                  placeholder="At least 8 characters"
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
              <p className="mt-2 text-xs text-white/45">
                Use a strong password with uppercase, lowercase, numbers and symbols.
              </p>
            </label>

            <label>
              <span className="label">Confirm password</span>
              <div className="relative">
                <input
                  className="input pr-10"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Confirm your password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                <button
                  type="button"
                  aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
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
              {loading ? "Creating account..." : "Create account"}{" "}
              <ArrowRight size={16} />
            </button>
          </form>

          <div className="mt-6 border-t border-line pt-6">
            <p className="text-sm text-white/60">
              Already have an account?{" "}
              <Link href="/login" className="font-semibold text-neon hover:text-white transition">
                Sign in here
              </Link>
            </p>
          </div>

          <div className="mt-8 rounded-lg border border-neon/20 bg-neon/5 p-4">
            <div className="flex gap-3">
              <CheckCircle2 size={20} className="text-neon flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sm">Secure by default</p>
                <p className="mt-1 text-xs text-white/50">
                  Your password is encrypted and never stored in plain text.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="hidden flex-col items-center justify-center gap-6 bg-gradient-to-br from-neon/10 to-transparent p-8 lg:flex">
        <div className="space-y-4 text-center">
          <h2 className="text-2xl font-black">Join thousands of educators</h2>
          <p className="text-white/60">
            ClassFlow helps teachers and students stay organized and connected.
          </p>
        </div>

        <div className="space-y-4 w-full max-w-sm">
          {[
            "Role-based access for teachers and students",
            "Create and manage courses effortlessly",
            "Timed quizzes with auto-marking",
            "Direct messaging with your classmates",
            "Forum discussions for collaboration",
          ].map((item) => (
            <div className="flex items-center gap-3" key={item}>
              <CheckCircle2 size={18} className="text-neon flex-shrink-0" />
              <span className="text-sm">{item}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
