import Link from "next/link";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Layers3,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Brand } from "@/components/Brand";

const features = [
  {
    icon: Layers3,
    title: "One learning workspace",
    text: "Courses, notes, live links, assignments and timed quizzes stay connected.",
  },
  {
    icon: MessageSquareText,
    title: "Keep the class talking",
    text: "Persisted direct chat and course forums support learning outside class.",
  },
  {
    icon: Bot,
    title: "Helpful by design",
    text: "A built-in assistant answers platform questions without slowing anyone down.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <Brand />
        <div className="flex items-center gap-3">
          <Link className="btn-secondary" href="/login">
            Sign in
          </Link>
          <Link className="btn hidden sm:inline-flex" href="/login">
            Open ClassFlow <ArrowRight size={16} />
          </Link>
        </div>
      </nav>

      <section className="mx-auto grid min-h-[72vh] max-w-7xl items-center gap-14 px-6 py-16 lg:grid-cols-[1.05fr_.95fr]">
        <div>
          <div className="badge mb-6">
            <Sparkles size={13} className="mr-2" /> Built for focused tuition
            teams
          </div>
          <h1 className="max-w-3xl text-5xl font-black leading-[1.02] tracking-[-.05em] sm:text-7xl">
            Teaching moves fast.
            <br />
            <span className="text-neon">ClassFlow keeps up.</span>
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-white/55">
            A practical learning platform for tuition classes that brings
            teachers, students and administrators into one calm, accountable
            workspace.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link className="btn px-6 py-3" href="/login">
              Enter your workspace <ArrowRight size={17} />
            </Link>
            <a className="btn-secondary px-6 py-3" href="#features">
              Explore features
            </a>
          </div>
          <div className="mt-9 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/45">
            {[
              "Role-aware access",
              "Real submissions",
              "Timed auto-marking",
            ].map((item) => (
              <span className="flex items-center gap-2" key={item}>
                <CheckCircle2 size={15} className="text-neon" />
                {item}
              </span>
            ))}
          </div>
        </div>
        <div className="panel relative p-4 sm:p-7">
          <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-neon/10 blur-3xl" />
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-white/35">
                Monday overview
              </p>
              <h2 className="mt-1 text-xl font-black">Good morning, Amaya</h2>
            </div>
            <span className="grid h-10 w-10 place-items-center rounded-full bg-neon font-black text-ink">
              AS
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["02", "Classes today"],
              ["01", "Due soon"],
              ["84%", "Quiz average"],
            ].map(([value, label]) => (
              <div className="card" key={label}>
                <p className="text-2xl font-black text-neon">{value}</p>
                <p className="mt-1 text-xs text-white/45">{label}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 card">
            <p className="text-xs font-bold uppercase tracking-widest text-white/35">
              Up next
            </p>
            <div className="mt-4 flex items-center justify-between gap-4">
              <div>
                <p className="font-bold">A/L Mathematics</p>
                <p className="mt-1 text-sm text-white/45">
                  Functions: paper discussion
                </p>
              </div>
              <span className="badge">4:30 PM</span>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="card">
              <ShieldCheck className="text-neon" size={22} />
              <p className="mt-4 font-bold">Feedback received</p>
              <p className="mt-1 text-sm text-white/45">
                Functions practice paper · 82/100
              </p>
            </div>
            <div className="card">
              <Bot className="text-neon" size={22} />
              <p className="mt-4 font-bold">Need a hand?</p>
              <p className="mt-1 text-sm text-white/45">
                Ask ClassFlow where to find notes.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-7xl px-6 py-24">
        <p className="text-xs font-bold uppercase tracking-[.25em] text-neon">
          A complete working loop
        </p>
        <h2 className="mt-3 max-w-2xl text-3xl font-black sm:text-5xl">
          Less administration. More visible progress.
        </h2>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {features.map(({ icon: Icon, title, text }) => (
            <div className="panel p-7" key={title}>
              <Icon className="text-neon" />
              <h3 className="mt-8 text-xl font-black">{title}</h3>
              <p className="mt-3 leading-7 text-white/45">{text}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
