"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, UserPlus, X } from "lucide-react";
import { api } from "@/lib/api";
import { Notice } from "@/components/ui";
import { formatDate } from "./shared";

type EnrollmentRequest = {
  studentId: number;
  studentName: string;
  email: string;
  avatarUrl?: string;
  requestedAt: string;
};

function initials(name: string) {
  return (
    name
      .split(" ")
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

/**
 * Students waiting to be let into this course.
 *
 * Approving is what grants access to everything course-scoped, so the panel stays visible
 * while anyone is waiting and disappears once the queue is empty.
 */
export function EnrollmentRequests({
  courseId,
  onDecided,
}: {
  courseId: number;
  onDecided: () => void;
}) {
  const [requests, setRequests] = useState<EnrollmentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setRequests(
        await api<EnrollmentRequest[]>(
          `/courses/${courseId}/enrollment-requests`,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load requests");
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(request: EnrollmentRequest, approve: boolean) {
    setError("");
    setBusyId(request.studentId);
    try {
      await api(
        `/courses/${courseId}/enrollment-requests/${request.studentId}`,
        { method: "PATCH", body: JSON.stringify({ approve }) },
      );
      setRequests((current) =>
        current.filter((one) => one.studentId !== request.studentId),
      );
      // An approval changes the student count on the course card above.
      if (approve) onDecided();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not answer that request",
      );
      // The request may have been answered elsewhere; resync rather than guess.
      load();
    } finally {
      setBusyId(null);
    }
  }

  if (loading || (!requests.length && !error)) return null;

  return (
    <section className="panel p-5">
      <div className="flex items-center gap-2">
        <UserPlus size={16} className="text-neon" />
        <h3 className="font-black">Join requests</h3>
        {requests.length > 0 && (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-neon px-1.5 text-[11px] font-black text-ink">
            {requests.length}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-white/40">
        Approving gives access to the materials, assignments, quizzes and forum,
        and opens a direct chat.
      </p>
      <Notice error={error} />
      <div className="mt-4 space-y-3">
        {requests.map((request) => (
          <div
            key={request.studentId}
            className="rounded-xl border border-line bg-white/[.02] p-3"
          >
            <div className="flex items-center gap-3">
              {request.avatarUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={request.avatarUrl}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-full border border-line object-cover"
                />
              ) : (
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-neon/15 text-xs font-black text-neon">
                  {initials(request.studentName)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">
                  {request.studentName}
                </p>
                <p className="truncate text-xs text-white/35">
                  {request.email}
                </p>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-white/25">
              Asked {formatDate(request.requestedAt)}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="btn flex-1 px-3 py-2 text-xs"
                disabled={busyId === request.studentId}
                onClick={() => decide(request, true)}
              >
                <Check size={14} />
                Approve
              </button>
              <button
                type="button"
                className="flex-1 rounded-full border border-red-400/30 px-3 py-2 text-xs font-bold text-red-300 transition hover:bg-red-400/10 disabled:opacity-50"
                disabled={busyId === request.studentId}
                onClick={() => decide(request, false)}
              >
                <X size={14} className="mr-1 inline" />
                Decline
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
