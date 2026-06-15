"use client";

import { FormEvent, useState } from "react";
import { Bot, Send, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { SectionTitle } from "@/components/ui";

type ChatItem = { who: "user" | "assistant"; text: string };
const suggestions = ["How do I upload an assignment?", "How do I create a quiz?", "Where can I find class notes?"];

export function AiHelp({ role }: { role: string }) {
  const [messages, setMessages] = useState<ChatItem[]>([{ who: "assistant", text: `Hi. I’m ClassFlow Help. Ask me how to use your ${role} workspace.` }]);
  const [loading, setLoading] = useState(false);
  async function ask(question: string) { if (!question.trim()) return; setMessages(old => [...old, { who: "user", text: question }]); setLoading(true); try { const data = await api<{ answer: string }>("/ai/ask", { method: "POST", body: JSON.stringify({ question }) }); setMessages(old => [...old, { who: "assistant", text: data.answer }]); } finally { setLoading(false); } }
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = event.currentTarget; const question = String(new FormData(form).get("question")); form.reset(); await ask(question); }
  return <><SectionTitle eyebrow="Platform guidance" title="AI help" /><div className="mx-auto max-w-3xl"><div className="panel overflow-hidden"><div className="flex items-center gap-3 border-b border-line p-5"><span className="grid h-10 w-10 place-items-center rounded-xl bg-neon/10 text-neon"><Bot size={20} /></span><div><p className="font-black">ClassFlow Help</p><p className="text-xs text-neon">Online · platform guidance</p></div></div><div className="min-h-[430px] space-y-4 p-5 sm:p-7">{messages.map((message, index) => <div className={`flex ${message.who === "user" ? "justify-end" : "justify-start"}`} key={index}><div className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-6 ${message.who === "user" ? "bg-neon text-ink" : "border border-line bg-white/[.03] text-white/65"}`}>{message.text}</div></div>)}{loading && <p className="text-sm text-white/30">Thinking...</p>}</div><form className="flex gap-3 border-t border-line p-4" onSubmit={submit}><input className="input" name="question" placeholder="Ask how to do something..." required /><button className="btn" disabled={loading}><Send size={15} /></button></form></div><div className="mt-4 flex flex-wrap gap-2">{suggestions.map(item => <button className="btn-secondary text-xs" onClick={() => ask(item)} key={item}><Sparkles size={13} />{item}</button>)}</div></div></>;
}
