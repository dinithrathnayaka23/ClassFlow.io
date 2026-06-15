import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function Empty({ title, text }: { title: string; text: string }) {
  return <div className="card py-14 text-center"><p className="font-bold">{title}</p><p className="mt-2 text-sm text-white/45">{text}</p></div>;
}

export function SectionTitle({ title, eyebrow, action }: { title: string; eyebrow?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>{eyebrow && <p className="mb-2 text-xs font-bold uppercase tracking-[.25em] text-neon">{eyebrow}</p>}<h1 className="text-2xl font-black md:text-3xl">{title}</h1></div>
      {action}
    </div>
  );
}

export function Notice({ error, success }: { error?: string; success?: string }) {
  if (!error && !success) return null;
  return <p className={`mb-4 rounded-lg border px-3 py-2 text-sm ${error ? "border-red-400/30 bg-red-400/10 text-red-200" : "border-neon/30 bg-neon/10 text-neon"}`}>{error || success}</p>;
}
