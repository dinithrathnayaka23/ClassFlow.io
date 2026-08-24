"use client";

import { FormEvent, useEffect, useState } from "react";
import { MessageCircle, Send } from "lucide-react";
import { api, User } from "@/lib/api";
import { Empty, SectionTitle } from "@/components/ui";
import { formatDate } from "./shared";

type Contact = { id: number; fullName: string; email: string; role: string };
type Message = {
  id: number;
  senderId: number;
  senderName: string;
  recipientId: number;
  body: string;
  sentAt: string;
};

export function Chat() {
  const [me, setMe] = useState<User>();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [active, setActive] = useState<Contact>();
  const [messages, setMessages] = useState<Message[]>([]);
  useEffect(() => {
    api<User>("/auth/me").then(setMe);
    api<Contact[]>("/chat/contacts").then(setContacts);
  }, []);
  useEffect(() => {
    if (!active && contacts[0]) setActive(contacts[0]);
  }, [contacts, active]);
  const load = () =>
    active && api<Message[]>(`/chat/messages/${active.id}`).then(setMessages);
  useEffect(() => {
    load();
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, [active]);
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!active) return;
    const form = event.currentTarget;
    const body = new FormData(form).get("body");
    await api("/chat/messages", {
      method: "POST",
      body: JSON.stringify({ recipientId: active.id, body }),
    });
    form.reset();
    load();
  }
  return (
    <>
      <SectionTitle eyebrow="Direct conversations" title="Chat" />
      <div className="panel grid min-h-[68vh] overflow-hidden md:grid-cols-[260px_1fr]">
        <aside className="border-b border-line p-3 md:border-b-0 md:border-r">
          <p className="label px-2 py-2">Contacts</p>
          <div className="flex gap-2 overflow-x-auto md:block md:space-y-1">
            {contacts.map((contact) => (
              <button
                key={contact.id}
                onClick={() => setActive(contact)}
                className={`min-w-48 rounded-lg px-3 py-3 text-left transition md:w-full ${active?.id === contact.id ? "bg-neon/10 text-neon" : "hover:bg-white/[.03]"}`}
              >
                <p className="text-sm font-bold">{contact.fullName}</p>
                <p className="mt-1 text-xs opacity-45">{contact.role}</p>
              </button>
            ))}
          </div>
        </aside>
        <section className="flex min-h-[520px] flex-col">
          {active ? (
            <>
              <header className="border-b border-line px-5 py-4">
                <p className="font-black">{active.fullName}</p>
                <p className="mt-1 text-xs text-white/30">{active.email}</p>
              </header>
              <div className="flex-1 space-y-3 overflow-auto p-5">
                {messages.map((message) => (
                  <div
                    className={`flex ${message.senderId === me?.id ? "justify-end" : "justify-start"}`}
                    key={message.id}
                  >
                    <div
                      className={`max-w-[78%] rounded-xl px-4 py-3 text-sm ${message.senderId === me?.id ? "bg-neon text-ink" : "border border-line bg-white/[.03]"}`}
                    >
                      <p>{message.body}</p>
                      <p
                        className={`mt-2 text-[10px] ${message.senderId === me?.id ? "text-ink/50" : "text-white/25"}`}
                      >
                        {formatDate(message.sentAt)}
                      </p>
                    </div>
                  </div>
                ))}
                {!messages.length && (
                  <div className="grid h-full place-items-center text-center">
                    <div>
                      <MessageCircle className="mx-auto text-neon" />
                      <p className="mt-4 font-bold">Start the conversation</p>
                      <p className="mt-2 text-sm text-white/35">
                        Messages remain available in ClassFlow.
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <form
                className="flex gap-3 border-t border-line p-4"
                onSubmit={send}
              >
                <input
                  className="input"
                  name="body"
                  placeholder="Write a message..."
                  autoComplete="off"
                  required
                />
                <button className="btn">
                  <Send size={15} />
                </button>
              </form>
            </>
          ) : (
            <Empty
              title="No contacts available"
              text="Teachers and students appear here."
            />
          )}
        </section>
      </div>
    </>
  );
}
