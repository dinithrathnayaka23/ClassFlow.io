"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, MessageCircle, Search } from "lucide-react";
import { api, User } from "@/lib/api";
import { Empty, Notice, SectionTitle } from "@/components/ui";
import { Composer } from "./chat/Composer";
import { MessageBubble } from "./chat/MessageBubble";
import { sendChatText, useChatEvents, useChatReconnecting } from "./chat/socket";
import {
  ChatContact,
  ChatMessage,
  formatDay,
  previewOf,
} from "./chat/types";

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

/**
 * Adds messages by id, so one that arrives both as a pushed event and in a history fetch
 * appears once. Ids are assigned in insert order, which is the order they were sent in.
 */
function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const byId = new Map(current.map((message) => [message.id, message]));
  incoming.forEach((message) => byId.set(message.id, message));
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

/** Most recent conversation first, then by name - the same order the server lists them in. */
function sortContacts(contacts: ChatContact[]) {
  const when = (contact: ChatContact) =>
    contact.lastMessageAt ? Date.parse(contact.lastMessageAt) : -Infinity;
  return [...contacts].sort(
    (a, b) => when(b) - when(a) || a.fullName.localeCompare(b.fullName),
  );
}

function tabVisible() {
  return document.visibilityState === "visible";
}

export function Chat({ role }: { role: string }) {
  const [me, setMe] = useState<User>();
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const reconnecting = useChatReconnecting();

  const scroller = useRef<HTMLDivElement>(null);
  // Tracks the newest message already on screen, so the view only auto-scrolls when
  // something new arrives rather than jumping when an existing message is updated.
  const lastSeenId = useRef<number>(0);
  // The open conversation, for async work that finishes after the user may have moved on.
  const activeRef = useRef<number | null>(null);

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
      const fetched = await api<ChatMessage[]>(`/chat/messages/${otherId}`);
      // A reply for a conversation the user has since left must not land in the one they opened.
      if (activeRef.current !== otherId) return;
      // Merged rather than replaced: an event that arrived while this was in flight stays.
      setMessages((current) => mergeMessages(current, fetched));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load messages");
    }
  }, []);

  /**
   * Marks the conversation read. The server answers with READ and UNREAD events, which clear
   * this badge in every open tab and the sidebar total; clearing it here as well just saves
   * the round trip.
   */
  const markRead = useCallback(async (otherId: number) => {
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
      }
    } catch {
      // Read receipts are not worth surfacing an error over; the next open retries.
    }
  }, []);

  /**
   * Puts a message where it belongs: in the open conversation if it is part of it, and as the
   * preview and unread count on its contact. Safe to call twice for the same message, which
   * happens when a send's own result and its pushed echo both arrive.
   */
  function applyMessage(message: ChatMessage) {
    // Contacts never include you, so whichever side of the message is listed is the other person.
    const otherId = contacts.some((contact) => contact.id === message.senderId)
      ? message.senderId
      : message.recipientId;
    if (!contacts.some((contact) => contact.id === otherId)) {
      // Someone new - typically a teacher who has just approved this student. Re-read the list.
      loadContacts();
      return;
    }
    const incoming = message.senderId === otherId;
    const open = otherId === activeRef.current;
    const seen = open && tabVisible();

    if (open) setMessages((current) => mergeMessages(current, [message]));
    // Anything that arrives in the conversation you are looking at counts as read.
    if (incoming && seen) markRead(otherId);

    setContacts((current) =>
      sortContacts(
        current.map((contact) => {
          if (contact.id !== otherId) return contact;
          const newer =
            !contact.lastMessageAt ||
            Date.parse(message.sentAt) >= Date.parse(contact.lastMessageAt);
          return {
            ...contact,
            ...(newer && {
              lastMessage: message.body,
              lastAttachmentType: message.attachmentType,
              lastMessageAt: message.sentAt,
            }),
            unread: incoming && !seen ? contact.unread + 1 : contact.unread,
          };
        }),
      ),
    );
  }

  useChatEvents(
    (event) => {
      switch (event.type) {
        case "MESSAGE":
          applyMessage(event.message);
          break;
        case "READ":
          setContacts((current) =>
            current.map((contact) =>
              contact.id === event.contactId ? { ...contact, unread: 0 } : contact,
            ),
          );
          break;
        case "SEEN":
          // They read what you sent them: turn those ticks to read.
          if (event.contactId === activeRef.current) {
            setMessages((current) =>
              current.map((message) =>
                message.recipientId === event.contactId && !message.readAt
                  ? { ...message, readAt: event.readAt }
                  : message,
              ),
            );
          }
          break;
      }
    },
    // On every (re)connect, catch up on anything that happened while there was no socket.
    () => {
      loadContacts();
      const otherId = activeRef.current;
      if (otherId !== null) {
        loadMessages(otherId);
        if (tabVisible()) markRead(otherId);
      }
    },
  );

  useEffect(() => {
    api<User>("/auth/me").then(setMe).catch(() => {});
  }, []);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  useEffect(() => {
    activeRef.current = activeId;
    if (activeId === null) return;
    lastSeenId.current = 0;
    setMessages([]);
    loadMessages(activeId);
    markRead(activeId);
  }, [activeId, loadMessages, markRead]);

  // Messages that arrived while the tab was in the background are read once it is back.
  useEffect(() => {
    const onVisible = () => {
      if (tabVisible() && activeRef.current !== null) markRead(activeRef.current);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [markRead]);

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
    applyMessage(await sendChatText(activeId, body));
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
    applyMessage(
      await api<ChatMessage>("/chat/messages/attachment", {
        method: "POST",
        body: payload,
      }),
    );
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
      {reconnecting && (
        <p className="mb-3 text-xs text-white/45" role="status">
          Reconnecting… new messages will appear as soon as the connection is back.
        </p>
      )}
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
