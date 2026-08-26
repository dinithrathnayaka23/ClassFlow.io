"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, X } from "lucide-react";
import { api, Course, Page } from "@/lib/api";

/**
 * The caller's courses. A student's default scope is the courses they are enrolled in, which
 * is why every course-scoped page is naturally empty until they join something; pass
 * "available" for the catalogue of courses they could still join.
 */
export function useCourses(scope: "enrolled" | "available" = "enrolled") {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const reload = () =>
    api<Page<Course>>(`/courses?scope=${scope}&size=100`)
      .then((data) => setCourses(data.items))
      .finally(() => setLoading(false));
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);
  return { courses, loading, reload };
}

/**
 * Shown to a student on a course-scoped page when they have not joined anything yet.
 *
 * The server already refuses the underlying data, so this exists to explain an otherwise
 * blank screen and point at the one action that fixes it.
 */
export function JoinCourseNotice({
  role,
  what,
}: {
  role: string;
  what: string;
}) {
  return (
    <div className="card py-14 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-neon/10 text-neon">
        <BookOpen size={22} />
      </span>
      <p className="mt-5 font-bold">Join a course to see {what}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/45">
        {what[0].toUpperCase() + what.slice(1)} become available once a teacher
        approves your request to join, along with a direct line to them.
      </p>
      <Link className="btn mt-6 inline-flex" href={`/${role}/courses`}>
        Browse courses
      </Link>
    </div>
  );
}

export function CoursePicker({
  courses,
  value,
  onChange,
}: {
  courses: Course[];
  value?: number;
  onChange: (id: number) => void;
}) {
  return (
    <select
      className="input max-w-sm"
      value={value || ""}
      onChange={(event) => onChange(Number(event.target.value))}
    >
      <option value="" disabled>
        Select a course
      </option>
      {courses.map((course) => (
        <option key={course.id} value={course.id}>
          {course.code} · {course.title}
        </option>
      ))}
    </select>
  );
}

const modalWidths = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
};

export function Modal({
  title,
  subtitle,
  open,
  onClose,
  size = "md",
  children,
}: {
  title: string;
  subtitle?: string;
  open: boolean;
  onClose: () => void;
  size?: keyof typeof modalWidths;
  children: React.ReactNode;
}) {
  // Held in a ref so the effect below can depend on `open` alone. Callers pass an inline
  // arrow for onClose, so a new identity arrives on every render; depending on it would
  // re-run the effect constantly, and each run would snapshot the overflow it had just
  // set. The restore would then write "hidden" back on close and freeze the page.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  // Escape closes the dialog and the page behind it stops scrolling, so a long
  // popup on a phone scrolls its own body instead of the workspace underneath.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto overscroll-contain bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(event) => {
        // Only a press that starts on the backdrop closes: dragging a selection
        // out of the dialog should not dismiss it.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`panel flex max-h-[92vh] w-full flex-col rounded-b-none sm:rounded-2xl ${modalWidths[size]}`}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-black sm:text-xl">{title}</h2>
            {subtitle && (
              <p className="mt-1 truncate text-sm text-white/40">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            aria-label="Close dialog"
            className="-mr-1 shrink-0 rounded-lg p-1.5 text-white/45 transition hover:bg-white/5 hover:text-white"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6">
          {children}
        </div>
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export function formatDate(value?: string) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
