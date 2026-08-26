"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  BookOpen,
  ClipboardCheck,
  FileText,
  MessageCircle,
  UserPlus,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import { Card, SectionTitle } from "@/components/ui";
import { useCourses } from "./shared";

type Summary = {
  courses: number;
  submissionsToMark: number;
  pendingRequests: number;
  unreadMessages: number;
  assignmentsDue: number;
  quizzesOpen: number;
};

/** A tile: what it counts, where it sends you, and how it reads when the count is zero. */
type Tile = {
  label: string;
  value: number;
  icon: LucideIcon;
  href: string;
  empty: string;
};

export function Dashboard({ role }: { role: string }) {
  const { courses } = useCourses();
  const [stats, setStats] = useState<Record<string, number>>({});
  const [summary, setSummary] = useState<Summary>();
  const [activity, setActivity] = useState<
    Array<{
      id: number;
      action: string;
      details: string;
      userName: string;
      createdAt: string;
    }>
  >([]);
  useEffect(() => {
    if (role === "admin") {
      api<Record<string, number>>("/admin/stats").then(setStats);
      api<typeof activity>("/admin/activity").then(setActivity);
      return;
    }
    api<Summary>("/dashboard/summary").then(setSummary).catch(() => {});
  }, [role]);
  // Every tile counts outstanding work and links to it. The previous student and teacher
  // tiles read "Ready", "Open" and "Online", which never changed and led nowhere.
  const adminTiles: Tile[] = [
    // Labelled "active" because the API counts enabled accounts only, which would
    // otherwise disagree with the totals on the Teachers/Students pages.
    { label: "Active teachers", value: stats.teachers || 0, icon: Users, href: `/${role}/teachers`, empty: "None yet" },
    { label: "Active students", value: stats.students || 0, icon: Users, href: `/${role}/students`, empty: "None yet" },
    { label: "Active courses", value: stats.courses || 0, icon: BookOpen, href: `/${role}/courses`, empty: "None yet" },
    { label: "Submissions", value: stats.submissions || 0, icon: ClipboardCheck, href: `/${role}/courses`, empty: "None yet" },
  ];
  const teacherTiles: Tile[] = [
    { label: "Courses you run", value: summary?.courses ?? 0, icon: BookOpen, href: `/${role}/courses`, empty: "None yet" },
    { label: "Waiting to be marked", value: summary?.submissionsToMark ?? 0, icon: ClipboardCheck, href: `/${role}/submissions`, empty: "All marked" },
    { label: "Join requests", value: summary?.pendingRequests ?? 0, icon: UserPlus, href: `/${role}/courses`, empty: "None pending" },
    { label: "Unread messages", value: summary?.unreadMessages ?? 0, icon: MessageCircle, href: `/${role}/chat`, empty: "All read" },
  ];
  const studentTiles: Tile[] = [
    { label: "Your courses", value: summary?.courses ?? courses.length, icon: BookOpen, href: `/${role}/courses`, empty: "Join one" },
    { label: "Assignments due", value: summary?.assignmentsDue ?? 0, icon: FileText, href: `/${role}/assignments`, empty: "Nothing due" },
    { label: "Quizzes open now", value: summary?.quizzesOpen ?? 0, icon: ClipboardCheck, href: `/${role}/quizzes`, empty: "None open" },
    { label: "Unread messages", value: summary?.unreadMessages ?? 0, icon: MessageCircle, href: `/${role}/chat`, empty: "All read" },
  ];
  const cards =
    role === "admin" ? adminTiles : role === "teacher" ? teacherTiles : studentTiles;
  return (
    <>
      <SectionTitle
        eyebrow="Workspace overview"
        title={
          role === "admin" ? "Platform at a glance" : "Keep the week moving"
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((tile) => (
          <Link href={tile.href} key={tile.label}>
            <Card className="h-full transition hover:-translate-y-1 hover:border-neon/35">
              <div className="flex items-start justify-between">
                <span
                  className={`grid h-10 w-10 place-items-center rounded-lg ${
                    tile.value > 0
                      ? "bg-neon/10 text-neon"
                      : "bg-white/[.04] text-white/25"
                  }`}
                >
                  <tile.icon size={18} />
                </span>
                <ArrowUpRight size={17} className="text-white/20" />
              </div>
              <p
                className={`mt-7 text-3xl font-black ${tile.value > 0 ? "" : "text-white/25"}`}
              >
                {tile.value}
              </p>
              <p className="mt-1 text-sm text-white/40">{tile.label}</p>
              {/* A zero is easy to misread as "not loaded"; saying what it means is clearer. */}
              <p className="mt-0.5 text-[11px] text-white/25">
                {tile.value > 0 ? "Open to view" : tile.empty}
              </p>
            </Card>
          </Link>
        ))}
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_.6fr]">
        <section className="panel p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="font-black">Active courses</h2>
            <Link
              className="text-sm font-bold text-neon"
              href={`/${role}/courses`}
            >
              View all
            </Link>
          </div>
          <div className="space-y-3">
            {courses.slice(0, 4).map((course) => (
              <Link
                href={`/${role}/courses/${course.id}`}
                key={course.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-line p-4 transition hover:border-neon/30 hover:bg-neon/[.03]"
              >
                <div>
                  <span className="badge">{course.code}</span>
                  <p className="mt-3 font-bold">{course.title}</p>
                  <p className="mt-1 text-sm text-white/35">
                    {course.teacherName} · {course.studentCount} students
                  </p>
                </div>
                <ArrowUpRight size={18} className="text-neon" />
              </Link>
            ))}
            {courses.length === 0 && (
              <p className="py-10 text-center text-sm text-white/40">
                No courses to show yet.
              </p>
            )}
          </div>
        </section>
        <section className="panel p-6">
          <h2 className="font-black">Quick starts</h2>
          <div className="mt-5 space-y-3">
            {(role === "admin"
              ? ["users", "courses", "chat", "ai-help"]
              : ["materials", "assignments", "quizzes", "ai-help"]
            ).map((item) => (
              <Link
                className="flex items-center justify-between rounded-lg border border-line px-4 py-3 text-sm font-semibold capitalize text-white/55 hover:border-neon/30 hover:text-neon"
                href={`/${role}/${item}`}
                key={item}
              >
                {item.replace("-", " ")}
                <ArrowUpRight size={15} />
              </Link>
            ))}
          </div>
        </section>
      </div>
      {role === "admin" && (
        <section className="panel mt-6 p-6">
          <h2 className="font-black">Recent platform activity</h2>
          <div className="mt-5 divide-y divide-line">
            {activity.map((item) => (
              <div
                className="flex flex-wrap items-center justify-between gap-3 py-4"
                key={item.id}
              >
                <div>
                  <p className="text-sm font-bold">
                    {item.action.replaceAll("_", " ")}
                  </p>
                  <p className="mt-1 text-xs text-white/35">{item.details}</p>
                </div>
                <p className="text-xs text-white/30">
                  {item.userName || "System"}
                </p>
              </div>
            ))}
            {!activity.length && (
              <p className="py-6 text-sm text-white/35">
                Activity will appear as the platform is used.
              </p>
            )}
          </div>
        </section>
      )}
    </>
  );
}
