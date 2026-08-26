"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Mail,
  MessagesSquare,
  Phone,
  Plus,
  KeyRound,
  Search,
  Trash2,
  UserCheck,
  UserRound,
  UserX,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api, Page } from "@/lib/api";
import { Empty, Notice, SectionTitle } from "@/components/ui";
import { Field, Modal, formatDate } from "./shared";

const PAGE_SIZE = 20;

type UserRow = {
  id: number;
  email: string;
  fullName: string;
  role: string;
  phone?: string;
  bio?: string;
  avatarUrl?: string;
  active: boolean;
  createdAt: string;
};

type CourseLink = {
  id: number;
  code: string;
  title: string;
  relation: "TEACHING" | "ENROLLED";
};

type UserDetail = UserRow & {
  coursesTeaching: number;
  coursesEnrolled: number;
  materialsCreated: number;
  assignmentsCreated: number;
  submissions: number;
  quizzesCreated: number;
  quizAttempts: number;
  forumActivity: number;
  messagesSent: number;
  messagesReceived: number;
  chatPartners: number;
  courses: CourseLink[];
};

const ROLES = ["ADMIN", "TEACHER", "STUDENT"] as const;

/**
 * Spells out what deleting this account destroys. Disabling is the reversible
 * alternative and keeps every row below, which is why the copy names it.
 */
function describeDeletion(user: UserDetail) {
  const parts: string[] = [];
  const add = (count: number, one: string, many: string) => {
    if (count > 0) parts.push(`${count} ${count === 1 ? one : many}`);
  };
  add(user.submissions, "assignment submission", "assignment submissions");
  add(user.quizAttempts, "quiz attempt", "quiz attempts");
  add(user.forumActivity, "forum post", "forum posts");
  add(user.materialsCreated, "shared material", "shared materials");
  add(user.assignmentsCreated, "authored assignment", "authored assignments");
  add(user.quizzesCreated, "authored quiz", "authored quizzes");
  const messages = user.messagesSent + user.messagesReceived;
  if (messages > 0) {
    parts.push(
      `${messages} chat ${messages === 1 ? "message" : "messages"} across ${user.chatPartners} ${
        user.chatPartners === 1 ? "conversation" : "conversations"
      }`,
    );
  }
  if (!parts.length) return "This account has no content attached to it.";
  const last = parts.pop();
  return `This permanently removes ${parts.length ? `${parts.join(", ")} and ${last}` : last}, along with any files they uploaded.`;
}

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

function Avatar({ user, size = 40 }: { user: UserRow; size?: number }) {
  const style = { width: size, height: size };
  if (user.avatarUrl)
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={user.avatarUrl}
        alt=""
        style={style}
        className="shrink-0 rounded-full border border-line object-cover"
      />
    );
  return (
    <span
      style={style}
      className="grid shrink-0 place-items-center rounded-full bg-neon/15 text-xs font-black text-neon"
    >
      {initials(user.fullName)}
    </span>
  );
}

