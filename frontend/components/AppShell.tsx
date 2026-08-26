"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bot,
  BookOpen,
  ClipboardCheck,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  MessagesSquare,
  PanelLeftClose,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { Brand } from "@/components/Brand";
import { NotificationBell } from "@/components/NotificationBell";
import { useUnreadMessages } from "@/components/workspace/chat/useUnreadMessages";
import { api, User } from "@/lib/api";

const iconMap = {
  dashboard: LayoutDashboard,
  users: Users,
  teachers: GraduationCap,
  students: Users,
  courses: BookOpen,
  materials: FileText,
  quizzes: ClipboardCheck,
  assignments: FileText,
  submissions: ClipboardCheck,
  chat: MessageCircle,
  forums: MessagesSquare,
  "ai-help": Bot,
  profile: UserRound,
};

const links: Record<string, string[]> = {
  admin: [
    "dashboard",
    "users",
    "teachers",
    "students",
    "courses",
    "chat",
    "ai-help",
    "profile",
  ],
  teacher: [
    "dashboard",
    "courses",
    "materials",
    "quizzes",
    "assignments",
    "submissions",
    "chat",
    "forums",
    "ai-help",
    "profile",
  ],
  student: [
    "dashboard",
    "courses",
    "materials",
    "quizzes",
    "assignments",
    "chat",
    "forums",
    "ai-help",
    "profile",
  ],
};

const titles: Record<string, string> = { "ai-help": "AI help" };

export function AppShell({
  role,
  children,
}: {
  role: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const unreadMessages = useUnreadMessages();

  useEffect(() => {
    api<User>("/auth/me")
      .then((found) => {
        if (found.role.toLowerCase() !== role)
          router.replace(`/${found.role.toLowerCase()}/dashboard`);
        setUser(found);
      })
      .catch(() => router.replace("/login"));
  }, [role, router]);

  // Close the mobile drawer on navigation, including browser back/forward.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // While the drawer is open, close on Escape and stop the page behind it scrolling.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  // Three rows: a fixed brand header, a scrolling link list, and a fixed account
  // footer. The middle row owns the overflow so every link stays reachable on
  // short viewports - the teacher workspace has ten of them.
  const sidebar = (
    <aside className="flex h-full w-[270px] flex-col border-r border-line bg-ink/95">
      <div className="flex shrink-0 items-center justify-between gap-2 px-4 pb-2 pt-4">
        <Brand />
        <button
          type="button"
          className="rounded-lg p-1.5 text-white/50 transition hover:bg-white/5 hover:text-white lg:hidden"
          onClick={() => setOpen(false)}
          aria-label="Close navigation menu"
        >
          <X size={19} />
        </button>
      </div>

      <div className="neon-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3">
        <p className="mt-4 px-2 text-[10px] font-bold uppercase tracking-[.25em] text-white/30">
          {role} workspace
        </p>
        <nav className="mt-3 space-y-1" aria-label={`${role} workspace`}>
          {(links[role] || links.student).map((item) => {
            const Icon = iconMap[item as keyof typeof iconMap] || PanelLeftClose;
            const href = `/${role}/${item}`;
            const active =
              pathname === href ||
              (item === "courses" && pathname.startsWith(href + "/"));
            return (
              <Link
                key={item}
                href={href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${active ? "bg-neon text-ink" : "text-white/50 hover:bg-white/5 hover:text-white"}`}
              >
                <Icon size={17} className="shrink-0" />
                <span className="flex-1 truncate">
                  {titles[item] || item[0].toUpperCase() + item.slice(1)}
                </span>
                {item === "chat" && unreadMessages > 0 && (
                  <span
                    aria-label={`${unreadMessages} unread messages`}
                    className={`grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1.5 text-[11px] font-black ${
                      active ? "bg-ink text-neon" : "bg-neon text-ink"
                    }`}
                  >
                    {unreadMessages > 99 ? "99+" : unreadMessages}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="shrink-0 border-t border-line px-4 pb-4 pt-4">
        <div className="mb-3 flex items-center gap-3 rounded-lg px-2 py-2">
          {user?.avatarUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={user.avatarUrl}
              alt=""
              className="h-9 w-9 shrink-0 rounded-full border border-line object-cover"
            />
          ) : (
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-neon/15 text-xs font-black text-neon">
              {user?.fullName
                ?.split(" ")
                .map((v: string) => v[0])
                .slice(0, 2)
                .join("") || ".."}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">
              {user?.fullName || "Loading..."}
            </p>
            <p className="truncate text-xs text-white/35">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/45 transition hover:bg-white/5 hover:text-white"
        >
          <LogOut size={16} className="shrink-0" />
          Sign out
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-screen">
      <div className="fixed inset-y-0 left-0 z-30 hidden lg:block">
        {sidebar}
      </div>

      {/* Mobile drawer. Kept mounted so it can slide rather than pop, and made
          non-interactive when closed so it never traps taps over the page. */}
      <div
        className={`fixed inset-0 z-40 lg:hidden ${open ? "" : "pointer-events-none"}`}
        aria-hidden={!open}
      >
        <div
          className={`absolute inset-0 bg-black/70 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`}
          onClick={() => setOpen(false)}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          className={`absolute inset-y-0 left-0 w-[270px] max-w-[85vw] shadow-2xl transition-transform duration-300 ease-out ${open ? "translate-x-0" : "-translate-x-full"}`}
        >
          {sidebar}
        </div>
      </div>

      <div className="min-w-0 flex-1 lg:pl-[270px]">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-line bg-ink/85 px-5 backdrop-blur-xl lg:px-8">
          <button
            type="button"
            className="rounded-lg p-1.5 text-white/70 transition hover:bg-white/5 hover:text-white lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={open}
          >
            <Menu size={21} />
          </button>
          <p className="hidden text-xs font-bold uppercase tracking-[.25em] text-white/30 sm:block">
            Learn clearly. Move confidently.
          </p>
          <div className="ml-auto flex items-center gap-2 sm:ml-0">
            <NotificationBell role={role} />
            <span className="badge shrink-0">{role}</span>
          </div>
        </header>
        <main className="mx-auto max-w-7xl p-4 sm:p-5 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
