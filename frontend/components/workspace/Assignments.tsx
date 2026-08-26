"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Download,
  FileCheck2,
  Info,
  Plus,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { Card, Empty, Notice, SectionTitle } from "@/components/ui";
import { CoursePicker, Field, JoinCourseNotice, Modal, formatDate, useCourses } from "./shared";

type Assignment = {
  id: number;
  title: string;
  description: string;
  deadline: string;
  attachmentUrl?: string;
  attachmentName?: string;
  submissionStatus?: string;
  mark?: number;
  feedback?: string;
  submissionId?: number;
  submittedAt?: string;
  submissionFiles: SubmissionFile[];
};

type SubmissionFile = {
  id: number;
  fileName: string;
  contentType?: string;
  sizeBytes?: number;
  uploadedAt: string;
};

type UploadLimits = { maxFileBytes: number; maxFilesPerSubmission: number };

function formatBytes(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
type Submission = {
  id: number;
  studentName: string;
  status: string;
  submittedAt: string;
  mark?: number;
  feedback?: string;
  files: SubmissionFile[];
};

/**
 * The student's own side of an assignment: the files they have handed in, and the means to
 * add or remove them.
 *
 * Uploading adds to the set rather than replacing it, so several files can be handed in at
 * once or over time. Once a mark is recorded the work is settled - the server refuses both
 * operations - so the controls give way to the grade.
 */
function StudentSubmission({
  assignment,
  busy,
  error,
  onSubmit,
  onRemoveFile,
  limits,
}: {
  assignment: Assignment;
  busy: boolean;
  error?: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRemoveFile: (file: SubmissionFile) => void;
  limits?: UploadLimits;
}) {
  const [adding, setAdding] = useState(false);
  const files = assignment.submissionFiles ?? [];
  const submitted = files.length > 0;
  const graded = assignment.submissionStatus === "GRADED";

  return (
    <div className="min-w-64 space-y-3 md:max-w-xs">
      {/* Stated up front, not only inside the upload form, so the allowance is known
          before a file is chosen rather than after a long upload is refused. */}
      {limits && !graded && (
        <p className="flex items-center gap-1.5 rounded-lg border border-line bg-white/[.02] px-3 py-2 text-[11px] text-white/45">
          <Info size={12} className="shrink-0 text-neon" />
          Max {formatBytes(limits.maxFileBytes)} per file · up to{" "}
          {limits.maxFilesPerSubmission} files
        </p>
      )}
      {submitted && (
        <div className="rounded-xl border border-line bg-white/[.02] p-4">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-neon">
            <FileCheck2 size={14} />
            {graded ? "Marked" : "Submitted"}
            <span className="ml-auto font-normal normal-case tracking-normal text-white/30">
              {files.length} {files.length === 1 ? "file" : "files"}
            </span>
          </p>

          <ul className="mt-3 space-y-2">
            {files.map((one) => (
              <li key={one.id} className="flex items-center gap-2">
                <a
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-line px-3 py-2 transition hover:border-neon/35"
                  href={`/api/assignments/submissions/files/${one.id}`}
                >
                  <Download size={14} className="shrink-0 text-neon" />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">
                    {one.fileName}
                  </span>
                  {one.sizeBytes ? (
                    <span className="shrink-0 text-[10px] text-white/30">
                      {formatBytes(one.sizeBytes)}
                    </span>
                  ) : null}
                </a>
                {/* The last file cannot go: a submission with nothing in it is not a
                    submission, so the server refuses it too. */}
                {!graded && files.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Remove ${one.fileName}`}
                    title="Remove this file"
                    className="shrink-0 rounded-lg p-2 text-white/35 transition hover:bg-white/5 hover:text-red-300 disabled:opacity-40"
                    disabled={busy}
                    onClick={() => onRemoveFile(one)}
                  >
                    <X size={15} />
                  </button>
                )}
              </li>
            ))}
          </ul>

          {assignment.submittedAt && (
            <p className="mt-3 text-[11px] text-white/30">
              Last updated {formatDate(assignment.submittedAt)}
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-200">
          {error}
        </p>
      )}

      {graded ? (
        <p className="text-[11px] leading-5 text-white/30">
          This work has been marked, so it can no longer be changed.
        </p>
      ) : submitted && !adding ? (
        <button
          type="button"
          className="btn-secondary w-full"
          onClick={() => setAdding(true)}
        >
          <RefreshCw size={15} />
          Add or change files
        </button>
      ) : (
        <form className="space-y-3" onSubmit={onSubmit}>
          <input
            className="input text-xs"
            type="file"
            name="file"
            multiple
            required
          />
          <p className="text-[11px] leading-4 text-white/30">
            Pick one file or several at once.
          </p>
          <button className="btn w-full" disabled={busy}>
            <Upload size={15} />
            {busy ? "Uploading..." : submitted ? "Add files" : "Submit work"}
          </button>
          {submitted && (
            <button
              type="button"
              className="w-full rounded-full px-3 py-1.5 text-xs font-bold text-white/50 transition hover:text-white"
              onClick={() => setAdding(false)}
            >
              Cancel
            </button>
          )}
        </form>
      )}
    </div>
  );
}

export function Assignments({
  role,
  submissionsOnly = false,
}: {
  role: string;
  submissionsOnly?: boolean;
}) {
  const { courses, loading: coursesLoading } = useCourses();
  const [courseId, setCourseId] = useState<number>();
  const [items, setItems] = useState<Assignment[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [submissions, setSubmissions] = useState<Record<number, Submission[]>>(
    {},
  );
  const [submittingId, setSubmittingId] = useState<number | null>(null);
  const [submitErrors, setSubmitErrors] = useState<Record<number, string>>({});
  // Advertised by the server so the figure shown always matches what it enforces.
  const [limits, setLimits] = useState<UploadLimits>();
  useEffect(() => {
    api<UploadLimits>("/assignments/limits").then(setLimits).catch(() => {});
  }, []);
  useEffect(() => {
    if (!courseId && courses[0]) setCourseId(courses[0].id);
  }, [courses, courseId]);
  const load = () =>
    courseId &&
    api<Assignment[]>(`/assignments?courseId=${courseId}`).then(setItems);
  useEffect(() => {
    load();
  }, [courseId]);
  useEffect(() => {
    if (submissionsOnly && items.length)
      items.forEach((item) =>
        api<Submission[]>(`/assignments/${item.id}/submissions`).then((rows) =>
          setSubmissions((old) => ({ ...old, [item.id]: rows })),
        ),
      );
  }, [submissionsOnly, items]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formElement = event.currentTarget;
    const values = new FormData(formElement);
    // Multipart, not JSON: the brief is an uploaded file.
    values.set("courseId", String(courseId));
    values.set(
      "deadline",
      new Date(String(values.get("deadline"))).toISOString(),
    );
    // An empty file input still appends a zero-byte entry, which the server
    // would treat as a real upload attempt.
    const chosen = values.get("file");
    if (chosen instanceof File && chosen.size === 0) values.delete("file");
    try {
      await api("/assignments", { method: "POST", body: values });
      setOpen(false);
      formElement.reset();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create assignment");
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>, id: number) {
    event.preventDefault();
    const form = event.currentTarget;
    setSubmitErrors((current) => ({ ...current, [id]: "" }));

    const picked = new FormData(form).getAll("file").filter(
      (one): one is File => one instanceof File && one.size > 0,
    );
    const cap = limits?.maxFileBytes;
    const tooBig = cap ? picked.filter((one) => one.size > cap) : [];
    if (tooBig.length) {
      setSubmitErrors((current) => ({
        ...current,
        [id]: `${tooBig.map((one) => one.name).join(", ")} ${
          tooBig.length === 1 ? "is" : "are"
        } larger than the ${formatBytes(cap)} limit.`,
      }));
      return;
    }

    setSubmittingId(id);
    try {
      await api(`/assignments/${id}/submissions`, {
        method: "POST",
        body: new FormData(form),
      });
      form.reset();
      await load();
    } catch (e) {
      setSubmitErrors((current) => ({
        ...current,
        [id]: e instanceof Error ? e.message : "Could not upload your work",
      }));
    } finally {
      setSubmittingId(null);
    }
  }
  async function removeFile(assignment: Assignment, one: SubmissionFile) {
    if (!assignment.submissionId) return;
    setSubmitErrors((current) => ({ ...current, [assignment.id]: "" }));
    setSubmittingId(assignment.id);
    try {
      await api(
        `/assignments/submissions/${assignment.submissionId}/files/${one.id}`,
        { method: "DELETE" },
      );
      await load();
    } catch (e) {
      setSubmitErrors((current) => ({
        ...current,
        [assignment.id]:
          e instanceof Error ? e.message : "Could not remove that file",
      }));
    } finally {
      setSubmittingId(null);
    }
  }

  async function grade(
    event: FormEvent<HTMLFormElement>,
    submission: Submission,
    assignmentId: number,
  ) {
    event.preventDefault();
    await api(`/assignments/submissions/${submission.id}`, {
      method: "PATCH",
      body: JSON.stringify(
        Object.fromEntries(new FormData(event.currentTarget)),
      ),
    });
    const rows = await api<Submission[]>(
      `/assignments/${assignmentId}/submissions`,
    );
    setSubmissions((old) => ({ ...old, [assignmentId]: rows }));
  }
  // Nothing here exists for a student until they join a course, and the API refuses
  // it all in the meantime. Explain the empty screen rather than showing bare controls.
  if (role === "student" && !coursesLoading && !courses.length) {
    return (
      <>
        <SectionTitle eyebrow={"Coursework"} title={"Assignments"} />
        <JoinCourseNotice role={role} what={"assignments"} />
      </>
    );
  }

  return (
    <>
      <SectionTitle
        eyebrow={submissionsOnly ? "Teacher review" : "Coursework"}
        title={submissionsOnly ? "Student submissions" : "Assignments"}
        action={
          role !== "student" && !submissionsOnly ? (
            <button className="btn" onClick={() => setOpen(true)}>
              <Plus size={16} />
              New assignment
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
        <div className="space-y-4">
          {items.map((item) => (
            <Card key={item.id}>
              <div className="flex flex-col justify-between gap-5 md:flex-row">
                <div className="max-w-2xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="badge">
                      <Clock3 size={12} className="mr-1" />
                      Due {formatDate(item.deadline)}
                    </span>
                    {item.submissionStatus && (
                      <span className="badge">{item.submissionStatus}</span>
                    )}
                  </div>
                  <h2 className="mt-4 text-lg font-black">{item.title}</h2>
                  {item.attachmentUrl && (
                    <a
                      className="btn-secondary mt-3 px-3 py-1.5 text-xs"
                      href={item.attachmentUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Download size={13} />
                      {item.attachmentName || "Download brief"}
                    </a>
                  )}
                  <p className="mt-2 text-sm leading-6 text-white/45">
                    {item.description}
                  </p>
                  {item.feedback && (
                    <p className="mt-4 rounded-lg border border-neon/20 bg-neon/5 p-3 text-sm text-mint">
                      <b>Teacher feedback:</b> {item.feedback}{" "}
                      {item.mark !== undefined && `· ${item.mark} marks`}
                    </p>
                  )}
                </div>
                {role === "student" && (
                  <StudentSubmission
                    assignment={item}
                    busy={submittingId === item.id}
                    error={submitErrors[item.id]}
                    onSubmit={(event) => submit(event, item.id)}
                    onRemoveFile={(one) => removeFile(item, one)}
                    limits={limits}
                  />
                )}
              </div>
              {submissionsOnly && (
                <div className="mt-6 border-t border-line pt-5">
                  <p className="label">Submissions</p>
                  <div className="space-y-3">
                    {(submissions[item.id] || []).map((row) => (
                      <div
                        className="rounded-lg border border-line p-4"
                        key={row.id}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-bold">{row.studentName}</p>
                            <p className="mt-1 text-xs text-white/35">
                              {row.status} · {formatDate(row.submittedAt)}
                            </p>
                          </div>
                          <div className="flex flex-wrap justify-end gap-2">
                            {row.files.map((one) => (
                              <a
                                key={one.id}
                                className="btn-secondary px-3 py-1.5 text-xs"
                                href={`/api/assignments/submissions/files/${one.id}`}
                              >
                                <Download size={13} />
                                {one.fileName}
                              </a>
                            ))}
                          </div>
                        </div>
                        <form
                          className="mt-4 grid gap-3 sm:grid-cols-[100px_1fr_auto]"
                          onSubmit={(e) => grade(e, row, item.id)}
                        >
                          <input
                            className="input"
                            name="mark"
                            type="number"
                            placeholder="Mark"
                            defaultValue={row.mark}
                          />
                          <input
                            className="input"
                            name="feedback"
                            placeholder="Feedback"
                            defaultValue={row.feedback}
                          />
                          <button className="btn">
                            <CheckCircle2 size={14} />
                            Grade
                          </button>
                        </form>
                      </div>
                    ))}
                    {!(submissions[item.id] || []).length && (
                      <p className="text-sm text-white/35">
                        No submissions yet.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <Empty
          title="No assignments found"
          text="Assignments for this course will appear here."
        />
      )}
      <Modal
        title="Create assignment"
        open={open}
        onClose={() => setOpen(false)}
      >
        <Notice error={error} />
        <form className="space-y-4" onSubmit={create}>
          <Field label="Title">
            <input className="input" name="title" required />
          </Field>
          <Field label="Description">
            <textarea className="input" rows={4} name="description" />
          </Field>
          <Field label="Deadline">
            <input
              className="input"
              type="datetime-local"
              name="deadline"
              required
            />
          </Field>
          <Field label="Brief or worksheet (optional)">
            <input className="input" type="file" name="file" />
            {limits && (
              <p className="mt-1.5 text-[11px] text-white/30">
                Up to {formatBytes(limits.maxFileBytes)}.
              </p>
            )}
          </Field>
          <button className="btn w-full">Create assignment</button>
        </form>
      </Modal>
    </>
  );
}
