"use client";

import { useEffect, useState } from "react";
import { api, Course, Page } from "@/lib/api";

export function useCourses() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const reload = () => api<Page<Course>>("/courses?size=100").then(data => setCourses(data.items)).finally(() => setLoading(false));
  useEffect(() => { reload(); }, []);
  return { courses, loading, reload };
}

export function CoursePicker({ courses, value, onChange }: { courses: Course[]; value?: number; onChange: (id: number) => void }) {
  return <select className="input max-w-sm" value={value || ""} onChange={event => onChange(Number(event.target.value))}><option value="" disabled>Select a course</option>{courses.map(course => <option key={course.id} value={course.id}>{course.code} · {course.title}</option>)}</select>;
}

export function Modal({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4" onClick={onClose}><div className="panel max-h-[90vh] w-full max-w-xl overflow-auto p-6" onClick={e => e.stopPropagation()}><div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-black">{title}</h2><button className="text-white/45 hover:text-white" onClick={onClose}>Close</button></div>{children}</div></div>;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="label">{label}</span>{children}</label>;
}

export function formatDate(value?: string) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
