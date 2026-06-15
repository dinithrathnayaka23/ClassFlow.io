"use client";

import { Dashboard } from "@/components/workspace/Dashboard";
import { Courses } from "@/components/workspace/Courses";
import { Users } from "@/components/workspace/Users";
import { Materials } from "@/components/workspace/Materials";
import { Assignments } from "@/components/workspace/Assignments";
import { Quizzes } from "@/components/workspace/Quizzes";
import { Forums } from "@/components/workspace/Forums";
import { Chat } from "@/components/workspace/Chat";
import { AiHelp } from "@/components/workspace/AiHelp";
import { Profile } from "@/components/workspace/Profile";

export function Workspace({ role, section }: { role: string; section: string[] }) {
  const page = section[0] || "dashboard";
  if (page === "dashboard") return <Dashboard role={role} />;
  if (page === "courses") return <Courses role={role} courseId={section[1] ? Number(section[1]) : undefined} />;
  if (["users", "teachers", "students"].includes(page)) return <Users filter={page === "users" ? undefined : page.slice(0, -1).toUpperCase()} />;
  if (page === "materials") return <Materials role={role} />;
  if (page === "assignments" || page === "submissions") return <Assignments role={role} submissionsOnly={page === "submissions"} />;
  if (page === "quizzes") return <Quizzes role={role} />;
  if (page === "forums") return <Forums role={role} />;
  if (page === "chat") return <Chat />;
  if (page === "ai-help") return <AiHelp role={role} />;
  if (page === "profile") return <Profile />;
  return <Dashboard role={role} />;
}
