"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  ExternalLink,
  FileText,
  Link as LinkIcon,
  Plus,
  Radio,
  Video,
} from "lucide-react";
import { api } from "@/lib/api";
import { Empty, Notice, SectionTitle } from "@/components/ui";
import { CoursePicker, Field, Modal, formatDate, useCourses } from "./shared";

type Material = {
  id: number;
  title: string;
  type: string;
  url: string;
  fileName?: string;
  createdByName: string;
  createdAt: string;
};
const icons = {
  FILE: FileText,
  LINK: LinkIcon,
  VIDEO: Video,
  LIVE_CLASS: Radio,
};

export function Materials({ role }: { role: string }) {
  const { courses } = useCourses();
  const [courseId, setCourseId] = useState<number>();
  const [items, setItems] = useState<Material[]>([]);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("LINK");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!courseId && courses[0]) setCourseId(courses[0].id);
  }, [courses, courseId]);
  const load = () =>
    courseId &&
    api<Material[]>(`/materials?courseId=${courseId}`).then(setItems);
  useEffect(() => {
    load();
  }, [courseId]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    form.set("courseId", String(courseId));
    form.set("type", type);
    try {
      await api("/materials", { method: "POST", body: form });
      setOpen(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add material");
    }
  }
  return (
    <>
      <SectionTitle
        eyebrow="Course library"
        title="Materials"
        action={
          role !== "student" ? (
            <button className="btn" onClick={() => setOpen(true)}>
              <Plus size={16} />
              Add material
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
      {items.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => {
            const Icon = icons[item.type as keyof typeof icons] || FileText;
            return (
              <a
                className="card group transition hover:border-neon/40"
                href={item.url}
                target="_blank"
                rel="noreferrer"
                key={item.id}
              >
                <div className="flex items-center justify-between">
                  <span className="grid h-10 w-10 place-items-center rounded-lg bg-neon/10 text-neon">
                    <Icon size={18} />
                  </span>
                  <ExternalLink
                    size={16}
                    className="text-white/20 group-hover:text-neon"
                  />
                </div>
                <h2 className="mt-6 font-black">{item.title}</h2>
                <p className="mt-2 text-xs text-white/35">
                  {item.type.replace("_", " ")} · {formatDate(item.createdAt)}
                </p>
                <p className="mt-5 border-t border-line pt-4 text-xs text-white/30">
                  Added by {item.createdByName}
                </p>
              </a>
            );
          })}
        </div>
      ) : (
        <Empty
          title="No materials yet"
          text="Notes, videos and class links for this course will appear here."
        />
      )}
      <Modal
        title="Add course material"
        open={open}
        onClose={() => setOpen(false)}
      >
        <Notice error={error} />
        <form className="space-y-4" onSubmit={create}>
          <Field label="Title">
            <input className="input" name="title" required />
          </Field>
          <Field label="Type">
            <select
              className="input"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="LINK">External link</option>
              <option value="VIDEO">Video</option>
              <option value="LIVE_CLASS">Live class</option>
              <option value="FILE">File upload</option>
            </select>
          </Field>
          {type === "FILE" ? (
            <Field label="File">
              <input className="input" name="file" type="file" required />
            </Field>
          ) : (
            <Field label="URL">
              <input className="input" name="url" type="url" required />
            </Field>
          )}
          <button className="btn w-full">Add material</button>
        </form>
      </Modal>
    </>
  );
}
