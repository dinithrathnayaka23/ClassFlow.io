"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  ExternalLink,
  FileText,
  Link as LinkIcon,
  Pencil,
  Plus,
  Radio,
  Trash2,
  Video,
} from "lucide-react";
import { api } from "@/lib/api";
import { Empty, Notice, SectionTitle } from "@/components/ui";
import { CoursePicker, Field, JoinCourseNotice, Modal, formatDate, useCourses } from "./shared";

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
  const { courses, loading: coursesLoading } = useCourses();
  const [courseId, setCourseId] = useState<number>();
  const [items, setItems] = useState<Material[]>([]);
  const [open, setOpen] = useState(false);
  // The material the dialog is editing; null while it is adding a new one.
  const [editing, setEditing] = useState<Material | null>(null);
  const [type, setType] = useState("LINK");
  const [error, setError] = useState("");
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rowError, setRowError] = useState("");
  useEffect(() => {
    if (!courseId && courses[0]) setCourseId(courses[0].id);
  }, [courses, courseId]);
  const load = () =>
    courseId &&
    api<Material[]>(`/materials?courseId=${courseId}`).then(setItems);
  useEffect(() => {
    load();
  }, [courseId]);

  const course = courses.find((c) => c.id === courseId);
  // The server refuses changes to an archived course, so do not offer them.
  const canManage = role !== "student" && course?.active !== false;

  function openDialog(material: Material | null) {
    setEditing(material);
    setType(material?.type || "LINK");
    setError("");
    setConfirmId(null);
    setOpen(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    form.set("type", type);
    // An empty file input still submits a part, which would read as a replacement.
    const file = form.get("file");
    if (file instanceof File && !file.size) form.delete("file");
    try {
      if (editing) {
        await api(`/materials/${editing.id}`, { method: "PATCH", body: form });
      } else {
        form.set("courseId", String(courseId));
        await api("/materials", { method: "POST", body: form });
      }
      setOpen(false);
      load();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : editing
            ? "Could not update material"
            : "Could not add material",
      );
    }
  }

  async function remove(id: number) {
    setRowError("");
    setBusyId(id);
    try {
      await api(`/materials/${id}`, { method: "DELETE" });
      setConfirmId(null);
      load();
    } catch (e) {
      setRowError(
        e instanceof Error ? e.message : "Could not delete the material",
      );
    } finally {
      setBusyId(null);
    }
  }

  // Nothing here exists for a student until they join a course, and the API refuses
  // it all in the meantime. Explain the empty screen rather than showing bare controls.
  if (role === "student" && !coursesLoading && !courses.length) {
    return (
      <>
        <SectionTitle eyebrow={"Course library"} title={"Materials"} />
        <JoinCourseNotice role={role} what={"materials"} />
      </>
    );
  }

  return (
    <>
      <SectionTitle
        eyebrow="Course library"
        title="Materials"
        action={
          canManage ? (
            <button className="btn" onClick={() => openDialog(null)}>
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
      <Notice error={rowError} />
      {items.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => {
            const Icon = icons[item.type as keyof typeof icons] || FileText;
            return (
              <div
                className="card group flex flex-col transition hover:border-neon/40"
                key={item.id}
              >
                <a
                  className="block flex-1"
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
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
                </a>
                {confirmId === item.id ? (
                  <div className="mt-5 flex flex-wrap items-center gap-2 rounded-lg border border-red-400/30 bg-red-400/10 p-3">
                    <p className="mr-1 text-sm text-red-200">
                      Delete this material?
                    </p>
                    <button
                      type="button"
                      className="rounded-full bg-red-400/90 px-3 py-1.5 text-xs font-bold text-ink transition hover:bg-red-300 disabled:opacity-50"
                      onClick={() => remove(item.id)}
                      disabled={busyId === item.id}
                    >
                      {busyId === item.id ? "Deleting..." : "Delete"}
                    </button>
                    <button
                      type="button"
                      className="rounded-full px-3 py-1.5 text-xs font-bold text-white/60 transition hover:text-white"
                      onClick={() => setConfirmId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="mt-5 flex items-center justify-between gap-2 border-t border-line pt-4">
                    <p className="text-xs text-white/30">
                      Added by {item.createdByName}
                    </p>
                    {canManage && (
                      <div className="-my-2 flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          className="rounded-lg p-2 text-white/40 transition hover:bg-white/5 hover:text-neon"
                          onClick={() => openDialog(item)}
                          aria-label={`Edit material: ${item.title}`}
                          title="Edit material"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          className="rounded-lg p-2 text-white/40 transition hover:bg-white/5 hover:text-red-300"
                          onClick={() => {
                            setRowError("");
                            setConfirmId(item.id);
                          }}
                          aria-label={`Delete material: ${item.title}`}
                          title="Delete material"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
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
        title={editing ? "Edit course material" : "Add course material"}
        open={open}
        onClose={() => setOpen(false)}
      >
        <Notice error={error} />
        {/* Keyed so the uncontrolled inputs pick up the material being edited. */}
        <form
          className="space-y-4"
          onSubmit={save}
          key={editing?.id ?? "new"}
        >
          <Field label="Title">
            <input
              className="input"
              name="title"
              defaultValue={editing?.title}
              required
            />
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
              {/* A file material keeps its current file unless a new one is chosen. */}
              {editing?.type === "FILE" && (
                <p className="mb-2 text-xs text-white/40">
                  Current file: {editing.fileName || "uploaded file"}. Choose a
                  new one only to replace it.
                </p>
              )}
              <input
                className="input"
                name="file"
                type="file"
                required={editing?.type !== "FILE"}
              />
            </Field>
          ) : (
            <Field label="URL">
              <input
                className="input"
                name="url"
                type="url"
                defaultValue={editing?.type !== "FILE" ? editing?.url : ""}
                required
              />
            </Field>
          )}
          <button className="btn w-full">
            {editing ? "Save changes" : "Add material"}
          </button>
        </form>
      </Modal>
    </>
  );
}
