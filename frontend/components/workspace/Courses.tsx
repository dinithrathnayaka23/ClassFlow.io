"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Plus,
  Users as UsersIcon,
} from "lucide-react";
import { api, Course } from "@/lib/api";
import { Card, Empty, Notice, SectionTitle } from "@/components/ui";
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
  const { courses, reload } = useCourses();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const course = courses.find((item) => item.id === courseId);
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
    const form = new FormData(event.currentTarget);
    await api(`/courses/${courseId}/lessons`, {
      method: "POST",
      body: JSON.stringify({
        ...Object.fromEntries(form),
        position: lessons.length + 1,
      }),
    });
    setLessons(await api(`/courses/${courseId}/lessons`));
    event.currentTarget.reset();
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
            <div className="mt-5 space-y-3">
              {lessons.map((lesson, index) => (
                <div className="card flex gap-4" key={lesson.id}>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-neon/10 text-xs font-black text-neon">
                    {index + 1}
                  </span>
                  <div>
                    <p className="font-bold">{lesson.title}</p>
                    <p className="mt-1 text-sm text-white/40">
                      {lesson.description}
                    </p>
                  </div>
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
            {role !== "student" && (
              <form className="panel space-y-4 p-5" onSubmit={addLesson}>
                <h3 className="font-black">Add lesson</h3>
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
                <div className="flex items-center justify-between">
                  <span className="badge">{course.code}</span>
                  <ArrowRight size={17} className="text-white/25" />
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
          title="No courses available"
          text="New courses will show here."
        />
      )}
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
          <Field label="Description">
            <textarea className="input" name="description" rows={4} />
          </Field>
          <button className="btn w-full">Create course</button>
        </form>
      </Modal>
    </>
  );
}
