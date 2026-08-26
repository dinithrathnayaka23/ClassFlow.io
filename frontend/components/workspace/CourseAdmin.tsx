"use client";

import { FormEvent, useState } from "react";
import { Archive, ArchiveRestore, Pencil, Trash2 } from "lucide-react";
import { api, Course } from "@/lib/api";
import { Notice } from "@/components/ui";
import { Field } from "./shared";

export type Teacher = { id: number; fullName: string };

/** What deleting a course destroys, straight from the server rather than guessed at. */
type DeletionImpact = {
  students: number;
  lessons: number;
  materials: number;
  assignments: number;
  submissions: number;
  quizzes: number;
  quizAttempts: number;
  forumTopics: number;
};

/** Renders "3 lessons, 2 assignments and 4 submissions", skipping anything that is zero. */
function describe(impact: DeletionImpact) {
  const parts: string[] = [];
  const add = (count: number, one: string, many: string) => {
    if (count > 0) parts.push(`${count} ${count === 1 ? one : many}`);
  };
  add(impact.students, "enrolled student", "enrolled students");
  add(impact.lessons, "lesson", "lessons");
  add(impact.materials, "material", "materials");
  add(impact.assignments, "assignment", "assignments");
  add(impact.submissions, "submission", "submissions");
  add(impact.quizzes, "quiz", "quizzes");
  add(impact.quizAttempts, "quiz attempt", "quiz attempts");
  add(impact.forumTopics, "forum topic", "forum topics");
  if (!parts.length) return "This course is empty.";
  const last = parts.pop();
  return `This permanently removes ${parts.length ? `${parts.join(", ")} and ${last}` : last}.`;
}

/**
 * The admin-only controls on a course page: rename it, hand it to a different teacher,
 * archive it, or delete it outright. Archiving is offered first because it is the
 * reversible option and is what most "remove this course" intentions actually want.
 */
export function CourseAdminPanel({
  course,
  teachers,
  onChanged,
  onDeleted,
}: {
  course: Course;
  teachers: Teacher[];
  onChanged: () => Promise<void> | void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [impact, setImpact] = useState<DeletionImpact | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setError("");
    setBusy(true);
    try {
      await api(`/courses/${course.id}`, {
        method: "PATCH",
        body: JSON.stringify(values),
      });
      await onChanged();
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the course");
    } finally {
      setBusy(false);
    }
  }

  async function setActive(active: boolean) {
    setError("");
    setBusy(true);
    try {
      await api(`/courses/${course.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ active }),
      });
      await onChanged();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : `Could not ${active ? "restore" : "archive"} the course`,
      );
    } finally {
      setBusy(false);
    }
  }

  /** Loads the impact first so the confirmation states real numbers, not a generic warning. */
  async function startDelete() {
    setError("");
    setBusy(true);
    try {
      setImpact(await api<DeletionImpact>(`/courses/${course.id}/impact`));
      setConfirming(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not check what this would delete",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setError("");
    setBusy(true);
    try {
      await api(`/courses/${course.id}`, { method: "DELETE" });
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the course");
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel p-5">
      <h3 className="font-black">Manage course</h3>
      <Notice error={error} />

      {!course.active && (
        <p className="mt-4 rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-sm text-amber-200">
          This course is archived. It is hidden from its teacher and students, and
          cannot take new content until it is restored.
        </p>
      )}

      {editing ? (
        <form className="mt-4 space-y-4" onSubmit={save}>
          <Field label="Course title">
            <input
              className="input"
              name="title"
              defaultValue={course.title}
              required
            />
          </Field>
          <Field label="Subject">
            <input
              className="input"
              name="subject"
              defaultValue={course.subject}
              required
            />
          </Field>
          <Field label="Teacher">
            <select
              className="input"
              name="teacherId"
              defaultValue={course.teacherId}
            >
              {/* An archived or demoted teacher would not be in the list, so the
                  current holder is added explicitly to avoid a silent reassign. */}
              {!teachers.some((one) => one.id === course.teacherId) && (
                <option value={course.teacherId}>
                  {course.teacherName} (current)
                </option>
              )}
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.fullName}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Description">
            <textarea
              className="input"
              name="description"
              rows={3}
              defaultValue={course.description}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <button className="btn" disabled={busy}>
              {busy ? "Saving..." : "Save changes"}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setEditing(false);
                setError("");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : confirming && impact ? (
        <div className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 p-4">
          <p className="text-sm font-bold text-red-200">
            Delete {course.code}?
          </p>
          <p className="mt-1 text-sm leading-6 text-red-200/70">
            {describe(impact)} Uploaded files go with it. This cannot be undone —
            archive the course instead to keep the work.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-full bg-red-400/90 px-4 py-2 text-sm font-bold text-ink transition hover:bg-red-300 disabled:opacity-50"
              disabled={busy}
              onClick={remove}
            >
              {busy ? "Deleting..." : "Delete permanently"}
            </button>
            <button
              type="button"
              className="rounded-full px-4 py-2 text-sm font-bold text-white/60 transition hover:text-white"
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          <p className="text-sm text-white/40">
            Taught by <span className="text-white/70">{course.teacherName}</span>
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              className="btn-secondary"
              disabled={busy || !course.active}
              title={
                course.active
                  ? undefined
                  : "Restore the course before editing it"
              }
              onClick={() => setEditing(true)}
            >
              <Pencil size={15} />
              Edit
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={busy}
              onClick={() => setActive(!course.active)}
            >
              {course.active ? (
                <Archive size={15} />
              ) : (
                <ArchiveRestore size={15} />
              )}
              {course.active ? "Archive" : "Restore"}
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-red-400/30 px-4 py-2.5 text-sm font-semibold text-red-300 transition hover:bg-red-400/10 disabled:opacity-50"
              disabled={busy}
              onClick={startDelete}
            >
              <Trash2 size={15} />
              Delete
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
