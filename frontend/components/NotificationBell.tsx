"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, CheckCheck, Trash2 } from "lucide-react";
import { api } from "@/lib/api";

type Notification = {
  id: number;
  type: string;
  title: string;
  body?: string;
  link?: string;
  createdAt: string;
  readAt?: string;
};

/** Poll interval for the badge. The query behind it is a single indexed count. */
const REFRESH_MS = 20_000;

/** "just now" / "5m" / "3h" / "2d" - compact enough for a dense list. */
function ago(iso: string) {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
    new Date(iso),
  );
}

export function NotificationBell({ role }: { role: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  const refreshCount = useCallback(async () => {
    try {
      const data = await api<{ total: number }>("/notifications/unread");
      setUnread(data.total);
    } catch {
      // A dropped poll is not worth surfacing in the chrome; the next one recovers.
    }
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api<Notification[]>("/notifications"));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshCount();
    const timer = setInterval(refreshCount, REFRESH_MS);
    // Returning to the tab is when a stale count is most obvious.
    window.addEventListener("focus", refreshCount);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refreshCount);
    };
  }, [refreshCount]);

  // Close on an outside click or Escape, the way a menu is expected to behave.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (panel.current && !panel.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) loadItems();
  }

  async function openItem(item: Notification) {
    setOpen(false);
    if (!item.readAt) {
      setUnread((current) => Math.max(0, current - 1));
      try {
        await api(`/notifications/${item.id}/read`, { method: "POST" });
      } catch {
        refreshCount();
      }
    }
    // The stored link is a workspace section, so it works whatever role is browsing.
    if (item.link) router.push(`/${role}/${item.link}`);
  }

  async function markAllRead() {
    setUnread(0);
    setItems((current) =>
      current.map((one) =>
        one.readAt ? one : { ...one, readAt: new Date().toISOString() },
      ),
    );
    try {
      await api("/notifications/read-all", { method: "POST" });
    } catch {
      refreshCount();
    }
  }

  async function clearAll() {
    setItems([]);
    setUnread(0);
    try {
      await api("/notifications", { method: "DELETE" });
    } catch {
      loadItems();
      refreshCount();
    }
  }

  return (
    <div className="relative" ref={panel}>
      <button
        type="button"
        onClick={toggle}
        aria-label={
          unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
        }
        aria-expanded={open}
        className="relative rounded-lg p-2 text-white/60 transition hover:bg-white/5 hover:text-white"
      >
        <Bell size={19} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-neon px-1 text-[10px] font-black text-ink">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="panel absolute right-0 z-50 mt-2 flex max-h-[70vh] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden"
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-4 py-3">
            <p className="text-sm font-black">Notifications</p>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button
                  type="button"
                  title="Mark all as read"
                  aria-label="Mark all as read"
                  className="rounded-lg p-1.5 text-white/45 transition hover:bg-white/5 hover:text-neon"
                  onClick={markAllRead}
                >
                  <CheckCheck size={15} />
                </button>
              )}
              {items.length > 0 && (
                <button
                  type="button"
                  title="Clear all"
                  aria-label="Clear all notifications"
                  className="rounded-lg p-1.5 text-white/45 transition hover:bg-white/5 hover:text-red-300"
                  onClick={clearAll}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          </div>

          <div className="neon-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {loading && !items.length ? (
              <p className="px-4 py-10 text-center text-sm text-white/35">
                Loading...
              </p>
            ) : items.length ? (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openItem(item)}
                  className={`flex w-full gap-3 border-b border-line/60 px-4 py-3 text-left transition last:border-0 hover:bg-white/[.03] ${
                    item.readAt ? "" : "bg-neon/[.04]"
                  }`}
                >
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      item.readAt ? "bg-transparent" : "bg-neon"
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold leading-snug">
                      {item.title}
                    </span>
                    {item.body && (
                      <span className="mt-0.5 block text-xs leading-snug text-white/40">
                        {item.body}
                      </span>
                    )}
                    <span className="mt-1 block text-[10px] text-white/25">
                      {ago(item.createdAt)}
                    </span>
                  </span>
                </button>
              ))
            ) : (
              <div className="px-4 py-10 text-center">
                <Check size={20} className="mx-auto text-white/20" />
                <p className="mt-3 text-sm font-bold text-white/45">
                  You are all caught up
                </p>
                <p className="mt-1 text-xs text-white/25">
                  New activity on your courses appears here.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
