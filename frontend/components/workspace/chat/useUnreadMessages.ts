"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useChatEvents } from "./socket";

/**
 * The unread-message total behind the sidebar badge.
 *
 * Read once on mount and again on every socket (re)connect; between those the server pushes
 * an UNREAD event whenever the number changes - a message arriving, or a conversation being
 * read in any tab. Because AppShell mounts this on every workspace page, it is also what keeps
 * the chat socket open while the user is elsewhere in the app.
 */
export function useUnreadMessages() {
  const [total, setTotal] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const data = await api<{ total: number }>("/chat/unread");
      setTotal(data.total);
    } catch {
      // Never worth an error in the navigation; the next reconnect re-reads it, and a
      // signed-out user is redirected by AppShell anyway.
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useChatEvents((event) => {
    if (event.type === "UNREAD") setTotal(event.total);
  }, refresh);

  return total;
}
