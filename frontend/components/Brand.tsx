import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-3 font-black tracking-tight"
    >
      <span className="grid h-9 w-9 place-items-center rounded-xl border border-neon/30 bg-neon/10 text-neon">
        CF
      </span>
      {!compact && (
        <span className="text-lg">
          Class<span className="text-neon">Flow</span>
        </span>
      )}
    </Link>
  );
}
