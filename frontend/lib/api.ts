export const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: "include"
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ message: "Request failed" }));
    throw new Error(payload.message || `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

export type User = { id: number; email: string; fullName: string; role: "ADMIN" | "TEACHER" | "STUDENT" };
export type Course = {
  id: number; title: string; code: string; description: string; subject: string; active: boolean;
  teacherId: number; teacherName: string; studentCount: number; createdAt: string;
};
export type Page<T> = { items: T[]; total: number; page: number; size: number };
