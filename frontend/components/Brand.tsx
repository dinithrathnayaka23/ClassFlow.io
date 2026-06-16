import Link from "next/link";

function ClassFlowMark({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 120 92"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <filter
          id="classflow-logo-glow"
          colorInterpolationFilters="sRGB"
          filterUnits="userSpaceOnUse"
          height="132"
          width="160"
          x="-20"
          y="-20"
        >
          <feGaussianBlur result="blur" stdDeviation="3.5" />
          <feColorMatrix
            in="blur"
            result="mintGlow"
            values="0 0 0 0 0.333 0 0 0 0 0.976 0 0 0 0 0.569 0 0 0 .9 0"
          />
          <feMerge>
            <feMergeNode in="mintGlow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient
          id="classflow-logo-stroke"
          x1="10"
          x2="112"
          y1="46"
          y2="46"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#B6FFD0" />
          <stop offset=".45" stopColor="#55F991" />
          <stop offset="1" stopColor="#2CEB78" />
        </linearGradient>
      </defs>
      <g
        filter="url(#classflow-logo-glow)"
        stroke="url(#classflow-logo-stroke)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="6"
      >
        <path d="M34 35 66 19l42 20-42 20-42-20 10-4Z" />
        <path d="M41 50v14c0 11 11 19 25 19s25-8 25-19V50" />
        <path d="M24 26c13-20 53-28 80 0" />
        <path d="M24 74c13 18 51 21 77 1" />
        <path d="M108 40v14" />
        <path d="M108 65v13" />
        <path d="M104 78h8" />
        <path d="M7 31h22" />
        <path d="M3 46h31" />
        <path d="M12 61h24" />
      </g>
    </svg>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      aria-label="ClassFlow home"
      href="/"
      className="group inline-flex min-w-0 items-center gap-3 font-black"
    >
      <span className="brand-mark-shell">
        <ClassFlowMark className="h-full w-full" />
      </span>
      {!compact && (
        <span className="brand-wordmark">
          <span className="text-white">Class</span>
          <span className="text-neon">Flow</span>
        </span>
      )}
    </Link>
  );
}
