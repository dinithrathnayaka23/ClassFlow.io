"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  ListChecks,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import { Card, Empty, Notice, SectionTitle } from "@/components/ui";
import { QuizReview } from "./QuizReview";
import { CoursePicker, Field, JoinCourseNotice, Modal, formatDate, useCourses } from "./shared";

type Quiz = {
  id: number;
  title: string;
  description: string;
  durationMinutes: number;
  startsAt: string;
  endsAt: string;
  questionCount: number;
  score?: number;
  maxScore?: number;
  submittedAt?: string;
  startedAt?: string;
};

/**
 * Two independent limits govern an attempt:
 *  - the availability window (startsAt..endsAt) decides when a student may begin;
 *  - durationMinutes is a personal countdown that starts when they do.
 * Whichever runs out first ends the attempt, so the deadline is the earlier of the two.
 */
function attemptDeadline(quiz: Quiz, startedAt: string) {
  const personal = new Date(startedAt).getTime() + quiz.durationMinutes * 60000;
  const windowClose = new Date(quiz.endsAt).getTime();
  return Math.min(personal, windowClose);
}

function countdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
type QuizDetail = {
  quiz: Quiz;
  questions: {
    id: number;
    prompt: string;
    points: number;
    // `correct` is returned to teachers and admins only; students get null.
    options: { id: number; text: string; correct?: boolean | null }[];
  }[];
};

type AttemptSummary = {
  id: number;
  studentId: number;
  studentName: string;
  email: string;
  startedAt: string;
  submittedAt?: string;
  score?: number;
  maxScore?: number;
};

