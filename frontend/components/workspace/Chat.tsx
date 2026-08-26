"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, MessageCircle, Search } from "lucide-react";
import { api, User } from "@/lib/api";
import { Empty, Notice, SectionTitle } from "@/components/ui";
import { Composer } from "./chat/Composer";
import { MessageBubble } from "./chat/MessageBubble";
import { notifyUnreadChanged } from "./chat/useUnreadMessages";
import {
  ChatContact,
  ChatMessage,
  formatDay,
  previewOf,
} from "./chat/types";

/** How often the open conversation and the contact list refresh. */
const MESSAGE_POLL_MS = 3000;
const CONTACT_POLL_MS = 6000;

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

export function Chat({ role }: { role: string }) {
  const [me, setMe] = useState<User>();
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  const scroller = useRef<HTMLDivElement>(null);
  // Tracks the newest message already on screen, so the view only auto-scrolls when
  // something new arrives rather than fighting the reader on every poll.
  const lastSeenId = useRef<number>(0);

  const active = contacts.find((contact) => contact.id === activeId);

  const loadContacts = useCallback(async () => {
    try {
      setContacts(await api<ChatContact[]>("/chat/contacts"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load conversations");
    } finally {
      setLoaded(true);
    }
  }, []);

  const loadMessages = useCallback(async (otherId: number) => {
    try {
      setMessages(await api<ChatMessage[]>(`/chat/messages/${otherId}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load messages");
    }
  }, []);

  /** Clears the badge for this conversation, both here and in the sidebar. */
  const markRead = useCallback(
    async (otherId: number) => {
      try {
        const result = await api<{ marked: number }>(
          `/chat/messages/${otherId}/read`,
          { method: "POST" },
        );
        if (result.marked > 0) {
          setContacts((current) =>
            current.map((contact) =>
              contact.id === otherId ? { ...contact, unread: 0 } : contact,
            ),
          );
          notifyUnreadChanged();
        }
      } catch {
        // Read receipts are not worth surfacing an error over; the next open retries.
      }
    },
    [],
  );

  useEffect(() => {
    api<User>("/auth/me").then(setMe).catch(() => {});
  }, []);

  useEffect(() => {
    loadContacts();
    const timer = setInterval(loadContacts, CONTACT_POLL_MS);
    return () => clearInterval(timer);
  }, [loadContacts]);

  useEffect(() => {
    if (activeId === null) return;
    lastSeenId.current = 0;
    setMessages([]);
    loadMessages(activeId);
    markRead(activeId);
    const timer = setInterval(() => {
      loadMessages(activeId);
      // Anything that arrives while the conversation is open counts as read.
      markRead(activeId);
    }, MESSAGE_POLL_MS);
    return () => clearInterval(timer);
  }, [activeId, loadMessages, markRead]);

  useEffect(() => {
    const newest = messages.at(-1);
    if (!newest || newest.id === lastSeenId.current) return;
    const firstLoad = lastSeenId.current === 0;
    lastSeenId.current = newest.id;
    scroller.current?.scrollTo({
      top: scroller.current.scrollHeight,
      behavior: firstLoad ? "auto" : "smooth",
    });
  }, [messages]);

  async function sendText(body: string) {
    if (activeId === null) return;
    await api("/chat/messages", {
      method: "POST",
      body: JSON.stringify({ recipientId: activeId, body }),
    });
    await Promise.all([loadMessages(activeId), loadContacts()]);
  }

  async function sendAttachment(
    file: File,
    body: string,
    durationSeconds?: number,
  ) {
    if (activeId === null) return;
    const payload = new FormData();
    payload.append("recipientId", String(activeId));
    payload.append("file", file);
    if (body) payload.append("body", body);
    if (durationSeconds !== undefined) {
      payload.append("durationSeconds", String(durationSeconds));
    }
    await api("/chat/messages/attachment", { method: "POST", body: payload });
    await Promise.all([loadMessages(activeId), loadContacts()]);
  }

  const term = search.trim().toLowerCase();
  const visible = term
    ? contacts.filter((contact) =>
        contact.fullName.toLowerCase().includes(term),
      )
    : contacts;

  if (loaded && !contacts.length) {
    return (
      <>
        <SectionTitle eyebrow="Direct conversations" title="Chat" />
        <Notice error={error} />
        <Empty
          title="No one to message yet"
          text={
            role === "student"
              ? "A teacher appears here once they approve your request to join. An admin is always reachable."
              : "Contacts appear here once accounts are active."
          }
        />
      </>
    );
  }

  return (
    <>
      <SectionTitle eyebrow="Direct conversations" title="Chat" />
      <Notice error={error} />
      <div className="panel grid h-[calc(100vh-13rem)] min-h-[30rem] overflow-hidden md:grid-cols-[300px_1fr]">
        {/* One pane at a time on a phone, both side by side from md up. */}
        <aside
          className={`min-h-0 flex-col border-line md:flex md:border-r ${
            activeId === null ? "flex" : "hidden"
          }`}
        >
          <div className="shrink-0 border-b border-line p-3">
            <label className="relative block">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/30"
              />
              <input
                className="input pl-9"
                placeholder="Search conversations"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Search conversations"
              />
            </label>
          </div>
          <div className="neon-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {visible.map((contact) => (
              <button
                key={contact.id}
                onClick={() => setActiveId(contact.id)}
                className={`flex w-full items-center gap-3 border-b border-line/60 px-3 py-3 text-left transition ${
                  activeId === contact.id
                    ? "bg-neon/[.07]"
                    : "hover:bg-white/[.03]"
                }`}
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-neon/15 text-xs font-black text-neon">
                  {initials(contact.fullName)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-bold">
                      {contact.fullName}
                    </span>
                    {contact.lastMessageAt && (
                      <span className="shrink-0 text-[10px] text-white/30">
                        {formatDay(contact.lastMessageAt)}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-white/35">
                      {previewOf(contact) || contact.role}
                    </span>
                    {contact.unread > 0 && (
                      <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-neon px-1.5 text-[11px] font-black text-ink">
                        {contact.unread > 99 ? "99+" : contact.unread}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            ))}
            {!visible.length && (
              <p className="p-6 text-center text-sm text-white/35">
                No one matches “{search}”.
              </p>
            )}
            {/* A student's teachers appear only once they join that teacher's course,
                so say so rather than leaving the short list looking broken. */}
            {role === "student" && !term && (
              <p className="border-t border-line/60 p-4 text-center text-xs leading-5 text-white/30">
                A teacher appears here once they approve your request to join their course.
              </p>
            )}
          </div>
        </aside>

        <section
          className={`min-h-0 flex-col ${activeId === null ? "hidden md:flex" : "flex"}`}
        >
          {active ? (
            <>
              <header className="flex shrink-0 items-center gap-3 border-b border-line px-3 py-3 sm:px-5">
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-white/60 transition hover:bg-white/5 md:hidden"
                  aria-label="Back to conversations"
                  onClick={() => setActiveId(null)}
                >
                  <ArrowLeft size={19} />
                </button>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-neon/15 text-xs font-black text-neon">
                  {initials(active.fullName)}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-black">{active.fullName}</p>
                  <p className="truncate text-xs text-white/30">
                    {active.role.toLowerCase()} · {active.email}
                  </p>
                </div>
              </header>

              <div
                ref={scroller}
                className="neon-scroll min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-3 sm:p-5"
              >
                {messages.map((message, index) => {
                  const previous = messages[index - 1];
                  const newDay =
                    !previous ||
                    new Date(previous.sentAt).toDateString() !==
                      new Date(message.sentAt).toDateString();
                  return (
                    <Fragment key={message.id}>
                      {newDay && (
                        <p className="py-3 text-center text-[11px] font-bold uppercase tracking-widest text-white/25">
                          {formatDay(message.sentAt)}
                        </p>
                      )}
                      <MessageBubble
                        message={message}
                        mine={message.senderId === me?.id}
                      />
                    </Fragment>
                  );
                })}
                {!messages.length && (
                  <div className="grid h-full place-items-center text-center">
                    <div>
                      <MessageCircle className="mx-auto text-neon" />
                      <p className="mt-4 font-bold">Start the conversation</p>
                      <p className="mt-2 text-sm text-white/35">
                        Send a message, a photo, a file or a voice note.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <Composer
                onSendText={sendText}
                onSendAttachment={sendAttachment}
              />
            </>
          ) : (
            <div className="grid h-full place-items-center p-8 text-center">
              <div>
                <MessageCircle className="mx-auto text-neon" />
                <p className="mt-4 font-bold">Choose a conversation</p>
                <p className="mt-2 text-sm text-white/35">
                  Pick someone on the left to start messaging.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
