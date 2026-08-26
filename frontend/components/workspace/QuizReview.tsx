"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, CircleDot, X } from "lucide-react";
import { api } from "@/lib/api";
import { Notice } from "@/components/ui";
import { Modal, formatDate } from "./shared";

type ReviewOption = {
  id: number;
  text: string;
  correct: boolean;
  selected: boolean;
};

type ReviewQuestion = {
  id: number;
  prompt: string;
  points: number;
  selectedOptionId?: number;
  correct: boolean;
  options: ReviewOption[];
};

type Review = {
  quiz: { id: number; title: string };
  score?: number;
  maxScore?: number;
  submittedAt: string;
  questions: ReviewQuestion[];
};

/**
 * The marked paper for a submitted attempt: what was chosen, what was right, and where the
 * two differed. A question left unanswered is shown as such rather than silently as wrong.
 *
 * `studentId` is only passed by a teacher reviewing someone else's attempt; a student always
 * reads their own, which is all the server will give them.
 */
export function QuizReview({
  quizId,
  studentId,
  title,
  onClose,
}: {
  quizId: number;
  studentId?: number;
  title: string;
  onClose: () => void;
}) {
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const query = studentId ? `?studentId=${studentId}` : "";
      setReview(await api<Review>(`/quizzes/${quizId}/review${query}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the review");
    }
  }, [quizId, studentId]);

  useEffect(() => {
    load();
  }, [load]);

  const correctCount =
    review?.questions.filter((question) => question.correct).length ?? 0;

  return (
    <Modal
      open
      size="lg"
      title={title}
      subtitle={review ? `Reviewed answers` : undefined}
      onClose={onClose}
    >
      <Notice error={error} />
      {review && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Summary label="Score" value={`${review.score ?? 0}/${review.maxScore ?? 0}`} />
            <Summary
              label="Correct"
              value={`${correctCount} of ${review.questions.length}`}
            />
            <Summary label="Submitted" value={formatDate(review.submittedAt)} small />
          </div>

          <div className="mt-6 space-y-4">
            {review.questions.map((question, index) => (
              <div
                key={question.id}
                className={`rounded-xl border p-4 ${
                  question.correct
                    ? "border-neon/25 bg-neon/[.04]"
                    : "border-red-400/25 bg-red-400/[.04]"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-black ${
                      question.correct
                        ? "bg-neon text-ink"
                        : "bg-red-400 text-ink"
                    }`}
                  >
                    {question.correct ? <Check size={13} /> : <X size={13} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">
                      {index + 1}. {question.prompt}
                    </p>
                    <p className="mt-1 text-[11px] uppercase tracking-widest text-white/30">
                      {question.correct
                        ? `+${question.points} ${question.points === 1 ? "mark" : "marks"}`
                        : question.selectedOptionId
                          ? "Incorrect"
                          : "Not answered"}
                    </p>
                  </div>
                </div>

                <ul className="mt-3 space-y-1.5 pl-9">
                  {question.options.map((option) => (
                    <li
                      key={option.id}
                      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                        option.correct
                          ? "bg-neon/10 font-bold text-neon"
                          : option.selected
                            ? "bg-red-400/10 text-red-200 line-through"
                            : "text-white/45"
                      }`}
                    >
                      {option.correct ? (
                        <Check size={14} className="shrink-0" />
                      ) : option.selected ? (
                        <X size={14} className="shrink-0" />
                      ) : (
                        <CircleDot size={14} className="shrink-0 opacity-25" />
                      )}
                      <span className="min-w-0 flex-1">{option.text}</span>
                      {option.selected && (
                        <span className="shrink-0 text-[10px] uppercase tracking-widest opacity-70">
                          Your answer
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}

function Summary({
  label,
  value,
  small,
}: {
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <div className="rounded-xl border border-line bg-white/[.02] p-4">
      <p className="text-[11px] font-bold uppercase tracking-widest text-white/35">
        {label}
      </p>
      <p className={`mt-2 font-black ${small ? "text-sm" : "text-xl"}`}>
        {value}
      </p>
    </div>
  );
}