function Status({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-bold ${active ? "text-neon" : "text-red-300"}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${active ? "bg-neon" : "bg-red-300"}`}
      />
      {active ? "Active" : "Disabled"}
    </span>
  );
}

/** One activity number in the popup. Zero counts are dimmed rather than hidden so the grid stays even. */
function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
}) {
  return (
    <div className="rounded-xl border border-line bg-white/[.02] p-3">
      <Icon size={15} className={value ? "text-neon" : "text-white/20"} />
      <p className="mt-3 text-xl font-black">{value}</p>
      <p className="mt-0.5 text-[11px] leading-tight text-white/35">{label}</p>
    </div>
  );
}

export function Users({ filter }: { filter?: string }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");

  const [open, setOpen] = useState(false);
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [detailError, setDetailError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [detailNotice, setDetailNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setListError("");
    try {
      const params = new URLSearchParams({
        size: String(PAGE_SIZE),
        page: String(page),
      });
      if (filter) params.set("role", filter);
      if (query) params.set("q", query);
      const data = await api<Page<UserRow>>(`/users?${params}`);
      setUsers(data.items);
      setTotal(data.total);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Could not load people");
    } finally {
      setLoading(false);
    }
  }, [filter, page, query]);

  useEffect(() => {
    load();
  }, [load]);

  // Reset to the first page whenever the role tab or the search term changes,
  // otherwise a narrower result set can leave you stranded on an empty page.
  useEffect(() => {
    setPage(0);
  }, [filter, query]);

  // Debounced so typing does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  async function openDetail(id: number) {
    setSelectedId(id);
    setDetail(null);
    setDetailError("");
    setDetailNotice("");
    setConfirmDelete(false);
    setResetting(false);
    try {
      setDetail(await api<UserDetail>(`/users/${id}`));
    } catch (e) {
      setDetailError(
        e instanceof Error ? e.message : "Could not load this person",
      );
    }
  }

  function closeDetail() {
    setSelectedId(null);
    setDetail(null);
    setDetailError("");
    setDetailNotice("");
    setConfirmDelete(false);
    setResetting(false);
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setCreateError("");
    setCreating(true);
    try {
      await api("/users", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      setOpen(false);
      form.reset();
      setPage(0);
      await load();
    } catch (e) {
      setCreateError(
        e instanceof Error ? e.message : "Could not create the user",
      );
    } finally {
      setCreating(false);
    }
  }

  async function toggle(user: UserRow) {
    setDetailError("");
    setBusy(true);
    try {
      await api(`/users/${user.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ active: !user.active }),
      });
      await load();
      if (selectedId === user.id) setDetail(await api(`/users/${user.id}`));
    } catch (e) {
      setDetailError(
        e instanceof Error ? e.message : "Could not change the status",
      );
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(
    event: FormEvent<HTMLFormElement>,
    user: UserDetail,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const newPassword = String(new FormData(form).get("newPassword") || "");
    setDetailError("");
    setDetailNotice("");
    setBusy(true);
    try {
      await api(`/users/${user.id}/password`, {
        method: "PATCH",
        body: JSON.stringify({ newPassword }),
      });
      form.reset();
      setResetting(false);
      // The password itself is never echoed back into the page or the console.
      setDetailNotice(
        `Password reset. ${user.fullName} is signed out everywhere and must use the new password.`,
      );
    } catch (e) {
      setDetailError(
        e instanceof Error ? e.message : "Could not reset the password",
      );
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(user: UserDetail, role: string) {
    if (role === user.role) return;
    setDetailError("");
    setDetailNotice("");
    setBusy(true);
    try {
      await api(`/users/${user.id}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      setDetail(await api<UserDetail>(`/users/${user.id}`));
      await load();
    } catch (e) {
      setDetailError(
        e instanceof Error ? e.message : "Could not change the role",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(user: UserRow) {
    setDetailError("");
    setBusy(true);
    try {
      await api(`/users/${user.id}`, { method: "DELETE" });
      closeDetail();
      await load();
    } catch (e) {
      setDetailError(
        e instanceof Error ? e.message : "Could not delete this account",
      );
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  }

  const heading = filter
    ? `${filter[0]}${filter.slice(1).toLowerCase()}s`
    : "People";
  const lastPage = Math.max(Math.ceil(total / PAGE_SIZE) - 1, 0);

  return (
    <>
      <SectionTitle
        eyebrow="Access management"
        title={heading}
        action={
          <button className="btn shrink-0" onClick={() => setOpen(true)}>
            <Plus size={16} />
            <span className="hidden sm:inline">Add user</span>
          </button>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <label className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/30"
          />
          <input
            className="input pl-9"
            placeholder="Search name, email or phone"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label={`Search ${heading.toLowerCase()}`}
          />
        </label>
        <p className="text-sm text-white/35">
          {loading ? "Loading..." : `${total} ${total === 1 ? "person" : "people"}`}
        </p>
      </div>

      <Notice error={listError} />

      {users.length ? (
        <>
          {/* Cards below the md breakpoint: a five-column table is unusable on a phone. */}
          <div className="grid gap-3 md:hidden">
            {users.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => openDetail(user.id)}
                className="card flex w-full items-center gap-3 text-left transition hover:border-neon/35"
              >
                <Avatar user={user} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{user.fullName}</p>
                  <p className="mt-0.5 truncate text-xs text-white/35">
                    {user.email}
                  </p>
                  <div className="mt-2 flex items-center gap-3">
                    <span className="badge">{user.role}</span>
                    <Status active={user.active} />
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="panel hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line bg-white/[.02] text-[11px] uppercase tracking-widest text-white/30">
                  <tr>
                    <th className="px-5 py-4">Person</th>
                    <th className="px-5 py-4">Role</th>
                    <th className="px-5 py-4">Joined</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr
                      key={user.id}
                      onClick={() => openDetail(user.id)}
                      className="cursor-pointer border-b border-line/70 transition last:border-0 hover:bg-neon/[.03]"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar user={user} size={36} />
                          <div className="min-w-0">
                            <p className="truncate font-bold">
                              {user.fullName}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-white/35">
                              {user.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="badge">{user.role}</span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-white/45">
                        {formatDate(user.createdAt)}
                      </td>
                      <td className="px-5 py-4">
                        <Status active={user.active} />
                      </td>
                      {/* The row opens the popup, so the inline buttons must not bubble. */}
                      <td
                        className="px-5 py-4 text-right"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div className="inline-flex gap-1">
                          <button
                            type="button"
                            title={user.active ? "Disable" : "Enable"}
                            aria-label={`${user.active ? "Disable" : "Enable"} ${user.fullName}`}
                            className="rounded-lg p-2 text-white/40 transition hover:bg-white/5 hover:text-neon disabled:opacity-40"
                            disabled={busy}
                            onClick={() => toggle(user)}
                          >
                            {user.active ? (
                              <UserX size={16} />
                            ) : (
                              <UserCheck size={16} />
                            )}
                          </button>
                          <button
                            type="button"
                            title="Delete"
                            aria-label={`Delete ${user.fullName}`}
                            className="rounded-lg p-2 text-white/40 transition hover:bg-white/5 hover:text-red-300"
                            onClick={() => {
                              openDetail(user.id);
                              setConfirmDelete(true);
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {total > PAGE_SIZE && (
            <div className="mt-5 flex items-center justify-between gap-3">
              <p className="text-sm text-white/35">
                Page {page + 1} of {lastPage + 1}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-secondary px-3 py-2 disabled:opacity-40"
                  disabled={page === 0 || loading}
                  onClick={() => setPage((current) => Math.max(current - 1, 0))}
                >
                  <ChevronLeft size={15} />
                  Previous
                </button>
                <button
                  type="button"
                  className="btn-secondary px-3 py-2 disabled:opacity-40"
                  disabled={page >= lastPage || loading}
                  onClick={() =>
                    setPage((current) => Math.min(current + 1, lastPage))
                  }
                >
                  Next
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        !loading && (
          <Empty
            title={query ? "No matches" : "No users found"}
            text={
              query
                ? `Nothing matched "${query}". Try a different name or email.`
                : "Add a user to get started."
            }
          />
        )
      )}

      <Modal
        title={detail?.fullName || "Loading person"}
        subtitle={detail?.email}
        size="lg"
        open={selectedId !== null}
        onClose={closeDetail}
      >
        <Notice error={detailError} success={detailNotice} />
        {detail ? (
          <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <Avatar user={detail} size={72} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="sr-only" htmlFor="user-role">
                    Role
                  </label>
                  <select
                    id="user-role"
                    className="input w-auto py-1.5 text-xs font-bold uppercase tracking-wider"
                    value={detail.role}
                    disabled={busy}
                    onChange={(event) => changeRole(detail, event.target.value)}
                  >
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                  <Status active={detail.active} />
                </div>
                <p className="mt-2 text-sm text-white/40">
                  Joined {formatDate(detail.createdAt)}
                </p>
              </div>
            </div>

            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-line bg-white/[.02] p-4">
                <dt className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-white/35">
                  <Mail size={13} />
                  Email
                </dt>
                <dd className="mt-2 break-all text-sm">{detail.email}</dd>
              </div>
              <div className="rounded-xl border border-line bg-white/[.02] p-4">
                <dt className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-white/35">
                  <Phone size={13} />
                  Phone
                </dt>
                <dd className="mt-2 text-sm">
                  {detail.phone || (
                    <span className="text-white/30">Not provided</span>
                  )}
                </dd>
              </div>
            </dl>

            {detail.bio && (
              <div className="rounded-xl border border-line bg-white/[.02] p-4">
                <p className="text-[11px] font-bold uppercase tracking-widest text-white/35">
                  About
                </p>
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-white/60">
                  {detail.bio}
                </p>
              </div>
            )}

            <div>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-white/35">
                Activity on the platform
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {detail.role === "STUDENT" ? (
                  <>
                    <Stat
                      label="Courses enrolled"
                      value={detail.coursesEnrolled}
                      icon={BookOpen}
                    />
                    <Stat
                      label="Assignments submitted"
                      value={detail.submissions}
                      icon={FileText}
                    />
                    <Stat
                      label="Quizzes completed"
                      value={detail.quizAttempts}
                      icon={ClipboardCheck}
                    />
                    <Stat
                      label="Forum posts"
                      value={detail.forumActivity}
                      icon={MessagesSquare}
                    />
                  </>
                ) : (
                  <>
                    <Stat
                      label="Courses taught"
                      value={detail.coursesTeaching}
                      icon={BookOpen}
                    />
                    <Stat
                      label="Materials shared"
                      value={detail.materialsCreated}
                      icon={FileText}
                    />
                    <Stat
                      label="Assignments set"
                      value={detail.assignmentsCreated}
                      icon={ClipboardCheck}
                    />
                    <Stat
                      label="Quizzes created"
                      value={detail.quizzesCreated}
                      icon={ClipboardCheck}
                    />
                  </>
                )}
              </div>
            </div>

            {detail.courses.length > 0 && (
              <div>
                <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-white/35">
                  Courses
                </p>
                <div className="space-y-2">
                  {detail.courses.map((course) => (
                    <div
                      key={`${course.relation}-${course.id}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-line px-4 py-3"
                    >
                      <div className="min-w-0">
                        <span className="badge">{course.code}</span>
                        <p className="mt-2 truncate text-sm font-bold">
                          {course.title}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-white/30">
                        {course.relation === "TEACHING"
                          ? "Teaching"
                          : "Enrolled"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-line pt-5">
              {resetting ? (
                <form
                  className="rounded-xl border border-line bg-white/[.02] p-4"
                  onSubmit={(event) => resetPassword(event, detail)}
                >
                  <p className="text-sm font-bold">
                    Set a new password for {detail.fullName}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-white/40">
                    Passwords are hashed and cannot be read back, so this
                    replaces the old one rather than revealing it. Share the new
                    password with them directly and have them change it.
                  </p>
                  <div className="mt-4 flex flex-wrap items-end gap-2">
                    <label className="min-w-0 flex-1">
                      <span className="label">New password</span>
                      <input
                        className="input"
                        name="newPassword"
                        type="text"
                        autoComplete="off"
                        minLength={8}
                        required
                        placeholder="At least 8 characters"
                      />
                    </label>
                    <button className="btn" disabled={busy}>
                      {busy ? "Saving..." : "Set password"}
                    </button>
                    <button
                      type="button"
                      className="rounded-full px-4 py-2.5 text-sm font-bold text-white/60 transition hover:text-white"
                      onClick={() => setResetting(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : confirmDelete ? (
                <div className="rounded-xl border border-red-400/30 bg-red-400/10 p-4">
                  <p className="text-sm font-bold text-red-200">
                    Delete {detail.fullName}?
                  </p>
                  <p className="mt-1 text-sm leading-6 text-red-200/70">
                    {describeDeletion(detail)} It cannot be undone — disable the
                    account instead to block sign-in while keeping everything
                    above, including the other side of their conversations.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-full bg-red-400/90 px-4 py-2 text-sm font-bold text-ink transition hover:bg-red-300 disabled:opacity-50"
                      disabled={busy}
                      onClick={() => remove(detail)}
                    >
                      {busy ? "Deleting..." : "Delete permanently"}
                    </button>
                    <button
                      type="button"
                      className="rounded-full px-4 py-2 text-sm font-bold text-white/60 transition hover:text-white"
                      onClick={() => setConfirmDelete(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={busy}
                    onClick={() => toggle(detail)}
                  >
                    {detail.active ? (
                      <UserX size={15} />
                    ) : (
                      <UserCheck size={15} />
                    )}
                    {detail.active ? "Disable account" : "Enable account"}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={busy}
                    onClick={() => {
                      setDetailNotice("");
                      setResetting(true);
                    }}
                  >
                    <KeyRound size={15} />
                    Reset password
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-red-400/30 px-4 py-2.5 text-sm font-semibold text-red-300 transition hover:bg-red-400/10"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 size={15} />
                    Delete user
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          !detailError && (
            <div className="flex items-center gap-3 py-10 text-sm text-white/35">
              <UserRound size={18} />
              Loading details...
            </div>
          )
        )}
      </Modal>

      <Modal
        title="Add a ClassFlow user"
        subtitle="They can sign in with the email and password you set here."
        open={open}
        onClose={() => setOpen(false)}
      >
        <Notice error={createError} />
        <form className="space-y-4" onSubmit={create}>
          <Field label="Full name">
            <input className="input" name="fullName" required />
          </Field>
          <Field label="Email">
            <input className="input" type="email" name="email" required />
          </Field>
          <Field label="Initial password">
            <input className="input" name="password" minLength={8} required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Role">
              <select
                className="input"
                name="role"
                defaultValue={filter || "STUDENT"}
              >
                <option>ADMIN</option>
                <option>TEACHER</option>
                <option>STUDENT</option>
              </select>
            </Field>
            <Field label="Phone">
              <input className="input" name="phone" />
            </Field>
          </div>
          <button className="btn w-full" disabled={creating}>
            {creating ? "Creating..." : "Create user"}
          </button>
        </form>
      </Modal>
    </>
  );
}
