"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, MessageSquare, Plus, Send } from "lucide-react";
import { api } from "@/lib/api";
import { Card, Empty, Notice, SectionTitle } from "@/components/ui";
import { CoursePicker, Field, Modal, formatDate, useCourses } from "./shared";

type Topic = {
  id: number;
  title: string;
  body: string;
  author: string;
  createdAt: string;
  replyCount: number;
};
type Post = {
  id: number;
  body: string;
  author: string;
  authorRole: string;
  createdAt: string;
};

export function Forums({ role }: { role: string }) {
  const { courses } = useCourses();
  const [courseId, setCourseId] = useState<number>();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [active, setActive] = useState<Topic>();
  const [posts, setPosts] = useState<Post[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!courseId && courses[0]) setCourseId(courses[0].id);
  }, [courses, courseId]);
  const load = () =>
    courseId && api<Topic[]>(`/forums?courseId=${courseId}`).then(setTopics);
  useEffect(() => {
    load();
    setActive(undefined);
  }, [courseId]);
  async function select(topic: Topic) {
    setActive(topic);
    setPosts(await api(`/forums/${topic.id}/posts`));
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await api("/forums", {
        method: "POST",
        body: JSON.stringify({
          ...Object.fromEntries(new FormData(event.currentTarget)),
          courseId,
        }),
      });
      setOpen(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create topic");
    }
  }
  async function reply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!active) return;
    await api(`/forums/${active.id}/posts`, {
      method: "POST",
      body: JSON.stringify(
        Object.fromEntries(new FormData(event.currentTarget)),
      ),
    });
    setPosts(await api(`/forums/${active.id}/posts`));
    event.currentTarget.reset();
  }
  return (
    <>
      <SectionTitle
        eyebrow="Course conversations"
        title="Forums"
        action={
          role !== "student" && !active ? (
            <button className="btn" onClick={() => setOpen(true)}>
              <Plus size={16} />
              New topic
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
      {active ? (
        <section className="panel p-6">
          <button
            className="mb-5 flex items-center gap-2 text-sm text-white/40 hover:text-neon"
            onClick={() => setActive(undefined)}
          >
            <ArrowLeft size={14} />
            Topics
          </button>
          <h2 className="text-2xl font-black">{active.title}</h2>
          <p className="mt-3 max-w-3xl leading-7 text-white/50">
            {active.body}
          </p>
          <div className="mt-8 space-y-3">
            {posts.map((post) => (
              <div className="card" key={post.id}>
                <div className="flex items-center gap-2">
                  <p className="font-bold">{post.author}</p>
                  <span className="badge">{post.authorRole}</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-white/55">
                  {post.body}
                </p>
                <p className="mt-3 text-xs text-white/25">
                  {formatDate(post.createdAt)}
                </p>
              </div>
            ))}
            {!posts.length && (
              <p className="py-6 text-sm text-white/35">
                No replies yet. Start the discussion.
              </p>
            )}
          </div>
          <form className="mt-5 flex gap-3" onSubmit={reply}>
            <input
              className="input"
              name="body"
              placeholder="Write a useful reply..."
              required
            />
            <button className="btn">
              <Send size={15} />
              <span className="hidden sm:inline">Reply</span>
            </button>
          </form>
        </section>
      ) : topics.length ? (
        <div className="space-y-3">
          {topics.map((topic) => (
            <button
              onClick={() => select(topic)}
              className="card flex w-full items-center justify-between gap-5 text-left transition hover:border-neon/35"
              key={topic.id}
            >
              <div>
                <h2 className="font-black">{topic.title}</h2>
                <p className="mt-2 line-clamp-1 text-sm text-white/40">
                  {topic.body}
                </p>
                <p className="mt-3 text-xs text-white/25">
                  {topic.author} · {formatDate(topic.createdAt)}
                </p>
              </div>
              <span className="flex shrink-0 items-center gap-2 text-sm font-bold text-neon">
                <MessageSquare size={15} />
                {topic.replyCount}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <Empty
          title="No forum topics yet"
          text="Course discussions will appear here."
        />
      )}
      <Modal
        title="Open a forum topic"
        open={open}
        onClose={() => setOpen(false)}
      >
        <Notice error={error} />
        <form className="space-y-4" onSubmit={create}>
          <Field label="Topic title">
            <input className="input" name="title" required />
          </Field>
          <Field label="Opening message">
            <textarea className="input" name="body" rows={5} required />
          </Field>
          <button className="btn w-full">Open topic</button>
        </form>
      </Modal>
    </>
  );
}
