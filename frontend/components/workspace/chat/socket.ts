"use client";

import { useEffect, useRef, useState } from "react";
import { Client } from "@stomp/stompjs";
import { api } from "@/lib/api";
import type { ChatMessage } from "./types";

/**
 * The one chat socket for this tab.
 *
 * The sidebar badge and the chat screen both need it, and they mount independently, so the
 * connection is shared and reference counted: it opens with the first user and closes with the
 * last. Everything the server pushes arrives on a single queue, /user/queue/chat, as one of the
 * events below (see ChatEvent.java).
 *
 * Nothing here polls. Instead, every (re)connect is treated as "you may have missed something":
 * listeners get an onConnect call and re-read what they show. That covers the gap between a
 * screen's first fetch and the subscription going live, and anything that happened while the
 * connection was down.
 */
export type ChatEvent =
  | { type: "MESSAGE"; message: ChatMessage; clientId?: string }
  | { type: "READ"; contactId: number }
  | { type: "SEEN"; contactId: number; readAt: string }
  | { type: "UNREAD"; total: number }
  | { type: "ERROR"; clientId?: string; error: string };

/** How long a socket send waits for the server's echo before giving up on it. */
const SEND_TIMEOUT_MS = 10_000;

type Pending = {
  resolve: (message: ChatMessage) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

let client: Client | null = null;
let holders = 0;
let connected = false;
let sequence = 0;
const eventListeners = new Set<(event: ChatEvent) => void>();
const connectListeners = new Set<(connected: boolean) => void>();
const pending = new Map<string, Pending>();

/**
 * Same origin by default - next.config.ts proxies /ws to the API like it does /api.
 * NEXT_PUBLIC_WS_URL points straight at the API instead, for hosts whose proxy cannot carry
 * a WebSocket. The ticket in the CONNECT frame is what makes that work without the cookie.
 */
function socketUrl() {
  const configured = process.env.NEXT_PUBLIC_WS_URL;
  if (configured) return configured;
  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${window.location.host}/ws`;
}

function setConnected(value: boolean) {
  connected = value;
  connectListeners.forEach((listener) => listener(value));
}

/** Fails every send still waiting on an echo; used when the connection that carried them drops. */
function failPending(reason: string) {
  pending.forEach(({ reject, timer }) => {
    clearTimeout(timer);
    reject(new Error(reason));
  });
  pending.clear();
}

function dispatch(event: ChatEvent) {
  if ((event.type === "MESSAGE" || event.type === "ERROR") && event.clientId) {
    const waiting = pending.get(event.clientId);
    if (waiting) {
      pending.delete(event.clientId);
      clearTimeout(waiting.timer);
      if (event.type === "MESSAGE") waiting.resolve(event.message);
      else waiting.reject(new Error(event.error));
    }
  }
  if (event.type !== "ERROR") eventListeners.forEach((listener) => listener(event));
}

function open() {
  const socket: Client = new Client({
    brokerURL: socketUrl(),
    reconnectDelay: 3000,
    // Matches the server's heartbeat, so a connection that dies without closing is noticed
    // and replaced rather than sitting there silently receiving nothing.
    heartbeatIncoming: 10_000,
    heartbeatOutgoing: 10_000,
    // A fresh ticket for every attempt, reconnects included: each one is single use.
    beforeConnect: async () => {
      try {
        const { ticket } = await api<{ ticket: string }>("/chat/socket-ticket", { method: "POST" });
        socket.connectHeaders = { ticket };
      } catch {
        // Signed out or the API is down. Connecting anyway lets the cookie on the handshake
        // try; if that fails too the server refuses and the client retries after the delay.
        socket.connectHeaders = {};
      }
    },
    onConnect: () => {
      socket.subscribe("/user/queue/chat", (frame) => {
        try {
          dispatch(JSON.parse(frame.body) as ChatEvent);
        } catch {
          // A frame we cannot read is dropped; the next reconnect resynchronises anyway.
        }
      });
      setConnected(true);
    },
    onWebSocketClose: () => {
      if (connected) setConnected(false);
      failPending("The connection dropped before the message was confirmed. Check the conversation before sending it again.");
    },
  });
  client = socket;
  socket.activate();
}

function acquire() {
  holders += 1;
  if (holders === 1) open();
  return () => {
    holders -= 1;
    if (holders > 0) return;
    const closing = client;
    client = null;
    if (connected) setConnected(false);
    void closing?.deactivate();
  };
}

/**
 * Sends a text message, resolving with it once the server has stored it.
 *
 * Over the socket when it is up; over REST when it is not, so a message typed during a
 * reconnect is not lost. Attachments always go over REST - they are multipart uploads.
 */
export function sendChatText(recipientId: number, body: string): Promise<ChatMessage> {
  const socket = client;
  if (!socket || !connected) {
    return api<ChatMessage>("/chat/messages", {
      method: "POST",
      body: JSON.stringify({ recipientId, body }),
    });
  }
  // Not crypto.randomUUID: that only exists in secure contexts, and a phone testing against
  // a laptop over plain http on the LAN is not one. Uniqueness within this tab is all we need.
  const clientId = `${Date.now().toString(36)}-${(sequence += 1)}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(clientId);
      reject(new Error("The message was not confirmed. Check the conversation before sending it again."));
    }, SEND_TIMEOUT_MS);
    pending.set(clientId, { resolve, reject, timer });
    socket.publish({
      destination: "/app/chat.send",
      body: JSON.stringify({ recipientId, body }),
      headers: { "client-id": clientId },
    });
  });
}

/**
 * Keeps the socket open while the calling component is mounted.
 *
 * onEvent sees every pushed event; onConnect runs on every (re)connect and should re-read
 * whatever the component shows. Both may change between renders - the latest ones are used.
 */
export function useChatEvents(onEvent: (event: ChatEvent) => void, onConnect?: () => void) {
  const handlers = useRef({ onEvent, onConnect });
  useEffect(() => {
    handlers.current = { onEvent, onConnect };
  });

  useEffect(() => {
    const release = acquire();
    const eventListener = (event: ChatEvent) => handlers.current.onEvent(event);
    const connectListener = (up: boolean) => {
      if (up) handlers.current.onConnect?.();
    };
    eventListeners.add(eventListener);
    connectListeners.add(connectListener);
    return () => {
      eventListeners.delete(eventListener);
      connectListeners.delete(connectListener);
      release();
    };
  }, []);
}

/**
 * True once the socket has connected and then lost its connection - false on the first
 * connect, so opening the page does not flash a warning for the half second that takes.
 */
export function useChatReconnecting() {
  const [reconnecting, setReconnecting] = useState(false);
  useEffect(() => {
    let wasUp = connected;
    const listener = (up: boolean) => {
      if (up) setReconnecting(false);
      else if (wasUp) setReconnecting(true);
      wasUp = wasUp || up;
    };
    connectListeners.add(listener);
    return () => {
      connectListeners.delete(listener);
    };
  }, []);
  return reconnecting;
}
