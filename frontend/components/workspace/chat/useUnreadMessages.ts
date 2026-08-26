"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

/**
 * Fires when something in this tab changes the unread count - opening a conversation, or
 * sending in one. The badge listens so it updates immediately instead of waiting for the
 * next poll, which would otherwise leave a stale number on screen for several seconds.
 */
const UNREAD_CHANGED = "classflow:unread-changed";

/** Poll interval for the sidebar badge. The query is a single indexed count. */
const REFRESH_MS = 10_000;

export function notifyUnreadChanged() {
  window.dispatchEvent(new Event(UNREAD_CHANGED));
}

export function useUnreadMessages() {
  const [total, setTotal] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const data = await api<{ total: number }>("/chat/unread");
      setTotal(data.total);
    } catch {
      // A failed poll should never surface as an error in the navigation; the next
      // one recovers, and a signed-out user is redirected by AppShell anyway.
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    window.addEventListener(UNREAD_CHANGED, refresh);
    // Coming back to the tab is the moment a stale count is most obvious.
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener(UNREAD_CHANGED, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  return total;
}
