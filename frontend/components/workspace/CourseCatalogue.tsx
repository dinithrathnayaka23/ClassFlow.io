"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, Clock, Plus, RotateCcw, Users as UsersIcon, X } from "lucide-react";
import { api, Course, Page } from "@/lib/api";
import { Card, Notice } from "@/components/ui";

type EnrollmentStatus = "PENDING" | "APPROVED" | "REJECTED";
type EnrollmentState = { courseId: number; status: EnrollmentStatus };

/**
 * The courses a student has not joined yet, and where their request stands on each.
 *
 * These cards deliberately do not link through to the course page: until the teacher
 * approves, the server refuses everything inside it, so a link would only lead to a refusal.
 */
export function CourseCatalogue({ onEnrolled }: { onEnrolled: () => void }) {
  const [available, setAvailable] = useState<Course[]>([]);
  const [states, setStates] = useState<Record<number, EnrollmentStatus>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [catalogue, mine] = await Promise.all([
        api<Page<Course>>("/courses?scope=available&size=100"),
        api<EnrollmentState[]>("/courses/enrollments/mine"),
      ]);
      setAvailable(catalogue.items);
      setStates(
        Object.fromEntries(mine.map((one) => [one.courseId, one.status])),
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not load available courses",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function request(course: Course) {
    setError("");
    setBusyId(course.id);
    try {
      await api(`/courses/${course.id}/enroll`, { method: "POST" });
      setStates((current) => ({ ...current, [course.id]: "PENDING" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send your request");
    } finally {
      setBusyId(null);
    }
  }

  async function withdraw(course: Course) {
    setError("");
    setBusyId(course.id);
    try {
      await api(`/courses/${course.id}/enroll`, { method: "DELETE" });
      setStates((current) => {
        const next = { ...current };
        delete next[course.id];
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not withdraw the request");
    } finally {
      setBusyId(null);
    }
  }

  // An approval that landed since the last poll moves the course out of this list and
  // into the student's own, so tell the page to refresh both.
  useEffect(() => {
    if (loading) return;
    const timer = setInterval(async () => {
      try {
        const mine = await api<EnrollmentState[]>("/courses/enrollments/mine");
        const approved = mine.some(
          (one) =>
            one.status === "APPROVED" &&
            available.some((course) => course.id === one.courseId),
        );
        setStates(
          Object.fromEntries(mine.map((one) => [one.courseId, one.status])),
        );
        if (approved) {
          await load();
          onEnrolled();
        }
      } catch {
        // A dropped poll is not worth reporting; the next one recovers.
      }
    }, 15_000);
    return () => clearInterval(timer);
  }, [available, loading, load, onEnrolled]);

  if (loading || (!available.length && !error)) return null;

  return (
    <section className="mt-10">
      <div className="mb-5">
        <p className="mb-2 text-xs font-bold uppercase tracking-[.25em] text-neon">
          Open for enrolment
        </p>
        <h2 className="text-xl font-black">Available courses</h2>
        <p className="mt-2 text-sm text-white/40">
          Ask to join a course. Once its teacher approves, you get the
          materials, assignments, quizzes and forum, and can message them
          directly.
        </p>
      </div>
      <Notice error={error} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {available.map((course) => {
          const status = states[course.id];
          const busy = busyId === course.id;
          return (
            <Card key={course.id} className="flex h-full flex-col">
              <div className="flex items-center justify-between gap-2">
                <span className="badge">{course.code}</span>
                <BookOpen size={17} className="text-white/25" />
              </div>
              <h3 className="mt-6 text-lg font-black">{course.title}</h3>
              <p className="mt-3 line-clamp-2 flex-1 text-sm leading-6 text-white/40">
                {course.description || course.subject}
              </p>
              <div className="mt-6 flex items-center justify-between border-t border-line pt-4 text-xs text-white/35">
                <span className="truncate">{course.teacherName}</span>
                <span className="flex shrink-0 items-center gap-1">
                  <UsersIcon size={13} />
                  {course.studentCount}
                </span>
              </div>

              {status === "PENDING" ? (
                <div className="mt-4">
                  <p className="flex items-center justify-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-4 py-2.5 text-sm font-bold text-amber-200">
                    <Clock size={15} />
                    Waiting for approval
                  </p>
                  <button
                    type="button"
                    className="mt-2 w-full rounded-full px-4 py-2 text-xs font-bold text-white/45 transition hover:text-red-300 disabled:opacity-50"
                    disabled={busy}
                    onClick={() => withdraw(course)}
                  >
                    <X size={13} className="mr-1 inline" />
                    {busy ? "Withdrawing..." : "Withdraw request"}
                  </button>
                </div>
              ) : status === "REJECTED" ? (
                <div className="mt-4">
                  <p className="rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-center text-xs font-bold text-red-200">
                    Your request was not approved
                  </p>
                  <button
                    className="btn mt-2 w-full"
                    disabled={busy}
                    onClick={() => request(course)}
                  >
                    <RotateCcw size={15} />
                    {busy ? "Sending..." : "Ask again"}
                  </button>
                </div>
              ) : (
                <button
                  className="btn mt-4 w-full"
                  disabled={busy}
                  onClick={() => request(course)}
                >
                  <Plus size={15} />
                  {busy ? "Sending..." : "Request to join"}
                </button>
              )}
            </Card>
          );
        })}
      </div>
    </section>
  );
}
