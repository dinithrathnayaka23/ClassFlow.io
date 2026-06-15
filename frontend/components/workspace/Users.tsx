"use client";

import { FormEvent, useEffect, useState } from "react";
import { Plus, UserCheck, UserX } from "lucide-react";
import { api, Page } from "@/lib/api";
import { Empty, Notice, SectionTitle } from "@/components/ui";
import { Field, Modal, formatDate } from "./shared";

type UserRow = { id: number; email: string; fullName: string; role: string; phone?: string; active: boolean; createdAt: string };

export function Users({ filter }: { filter?: string }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const load = () => api<Page<UserRow>>(`/users?size=100${filter ? `&role=${filter}` : ""}`).then(data => setUsers(data.items));
  useEffect(() => { load(); }, [filter]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    try { await api("/users", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); setOpen(false); load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not create user"); }
  }
  async function toggle(user: UserRow) { await api(`/users/${user.id}/status`, { method: "PATCH", body: JSON.stringify({ active: !user.active }) }); load(); }
  return <><SectionTitle eyebrow="Access management" title={filter ? `${filter[0]}${filter.slice(1).toLowerCase()}s` : "People"} action={<button className="btn" onClick={() => setOpen(true)}><Plus size={16} />Add user</button>} />
    {users.length ? <div className="panel overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-line bg-white/[.02] text-[11px] uppercase tracking-widest text-white/30"><tr><th className="px-5 py-4">Person</th><th className="px-5 py-4">Role</th><th className="px-5 py-4">Joined</th><th className="px-5 py-4">Status</th><th className="px-5 py-4"></th></tr></thead><tbody>{users.map(user => <tr className="border-b border-line/70 last:border-0" key={user.id}><td className="px-5 py-4"><p className="font-bold">{user.fullName}</p><p className="mt-1 text-xs text-white/35">{user.email}</p></td><td className="px-5 py-4"><span className="badge">{user.role}</span></td><td className="px-5 py-4 text-white/45">{formatDate(user.createdAt)}</td><td className="px-5 py-4"><span className={user.active ? "text-neon" : "text-red-300"}>{user.active ? "Active" : "Disabled"}</span></td><td className="px-5 py-4 text-right"><button title="Toggle status" className="btn-secondary px-3" onClick={() => toggle(user)}>{user.active ? <UserX size={15} /> : <UserCheck size={15} />}</button></td></tr>)}</tbody></table></div></div> : <Empty title="No users found" text="Add a user to get started." />}
    <Modal title="Add a ClassFlow user" open={open} onClose={() => setOpen(false)}><Notice error={error} /><form className="space-y-4" onSubmit={create}><Field label="Full name"><input className="input" name="fullName" required /></Field><Field label="Email"><input className="input" type="email" name="email" required /></Field><Field label="Initial password"><input className="input" name="password" minLength={8} required /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Role"><select className="input" name="role" defaultValue={filter || "STUDENT"}><option>ADMIN</option><option>TEACHER</option><option>STUDENT</option></select></Field><Field label="Phone"><input className="input" name="phone" /></Field></div><button className="btn w-full">Create user</button></form></Modal></>;
}
