"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bot, BookOpen, ClipboardCheck, FileText, GraduationCap, LayoutDashboard, LogOut,
  Menu, MessageCircle, MessagesSquare, PanelLeftClose, Users, X
} from "lucide-react";
import { Brand } from "@/components/Brand";
import { api, User } from "@/lib/api";

const iconMap = {
  dashboard: LayoutDashboard, users: Users, teachers: GraduationCap, students: Users, courses: BookOpen,
  materials: FileText, quizzes: ClipboardCheck, assignments: FileText, submissions: ClipboardCheck,
  chat: MessageCircle, forums: MessagesSquare, "ai-help": Bot, profile: Users
};

const links: Record<string, string[]> = {
  admin: ["dashboard", "users", "teachers", "students", "courses", "profile"],
  teacher: ["dashboard", "courses", "materials", "quizzes", "assignments", "submissions", "chat", "forums", "ai-help", "profile"],
  student: ["dashboard", "courses", "materials", "quizzes", "assignments", "chat", "forums", "ai-help", "profile"]
};

const titles: Record<string, string> = { "ai-help": "AI help" };

export function AppShell({ role, children }: { role: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api<User>("/auth/me").then(found => {
      if (found.role.toLowerCase() !== role) router.replace(`/${found.role.toLowerCase()}/dashboard`);
      setUser(found);
    }).catch(() => router.replace("/login"));
  }, [role, router]);

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const sidebar = (
    <aside className="flex h-full w-[270px] flex-col border-r border-line bg-ink/95 p-4">
      <div className="flex items-center justify-between px-2 py-2"><Brand /><button className="lg:hidden" onClick={() => setOpen(false)}><X size={19} /></button></div>
      <div className="mt-8 px-2"><p className="text-[10px] font-bold uppercase tracking-[.25em] text-white/30">{role} workspace</p></div>
      <nav className="mt-3 space-y-1">
        {(links[role] || links.student).map(item => {
          const Icon = iconMap[item as keyof typeof iconMap] || PanelLeftClose;
          const href = `/${role}/${item}`;
          const active = pathname === href || (item === "courses" && pathname.startsWith(href + "/"));
          return <Link key={item} href={href} onClick={() => setOpen(false)} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${active ? "bg-neon text-ink" : "text-white/50 hover:bg-white/5 hover:text-white"}`}><Icon size={17} />{titles[item] || item[0].toUpperCase() + item.slice(1)}</Link>;
        })}
      </nav>
      <div className="mt-auto border-t border-line pt-4">
        <div className="mb-3 flex items-center gap-3 rounded-lg px-2 py-2"><span className="grid h-9 w-9 place-items-center rounded-full bg-neon/15 text-xs font-black text-neon">{user?.fullName.split(" ").map(v => v[0]).slice(0, 2).join("") || ".."}</span><div className="min-w-0"><p className="truncate text-sm font-bold">{user?.fullName || "Loading..."}</p><p className="truncate text-xs text-white/35">{user?.email}</p></div></div>
        <button onClick={logout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/45 hover:bg-white/5 hover:text-white"><LogOut size={16} />Sign out</button>
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-screen">
      <div className="fixed inset-y-0 left-0 z-30 hidden lg:block">{sidebar}</div>
      {open && <div className="fixed inset-0 z-40 bg-black/70 lg:hidden" onClick={() => setOpen(false)}><div className="h-full w-[270px]" onClick={e => e.stopPropagation()}>{sidebar}</div></div>}
      <div className="min-w-0 flex-1 lg:pl-[270px]">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-line bg-ink/85 px-5 backdrop-blur-xl lg:px-8">
          <button className="lg:hidden" onClick={() => setOpen(true)}><Menu size={21} /></button>
          <p className="hidden text-xs font-bold uppercase tracking-[.25em] text-white/30 sm:block">Learn clearly. Move confidently.</p>
          <span className="badge">{role}</span>
        </header>
        <main className="mx-auto max-w-7xl p-5 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
