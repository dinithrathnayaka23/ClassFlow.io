"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  BookOpen,
  ClipboardCheck,
  FileText,
  MessageCircle,
  Sparkles,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import { Card, SectionTitle } from "@/components/ui";
import { useCourses } from "./shared";

export function Dashboard({ role }: { role: string }) {
  const { courses } = useCourses();
  const [stats, setStats] = useState<Record<string, number>>({});
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
    }
  }, [role]);
  const cards: Array<[string, string | number, LucideIcon]> =
    role === "admin"
      ? [
          ["Teachers", stats.teachers || 0, Users],
          ["Students", stats.students || 0, Users],
          ["Active courses", stats.courses || 0, BookOpen],
          ["Submissions", stats.submissions || 0, ClipboardCheck],
        ]
      : [
          ["Your courses", courses.length, BookOpen],
          ["Resources", "Ready", FileText],
          ["Class chat", "Open", MessageCircle],
          ["AI help", "Online", Sparkles],
        ];
  return (
    <>
      <SectionTitle
        eyebrow="Workspace overview"
        title={
          role === "admin" ? "Platform at a glance" : "Keep the week moving"
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value, Icon]) => (
          <Card key={label as string}>
            <div className="flex items-start justify-between">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-neon/10 text-neon">
                <Icon size={18} />
              </span>
              <ArrowUpRight size={17} className="text-white/20" />
            </div>
            <p className="mt-7 text-3xl font-black">
              {value as string | number}
            </p>
            <p className="mt-1 text-sm text-white/40">{label as string}</p>
          </Card>
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
            {["materials", "assignments", "quizzes", "ai-help"]
              .filter((item) => role !== "admin" || item === "ai-help")
              .map((item) => (
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
