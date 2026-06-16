import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Facebook,
  GraduationCap,
  Instagram,
  Layers3,
  Linkedin,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
} from "lucide-react";
import { Brand } from "@/components/Brand";
import { LiquidGlassCard } from "@/components/ui/liquid-glass";

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

const featureCardClass = "panel landing-gradient-card";

const teacherDetails = [
  {
    label: "Name",
    value: "Mr. Kavindu Jayasinghe",
  },
  {
    label: "Education background",
    value:
      "BSc in Mathematics, University of Colombo, with a postgraduate diploma in education.",
  },
  {
    label: "Teaching experience",
    value:
      "8+ years guiding O/L and A/L students through structured lessons, weekly practice, and exam-focused feedback.",
  },
];

const socialLinks = [
  {
    href: "https://www.linkedin.com/in/your-profile",
    icon: Linkedin,
    label: "LinkedIn",
  },
  {
    href: "https://www.facebook.com/your-profile",
    icon: Facebook,
    label: "Facebook",
  },
  {
    href: "https://www.instagram.com/your-profile",
    icon: Instagram,
    label: "Instagram",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <Brand />
        <div className="flex items-center gap-3">
          <Link className="btn-secondary max-[520px]:hidden" href="/login">
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
          <h1 className="max-w-3xl text-4xl font-black leading-[1.04] sm:text-6xl sm:leading-[1.02] 2xl:text-7xl">
            <span className="block">Teaching moves</span>
            <span className="block">fast.</span>
            <span className="block text-neon">ClassFlow keeps</span>
            <span className="block text-neon">up.</span>
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-white/55">
            A practical learning platform for tuition classes that brings
            teachers, students and administrators into one calm, accountable
            workspace.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
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
        <LiquidGlassCard
          blurIntensity="sm"
          borderRadius="16px"
          className="isolate overflow-hidden border border-neon/20 bg-panel/45 p-4 sm:p-7"
          displacementScale={34}
          draggable={false}
          glowIntensity="none"
          shadowIntensity="none"
        >
          <div className="relative z-30">
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
        </LiquidGlassCard>
      </section>

      <section
        id="teacher"
        className="mx-auto grid max-w-7xl items-center gap-10 px-6 py-20 lg:grid-cols-[.9fr_1.1fr]"
      >
        <div className="relative mx-auto w-full max-w-md overflow-hidden rounded-2xl border border-neon/20 bg-panel">
          <Image
            alt="Sample teacher portrait"
            className="aspect-[4/5] h-auto w-full object-cover"
            height={1536}
            sizes="(min-width: 1024px) 420px, 100vw"
            src="/images/sample-teacher.png"
            width={1024}
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink via-ink/70 to-transparent p-5">
            <p className="text-xs font-bold uppercase tracking-[.25em] text-neon">
              Lead teacher
            </p>
            <p className="mt-1 text-xl font-black">Mathematics specialist</p>
          </div>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-[.25em] text-neon">
            About the teacher
          </p>
          <h2 className="mt-3 max-w-2xl text-3xl font-black sm:text-5xl">
            Learn from a teacher who keeps every student visible.
          </h2>
          <p className="mt-5 max-w-2xl leading-8 text-white/50">
            This sample profile can be replaced with your real details and
            photo later. It gives the landing page a personal, trustworthy
            introduction before students enter the workspace.
          </p>

          <div className="mt-8 grid gap-3">
            {teacherDetails.map((item) => (
              <div
                className="rounded-xl border border-line bg-white/[.025] p-5"
                key={item.label}
              >
                <p className="text-xs font-bold uppercase tracking-widest text-white/35">
                  {item.label}
                </p>
                <p className="mt-2 text-base font-semibold leading-7 text-white/80">
                  {item.value}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-3 text-sm text-white/45">
            <span className="inline-flex items-center gap-2 rounded-full border border-neon/20 bg-neon/10 px-3 py-1.5 text-neon">
              <GraduationCap size={16} />
              Exam-focused mentoring
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-neon/20 bg-neon/10 px-3 py-1.5 text-neon">
              <UserRoundCheck size={16} />
              Individual progress tracking
            </span>
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
            <div className={`${featureCardClass} p-7`} key={title}>
              <Icon className="text-neon" />
              <h3 className="mt-8 text-xl font-black">{title}</h3>
              <p className="mt-3 leading-7 text-white/45">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-line bg-ink/55">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Brand />
            <p className="mt-4 max-w-md text-sm leading-6 text-white/45">
              Follow my teaching updates, class announcements, and student
              success stories across social media.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {socialLinks.map(({ href, icon: Icon, label }) => (
              <a
                aria-label={label}
                className="btn-secondary h-11 w-11 px-0 py-0"
                href={href}
                key={label}
                rel="noreferrer"
                target="_blank"
                title={label}
              >
                <Icon size={18} />
              </a>
            ))}
          </div>
        </div>
        <div className="mx-auto flex max-w-7xl flex-col gap-2 border-t border-line px-6 py-5 text-xs text-white/35 sm:flex-row sm:items-center sm:justify-between">
          <p>ClassFlow 2026. All rights reserved.</p>
          <p>Designed for focused tuition learning.</p>
        </div>
      </footer>
    </main>
  );
}