/** ISO instant -> the `YYYY-MM-DDTHH:mm` shape a datetime-local input expects, in local time. */
function toLocalInput(iso: string) {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// A question being written in the create form, before it is sent to the API.
type DraftQuestion = {
  prompt: string;
  points: number;
  options: string[];
  correctIndex: number;
};

const OPTIONS_PER_QUESTION = 4;

/** How far ahead of the server deadline the client hands in automatically. */
const AUTO_SUBMIT_LEAD_MS = 3000;

function blankQuestion(): DraftQuestion {
  return {
    prompt: "",
    points: 1,
    options: Array(OPTIONS_PER_QUESTION).fill(""),
    correctIndex: 0,
  };
}

/** Turns a saved question back into an editable draft, padded to four answers. */
function toDraft(question: QuizDetail["questions"][number]): DraftQuestion {
  const options = question.options.map((option) => option.text);
  while (options.length < OPTIONS_PER_QUESTION) options.push("");
  const correct = question.options.findIndex((option) => option.correct);
  return {
    prompt: question.prompt,
    points: question.points,
    options,
    correctIndex: correct < 0 ? 0 : correct,
  };
}

export function Quizzes({ role }: { role: string }) {
  const { courses, loading: coursesLoading } = useCourses();
  const [courseId, setCourseId] = useState<number>();
  const [items, setItems] = useState<Quiz[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [active, setActive] = useState<QuizDetail>();
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [startedAt, setStartedAt] = useState<string>();
  const [questions, setQuestions] = useState<DraftQuestion[]>([blankQuestion()]);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Quiz | null>(null);
  const [questionsLocked, setQuestionsLocked] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [reviewing, setReviewing] = useState<{
    quizId: number;
    title: string;
    studentId?: number;
  } | null>(null);
  const [attemptsFor, setAttemptsFor] = useState<Quiz | null>(null);
  const [attempts, setAttempts] = useState<AttemptSummary[]>([]);
  const [busy, setBusy] = useState(false);

  function patchQuestion(index: number, patch: Partial<DraftQuestion>) {
    setQuestions((old) =>
      old.map((question, i) => (i === index ? { ...question, ...patch } : question)),
    );
  }

  function patchOption(index: number, optionIndex: number, value: string) {
    setQuestions((old) =>
      old.map((question, i) =>
        i === index
          ? {
              ...question,
              options: question.options.map((option, o) =>
                o === optionIndex ? value : option,
              ),
            }
          : question,
      ),
    );
  }

  function closeCreate() {
    setOpen(false);
    setEditing(null);
    setQuestionsLocked(false);
    setError("");
    setQuestions([blankQuestion()]);
  }

  async function openEdit(quiz: Quiz) {
    setError("");
    setNotice("");
    try {
      const [detail, existing] = await Promise.all([
        api<QuizDetail>(`/quizzes/${quiz.id}`),
        api<AttemptSummary[]>(`/quizzes/${quiz.id}/attempts`),
      ]);
      // Rewriting questions would cascade away the answers behind existing
      // attempts, so the server refuses it while any attempt stands.
      setQuestionsLocked(existing.length > 0);
      setQuestions(
        detail.questions.length
          ? detail.questions.map(toDraft)
          : [blankQuestion()],
      );
      setEditing(quiz);
      setOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open this quiz");
    }
  }

  async function removeQuiz(id: number) {
    setError("");
    setBusy(true);
    try {
      await api(`/quizzes/${id}`, { method: "DELETE" });
      setConfirmDelete(null);
      setNotice("Quiz deleted.");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the quiz");
    } finally {
      setBusy(false);
    }
  }

  async function openAttempts(quiz: Quiz) {
    setError("");
    setNotice("");
    try {
      setAttempts(await api<AttemptSummary[]>(`/quizzes/${quiz.id}/attempts`));
      setAttemptsFor(quiz);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load attempts");
    }
  }

  async function reopenAttempt(quizId: number, studentId: number) {
    setError("");
    setBusy(true);
    try {
      await api(`/quizzes/${quizId}/attempts/${studentId}`, {
        method: "DELETE",
      });
      setAttempts(await api<AttemptSummary[]>(`/quizzes/${quizId}/attempts`));
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reopen the attempt");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!courseId && courses[0]) setCourseId(courses[0].id);
  }, [courses, courseId]);
  const load = () =>
    courseId && api<Quiz[]>(`/quizzes?courseId=${courseId}`).then(setItems);
  useEffect(() => {
    load();
    setActive(undefined);
    setNotice("");
  }, [courseId]);
  // A ticking clock. The old code read Date.now() inside a useMemo, so the
  // countdown was computed once and never moved.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const remaining = useMemo(
    () =>
      active && startedAt ? attemptDeadline(active.quiz, startedAt) - now : 0,
    [active, startedAt, now],
  );

  // Hand in automatically as the clock runs out, so a student who is still on
  // the page keeps the answers they had rather than losing the attempt.
  // Fired a few seconds early on purpose: the server rejects anything arriving
  // after started_at + duration, so submitting exactly at zero would lose the
  // race to network latency and any clock skew between browser and server.
  useEffect(() => {
    if (!active || !startedAt || submitting) return;
    if (remaining > AUTO_SUBMIT_LEAD_MS) return;
    submit(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, active, startedAt, submitting]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const v = Object.fromEntries(new FormData(event.currentTarget));

    if (new Date(String(v.endsAt)) <= new Date(String(v.startsAt))) {
      setError("The end time must be after the start time.");
      return;
    }
    const includeQuestions = !editing || !questionsLocked;
    if (includeQuestions) {
      for (const [index, question] of questions.entries()) {
        if (!question.prompt.trim()) {
          setError(`Question ${index + 1} needs a prompt.`);
          return;
        }
        if (question.options.some((option) => !option.trim())) {
          setError(`Question ${index + 1} needs all four answers filled in.`);
          return;
        }
      }
    }

    const payload = {
      courseId,
      title: v.title,
      description: v.description,
      durationMinutes: Number(v.durationMinutes),
      startsAt: new Date(String(v.startsAt)).toISOString(),
      endsAt: new Date(String(v.endsAt)).toISOString(),
      ...(includeQuestions
        ? {
            questions: questions.map((question) => ({
              prompt: question.prompt.trim(),
              points: question.points,
              options: question.options.map((text, index) => ({
                text: text.trim(),
                correct: index === question.correctIndex,
              })),
            })),
          }
        : {}),
    };

    setSaving(true);
    try {
      if (editing) {
        await api(`/quizzes/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        setNotice("Quiz updated.");
      } else {
        await api("/quizzes", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      closeCreate();
      load();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : `Could not ${editing ? "update" : "create"} the quiz`,
      );
    } finally {
      setSaving(false);
    }
  }
  async function start(quiz: Quiz) {
    setError("");
    setNotice("");
    try {
      // The server keeps the original started_at on re-entry, so this both
      // starts a new attempt and resumes an existing one with the clock intact.
      const attempt = await api<{ startedAt: string }>(
        `/quizzes/${quiz.id}/start`,
        { method: "POST" },
      );
      setAnswers({});
      setStartedAt(attempt.startedAt);
      setActive(await api(`/quizzes/${quiz.id}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open this quiz");
    }
  }

  async function submit(auto = false) {
    if (!active || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await api(`/quizzes/${active.quiz.id}/submit`, {
        method: "POST",
        body: JSON.stringify({
          answers: Object.entries(answers).map(([questionId, optionId]) => ({
            questionId: Number(questionId),
            optionId,
          })),
        }),
      });
      setActive(undefined);
      setStartedAt(undefined);
      setAnswers({});
      if (auto) setNotice("Time is up. Your answers were submitted automatically.");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit the quiz");
      if (auto) {
        setActive(undefined);
        setStartedAt(undefined);
        load();
      }
    } finally {
      setSubmitting(false);
    }
  }
  // Nothing here exists for a student until they join a course, and the API refuses
  // it all in the meantime. Explain the empty screen rather than showing bare controls.
  if (role === "student" && !coursesLoading && !courses.length) {
    return (
      <>
        <SectionTitle eyebrow={"Timed assessments"} title={"Quizzes"} />
        <JoinCourseNotice role={role} what={"quizzes"} />
      </>
    );
  }

  return (
    <>
      <SectionTitle
        eyebrow="Timed assessments"
        title="Quizzes"
        action={
          role !== "student" ? (
            <button className="btn" onClick={() => setOpen(true)}>
              <Plus size={16} />
              Create quiz
            </button>
          ) : undefined
        }
      />
      <div className="mb-6">
        <CoursePicker
          courses={courses}
          value={courseId}
          onChange={setCourseId}
        />
      </div>
      {!active && <Notice error={error} success={notice} />}
      {active ? (
        <section className="panel p-6">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <button
                className="mb-3 text-sm text-white/40"
                onClick={() => setActive(undefined)}
              >
                ← Back to quizzes
              </button>
              <h2 className="text-2xl font-black">{active.quiz.title}</h2>
              <p className="mt-2 text-xs text-white/35">
                Closes {formatDate(active.quiz.endsAt)}
              </p>
            </div>
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-black tabular-nums ${
                remaining <= 60000
                  ? "border-red-400/40 bg-red-400/10 text-red-200"
                  : "border-neon/25 bg-neon/10 text-neon"
              }`}
              role="timer"
              aria-live="off"
            >
              <Clock3 size={14} />
              {countdown(remaining)}
            </span>
          </div>
          <Notice error={error} />
          <div className="space-y-5">
            {active.questions.map((question, index) => (
              <Card key={question.id}>
                <p className="font-bold">
                  {index + 1}. {question.prompt}
                </p>
                <div className="mt-4 space-y-2">
                  {question.options.map((option) => (
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm ${answers[question.id] === option.id ? "border-neon bg-neon/10" : "border-line"}`}
                      key={option.id}
                    >
                      <input
                        type="radio"
                        name={`q-${question.id}`}
                        onChange={() =>
                          setAnswers((old) => ({
                            ...old,
                            [question.id]: option.id,
                          }))
                        }
                      />
                      {option.text}
                    </label>
                  ))}
                </div>
              </Card>
            ))}
          </div>
          <p className="mt-6 text-xs text-white/35">
            {Object.keys(answers).length} of {active.questions.length} answered
          </p>
          <button
            className="btn mt-2"
            disabled={
              submitting ||
              Object.keys(answers).length < active.questions.length
            }
            onClick={() => submit()}
          >
            <CheckCircle2 size={16} />
            {submitting ? "Submitting..." : "Submit quiz"}
          </button>
        </section>
      ) : items.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((quiz) => {
            const opensAt = new Date(quiz.startsAt).getTime();
            const closesAt = new Date(quiz.endsAt).getTime();
            const upcoming = now < opensAt;
            const closed = now > closesAt;
            const inProgress = Boolean(quiz.startedAt) && !quiz.submittedAt;
            return (
              <Card key={quiz.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="badge">{quiz.questionCount} questions</span>
                  <span className="inline-flex items-center gap-1.5 text-xs text-white/35">
                    <Clock3 size={12} />
                    {quiz.durationMinutes} min once you start
                  </span>
                </div>
                <h2 className="mt-5 text-lg font-black">{quiz.title}</h2>
                <p className="mt-2 text-sm text-white/40">{quiz.description}</p>
                <div className="mt-5 space-y-1 text-xs text-white/30">
                  <p>Opens {formatDate(quiz.startsAt)}</p>
                  <p>Closes {formatDate(quiz.endsAt)}</p>
                </div>

                {role !== "student" && (
                  <div className="mt-5 border-t border-line pt-4">
                    {confirmDelete === quiz.id ? (
                      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-red-400/30 bg-red-400/10 p-3">
                        <p className="mr-1 text-sm text-red-200">
                          Delete this quiz and all its attempts?
                        </p>
                        <button
                          type="button"
                          className="rounded-full bg-red-400/90 px-3 py-1.5 text-xs font-bold text-ink transition hover:bg-red-300 disabled:opacity-50"
                          onClick={() => removeQuiz(quiz.id)}
                          disabled={busy}
                        >
                          {busy ? "Deleting..." : "Delete"}
                        </button>
                        <button
                          type="button"
                          className="rounded-full px-3 py-1.5 text-xs font-bold text-white/60 transition hover:text-white"
                          onClick={() => setConfirmDelete(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn-secondary px-3 py-1.5 text-xs"
                          onClick={() => openEdit(quiz)}
                        >
                          <Pencil size={13} />
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn-secondary px-3 py-1.5 text-xs"
                          onClick={() => openAttempts(quiz)}
                        >
                          <Users size={13} />
                          Attempts
                        </button>
                        <button
                          type="button"
                          className="rounded-full px-3 py-1.5 text-xs font-semibold text-white/45 transition hover:text-red-300"
                          onClick={() => setConfirmDelete(quiz.id)}
                        >
                          <Trash2 size={13} className="mr-1 inline" />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {quiz.submittedAt ? (
                  <>
                    <p className="mt-5 rounded-lg bg-neon/10 p-3 font-bold text-neon">
                      Score: {quiz.score}/{quiz.maxScore}
                    </p>
                    <button
                      className="btn-secondary mt-3 w-full"
                      onClick={() =>
                        setReviewing({ quizId: quiz.id, title: quiz.title })
                      }
                    >
                      <ListChecks size={15} />
                      Review answers
                    </button>
                  </>
                ) : role === "student" ? (
                  upcoming ? (
                    <p className="mt-5 rounded-lg border border-line p-3 text-sm text-white/45">
                      Not open yet. You can start it from{" "}
                      {formatDate(quiz.startsAt)}.
                    </p>
                  ) : closed ? (
                    <p className="mt-5 rounded-lg border border-line p-3 text-sm text-white/45">
                      This quiz has closed.
                    </p>
                  ) : (
                    <>
                      <button className="btn mt-5" onClick={() => start(quiz)}>
                        <Play size={15} />
                        {inProgress ? "Resume quiz" : "Start quiz"}
                      </button>
                      {inProgress && quiz.startedAt && (
                        <p className="mt-2 text-xs text-neon">
                          In progress ·{" "}
                          {countdown(attemptDeadline(quiz, quiz.startedAt) - now)}{" "}
                          left
                        </p>
                      )}
                    </>
                  )
                ) : null}
              </Card>
            );
          })}
        </div>
      ) : (
        <Empty
          title="No quizzes yet"
          text="Available quizzes for this course will show here."
        />
      )}
      <Modal
        title={editing ? `Edit: ${editing.title}` : "Create an MCQ quiz"}
        open={open}
        onClose={closeCreate}
      >
        <Notice error={error} />
        <form className="space-y-4" onSubmit={create}>
          <Field label="Title">
            <input
              className="input"
              name="title"
              defaultValue={editing?.title}
              key={`title-${editing?.id ?? "new"}`}
              required
            />
          </Field>
          <Field label="Description">
            <textarea
              className="input"
              name="description"
              defaultValue={editing?.description}
              key={`desc-${editing?.id ?? "new"}`}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Starts">
              <input
                className="input"
                name="startsAt"
                type="datetime-local"
                defaultValue={
                  editing ? toLocalInput(editing.startsAt) : undefined
                }
                key={`starts-${editing?.id ?? "new"}`}
                required
              />
            </Field>
            <Field label="Ends">
              <input
                className="input"
                name="endsAt"
                type="datetime-local"
                defaultValue={editing ? toLocalInput(editing.endsAt) : undefined}
                key={`ends-${editing?.id ?? "new"}`}
                required
              />
            </Field>
          </div>
          <p className="rounded-lg border border-line bg-white/[.02] p-3 text-xs leading-5 text-white/45">
            Students may begin any time between the start and end above. The
            duration below is a personal countdown that begins when each student
            starts, and an attempt ends at whichever comes first.
          </p>
          <Field label="Duration in minutes">
            <input
              className="input"
              name="durationMinutes"
              type="number"
              min="1"
              defaultValue={editing ? editing.durationMinutes : 15}
              key={`duration-${editing?.id ?? "new"}`}
              required
            />
          </Field>
          {questionsLocked ? (
            <p className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-3 text-xs leading-5 text-amber-100">
              Students have already attempted this quiz, so its questions are
              locked. The title, description, schedule and duration above can
              still be changed. To rewrite the questions, reopen every attempt
              from the Attempts panel first.
            </p>
          ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="label mb-0">
                Questions ({questions.length})
              </p>
              <button
                type="button"
                className="btn-secondary px-3 py-1.5 text-xs"
                onClick={() =>
                  setQuestions((old) => [...old, blankQuestion()])
                }
              >
                <Plus size={14} />
                Add question
              </button>
            </div>

            {questions.map((question, index) => (
              <div className="rounded-xl border border-line p-4" key={index}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-neon">
                    Question {index + 1}
                  </p>
                  {questions.length > 1 && (
                    <button
                      type="button"
                      className="rounded-lg p-1.5 text-white/40 transition hover:bg-white/5 hover:text-red-300"
                      onClick={() =>
                        setQuestions((old) =>
                          old.filter((_, i) => i !== index),
                        )
                      }
                      aria-label={`Remove question ${index + 1}`}
                      title="Remove question"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                <input
                  className="input mb-3"
                  value={question.prompt}
                  onChange={(e) =>
                    patchQuestion(index, { prompt: e.target.value })
                  }
                  placeholder={`Question ${index + 1}`}
                  aria-label={`Question ${index + 1} prompt`}
                  required
                />

                <p className="mb-2 text-xs text-white/40">
                  Fill in all four answers, then select the correct one.
                </p>
                <div className="space-y-2">
                  {question.options.map((option, optionIndex) => {
                    const correct = question.correctIndex === optionIndex;
                    return (
                      <div
                        key={optionIndex}
                        className={`flex items-center gap-3 rounded-lg border p-2 transition ${correct ? "border-neon bg-neon/10" : "border-line"}`}
                      >
                        <input
                          type="radio"
                          name={`correct-${index}`}
                          checked={correct}
                          onChange={() =>
                            patchQuestion(index, { correctIndex: optionIndex })
                          }
                          className="h-4 w-4 shrink-0 accent-[#55f991]"
                          aria-label={`Mark answer ${optionIndex + 1} as correct for question ${index + 1}`}
                        />
                        <input
                          className="input"
                          value={option}
                          onChange={(e) =>
                            patchOption(index, optionIndex, e.target.value)
                          }
                          placeholder={`Answer ${optionIndex + 1}`}
                          aria-label={`Question ${index + 1} answer ${optionIndex + 1}`}
                          required
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <span className="text-xs text-white/40">Marks</span>
                  <input
                    className="input w-24"
                    type="number"
                    min="1"
                    value={question.points}
                    onChange={(e) =>
                      patchQuestion(index, {
                        points: Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                    aria-label={`Marks for question ${index + 1}`}
                  />
                </div>
              </div>
            ))}
          </div>

          )}

          <button className="btn w-full" disabled={saving}>
            {saving
              ? "Saving..."
              : editing
                ? "Save changes"
                : `Create quiz with ${questions.length} question${questions.length === 1 ? "" : "s"}`}
          </button>
        </form>
      </Modal>

      {reviewing && (
        <QuizReview
          quizId={reviewing.quizId}
          studentId={reviewing.studentId}
          title={reviewing.title}
          onClose={() => setReviewing(null)}
        />
      )}

      <Modal
        title={attemptsFor ? `Attempts: ${attemptsFor.title}` : "Attempts"}
        open={Boolean(attemptsFor)}
        onClose={() => {
          setAttemptsFor(null);
          setAttempts([]);
        }}
      >
        <Notice error={error} />
        {attempts.length ? (
          <div className="space-y-3">
            {attempts.map((attempt) => (
              <div
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-4"
                key={attempt.id}
              >
                <div className="min-w-0">
                  <p className="font-bold">{attempt.studentName}</p>
                  <p className="mt-1 truncate text-xs text-white/35">
                    {attempt.email}
                  </p>
                  <p className="mt-2 text-xs text-white/45">
                    {attempt.submittedAt
                      ? `Submitted ${formatDate(attempt.submittedAt)} · ${attempt.score}/${attempt.maxScore}`
                      : `In progress since ${formatDate(attempt.startedAt)}`}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {attempt.submittedAt && (
                    <button
                      type="button"
                      className="btn-secondary px-3 py-1.5 text-xs"
                      onClick={() =>
                        attemptsFor &&
                        setReviewing({
                          quizId: attemptsFor.id,
                          title: `${attempt.studentName} - ${attemptsFor.title}`,
                          studentId: attempt.studentId,
                        })
                      }
                      title="See how this student answered"
                    >
                      <ListChecks size={13} />
                      Review
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-secondary px-3 py-1.5 text-xs"
                    onClick={() =>
                      attemptsFor &&
                      reopenAttempt(attemptsFor.id, attempt.studentId)
                    }
                    disabled={busy}
                    title="Clear this attempt so the student can sit the quiz again"
                  >
                    <RotateCcw size={13} />
                    Reopen
                  </button>
                </div>
              </div>
            ))}
            <p className="pt-1 text-xs leading-5 text-white/35">
              Reopening clears the student&apos;s attempt and score. They can
              start again from scratch while the quiz is still open.
            </p>
          </div>
        ) : (
          <Empty
            title="No attempts yet"
            text="Students who start this quiz will appear here."
          />
        )}
      </Modal>
    </>
  );
}
