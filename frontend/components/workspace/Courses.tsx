"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Pencil,
  Plus,
  Trash2,
  Users as UsersIcon,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { api, Course, Page } from "@/lib/api";
import { Card, Empty, Notice, SectionTitle } from "@/components/ui";
import { CourseAdminPanel, Teacher } from "./CourseAdmin";
import { CourseCatalogue } from "./CourseCatalogue";
import { EnrollmentRequests } from "./EnrollmentRequests";
import { Field, Modal, useCourses } from "./shared";

type Lesson = {
  id: number;
  title: string;
  description: string;
  position: number;
};

export function Courses({
  role,
  courseId,
}: {
  role: string;
  courseId?: number;
}) {
  const router = useRouter();
  const { courses, reload } = useCourses();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [lessons, setLessons] = useState<Lesson[]>([]);
  // Separate from the create-course error so the two forms cannot show each other's messages.
  const [lessonError, setLessonError] = useState("");
  // Edit/delete report next to the list; addLesson reports inside its own form.
  const [rowError, setRowError] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  // A course is run by a teacher, so an admin has to name one. Teachers create
  // their own courses and never see this list.
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const course = courses.find((item) => item.id === courseId);
  useEffect(() => {
    if (role !== "admin") return;
    api<Page<Teacher>>("/users?role=TEACHER&size=100").then((data) =>
      setTeachers(data.items),
    );
  }, [role]);
  useEffect(() => {
    if (courseId)
      api<Lesson[]>(`/courses/${courseId}/lessons`).then(setLessons);
  }, [courseId]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api("/courses", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(form)),
      });
      setOpen(false);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create course");
    }
  }
  async function addLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Hold the element itself: React clears currentTarget once the handler's
    // synchronous phase ends, so it is null by the time the awaits below resolve.
    const formElement = event.currentTarget;
    const values = new FormData(formElement);
    setLessonError("");
    try {
      await api(`/courses/${courseId}/lessons`, {
        method: "POST",
        body: JSON.stringify({
          ...Object.fromEntries(values),
          position: lessons.length + 1,
        }),
      });
      setLessons(await api(`/courses/${courseId}/lessons`));
      formElement.reset();
    } catch (e) {
      setLessonError(
        e instanceof Error ? e.message : "Could not add the lesson",
      );
    }
  }

  async function saveLesson(event: FormEvent<HTMLFormElement>, id: number) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const values = Object.fromEntries(new FormData(formElement));
    setRowError("");
    setBusyId(id);
    try {
      await api(`/courses/${courseId}/lessons/${id}`, {
        method: "PATCH",
        body: JSON.stringify(values),
      });
      setLessons(await api(`/courses/${courseId}/lessons`));
      setEditingId(null);
    } catch (e) {
      setRowError(
        e instanceof Error ? e.message : "Could not update the lesson",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function removeLesson(id: number) {
    setRowError("");
    setBusyId(id);
    try {
      await api(`/courses/${courseId}/lessons/${id}`, { method: "DELETE" });
      setLessons(await api(`/courses/${courseId}/lessons`));
      setConfirmId(null);
    } catch (e) {
      setRowError(
        e instanceof Error ? e.message : "Could not delete the lesson",
      );
    } finally {
      setBusyId(null);
    }
  }
  if (courseId)
    return (
      <>
        <Link
          className="mb-5 inline-flex items-center gap-2 text-sm text-white/45 hover:text-neon"
          href={`/${role}/courses`}
        >
          <ArrowLeft size={15} />
          All courses
        </Link>
        <SectionTitle
          eyebrow={course?.code || "Course"}
          title={course?.title || "Course details"}
        />
        <div className="grid gap-6 lg:grid-cols-[1fr_.45fr]">
          <section className="panel p-6">
            <h2 className="font-black">Lesson plan</h2>
            <Notice error={rowError} />
            <div className="mt-5 space-y-3">
              {lessons.map((lesson, index) => (
                <div className="card" key={lesson.id}>
                  {editingId === lesson.id ? (
                    <form
                      className="space-y-3"
                      onSubmit={(event) => saveLesson(event, lesson.id)}
                    >
                      <input
                        className="input"
                        name="title"
                        defaultValue={lesson.title}
                        aria-label="Lesson title"
                        required
                      />
                      <textarea
                        className="input"
                        name="description"
                        rows={3}
                        defaultValue={lesson.description}
                        aria-label="Lesson description"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button className="btn" disabled={busyId === lesson.id}>
                          <Check size={15} />
                          {busyId === lesson.id ? "Saving..." : "Save"}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => setEditingId(null)}
                        >
                          <X size={15} />
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex gap-4">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-neon/10 text-xs font-black text-neon">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold">{lesson.title}</p>
                        {lesson.description && (
                          <p className="mt-1 text-sm text-white/40">
                            {lesson.description}
                          </p>
                        )}
                        {confirmId === lesson.id && (
                          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-red-400/30 bg-red-400/10 p-3">
                            <p className="mr-1 text-sm text-red-200">
                              Delete this lesson?
                            </p>
                            <button
                              type="button"
                              className="rounded-full bg-red-400/90 px-3 py-1.5 text-xs font-bold text-ink transition hover:bg-red-300 disabled:opacity-50"
                              onClick={() => removeLesson(lesson.id)}
                              disabled={busyId === lesson.id}
                            >
                              {busyId === lesson.id ? "Deleting..." : "Delete"}
                            </button>
                            <button
                              type="button"
                              className="rounded-full px-3 py-1.5 text-xs font-bold text-white/60 transition hover:text-white"
                              onClick={() => setConfirmId(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                      {role !== "student" &&
                        course?.active !== false &&
                        confirmId !== lesson.id && (
                        <div className="flex shrink-0 items-start gap-1">
                          <button
                            type="button"
                            className="rounded-lg p-2 text-white/40 transition hover:bg-white/5 hover:text-neon"
                            onClick={() => {
                              setConfirmId(null);
                              setEditingId(lesson.id);
                            }}
                            aria-label={`Edit lesson: ${lesson.title}`}
                            title="Edit lesson"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            className="rounded-lg p-2 text-white/40 transition hover:bg-white/5 hover:text-red-300"
                            onClick={() => {
                              setEditingId(null);
                              setConfirmId(lesson.id);
                            }}
                            aria-label={`Delete lesson: ${lesson.title}`}
                            title="Delete lesson"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {!lessons.length && (
                <Empty
                  title="No lessons yet"
                  text="The lesson plan will appear here."
                />
              )}
            </div>
          </section>
          <aside className="space-y-4">
            <Card>
              <BookOpen className="text-neon" />
              <p className="mt-5 font-bold">{course?.subject}</p>
              <p className="mt-2 text-sm leading-6 text-white/40">
                {course?.description}
              </p>
            </Card>
            {role !== "student" && courseId && (
              <EnrollmentRequests courseId={courseId} onDecided={reload} />
            )}
            {role === "admin" && course && (
              <CourseAdminPanel
                course={course}
                teachers={teachers}
                onChanged={reload}
                onDeleted={() => router.replace(`/${role}/courses`)}
              />
            )}
            {role !== "student" && course?.active !== false && (
              <form className="panel space-y-4 p-5" onSubmit={addLesson}>
                <h3 className="font-black">Add lesson</h3>
                <Notice error={lessonError} />
                <input
                  className="input"
                  name="title"
                  placeholder="Lesson title"
                  required
                />
                <textarea
                  className="input"
                  name="description"
                  placeholder="What will be covered?"
                />
                <button className="btn w-full">Add to plan</button>
              </form>
            )}
          </aside>
        </div>
      </>
    );
  return (
    <>
      <SectionTitle
        eyebrow="Learning spaces"
        title="Courses"
        action={
          role !== "student" ? (
            <button className="btn" onClick={() => setOpen(true)}>
              <Plus size={16} />
              New course
            </button>
          ) : undefined
        }
      />
      {courses.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {courses.map((course) => (
            <Link href={`/${role}/courses/${course.id}`} key={course.id}>
              <Card className="h-full transition hover:-translate-y-1 hover:border-neon/35">
                <div className="flex items-center justify-between gap-2">
                  <span className="badge">{course.code}</span>
                  <div className="flex items-center gap-2">
                    {!course.active && (
                      <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-200">
                        Archived
                      </span>
                    )}
                    <ArrowRight size={17} className="text-white/25" />
                  </div>
                </div>
                <h2 className="mt-6 text-xl font-black">{course.title}</h2>
                <p className="mt-3 line-clamp-2 text-sm leading-6 text-white/40">
                  {course.description}
                </p>
                <div className="mt-7 flex items-center justify-between border-t border-line pt-4 text-xs text-white/35">
                  <span>{course.teacherName}</span>
                  <span className="flex items-center gap-1">
                    <UsersIcon size={13} />
                    {course.studentCount}
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Empty
          title={
            role === "student" ? "You have not joined a course yet" : "No courses available"
          }
          text={
            role === "student"
              ? "Ask to join one below. Once its teacher approves, its materials, assignments, quizzes and forum open up."
              : "New courses will show here."
          }
        />
      )}
      {/* The catalogue renders nothing when there is nothing left to join. */}
      {role === "student" && <CourseCatalogue onEnrolled={reload} />}
      <Modal title="Create a course" open={open} onClose={() => setOpen(false)}>
        <Notice error={error} />
        <form className="space-y-4" onSubmit={create}>
          <Field label="Course title">
            <input className="input" name="title" required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Course code">
              <input className="input" name="code" required />
            </Field>
            <Field label="Subject">
              <input className="input" name="subject" required />
            </Field>
          </div>
          {role === "admin" && (
            <Field label="Teacher">
              <select className="input" name="teacherId" required defaultValue="">
                <option value="" disabled>
                  Choose a teacher
                </option>
                {teachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.fullName}
                  </option>
                ))}
              </select>
              {!teachers.length && (
                <p className="mt-2 text-xs text-white/35">
                  No active teachers yet. Add one from the Teachers page first.
                </p>
              )}
            </Field>
          )}
          <Field label="Description">
            <textarea className="input" name="description" rows={4} />
          </Field>
          <button className="btn w-full">Create course</button>
        </form>
      </Modal>
    </>
  );
}
