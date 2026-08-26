"use client";

import { useState } from "react";
import { Check, CheckCheck, Download, FileText, Mic } from "lucide-react";
import {
  ChatMessage,
  attachmentUrl,
  formatBytes,
  formatClock,
  formatDuration,
} from "./types";

/**
 * One message. Photos render inline, voice notes get a player, and anything else becomes a
 * download card - the same three shapes a phone messenger uses.
 */
export function MessageBubble({
  message,
  mine,
}: {
  message: ChatMessage;
  mine: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const href = attachmentUrl(message.id);
  const hasAttachment = Boolean(message.attachmentType);
  const muted = mine ? "text-ink/50" : "text-white/30";

  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] overflow-hidden rounded-2xl sm:max-w-[70%] ${
          mine
            ? "rounded-br-sm bg-neon text-ink"
            : "rounded-bl-sm border border-line bg-white/[.04]"
        } ${hasAttachment && message.attachmentType === "IMAGE" ? "p-1.5" : "px-3.5 py-2.5"}`}
      >
        {message.attachmentType === "IMAGE" && !imageFailed && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="block w-full"
            aria-label={`Open image ${message.attachmentName}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={href}
              alt={message.attachmentName || "Shared image"}
              onError={() => setImageFailed(true)}
              className="max-h-72 w-full rounded-xl object-cover"
            />
          </button>
        )}

        {message.attachmentType === "IMAGE" && imageFailed && (
          <AttachmentCard message={message} href={href} mine={mine} />
        )}

        {message.attachmentType === "AUDIO" && (
          <div className="min-w-[13rem]">
            <div className="flex items-center gap-2">
              <Mic size={14} className={mine ? "text-ink/70" : "text-neon"} />
              <span className="text-xs font-bold">Voice message</span>
              {message.attachmentDurationSeconds ? (
                <span className={`text-xs ${muted}`}>
                  {formatDuration(message.attachmentDurationSeconds)}
                </span>
              ) : null}
            </div>
            {/* Native controls: they already handle scrubbing, volume and keyboard access. */}
            <audio
              controls
              preload="none"
              src={href}
              className="mt-2 h-9 w-full"
            />
          </div>
        )}

        {message.attachmentType === "FILE" && (
          <AttachmentCard message={message} href={href} mine={mine} />
        )}

        {message.body && (
          <p
            className={`whitespace-pre-wrap break-words text-sm leading-relaxed ${
              hasAttachment ? "mt-2 px-2" : ""
            }`}
          >
            {message.body}
          </p>
        )}

        <div
          className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${muted} ${
            message.attachmentType === "IMAGE" ? "px-2 pb-1" : ""
          }`}
        >
          {formatClock(message.sentAt)}
          {/* Ticks only make sense on your own messages, as on a phone. */}
          {mine &&
            (message.readAt ? <CheckCheck size={13} /> : <Check size={13} />)}
        </div>
      </div>

      {expanded && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/90 p-4"
          onClick={() => setExpanded(false)}
          role="dialog"
          aria-modal="true"
          aria-label={message.attachmentName || "Image"}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={href}
            alt={message.attachmentName || "Shared image"}
            className="max-h-full max-w-full rounded-lg object-contain"
          />
        </div>
      )}
    </div>
  );
}

function AttachmentCard({
  message,
  href,
  mine,
}: {
  message: ChatMessage;
  href: string;
  mine: boolean;
}) {
  return (
    <a
      href={href}
      download={message.attachmentName}
      className={`flex items-center gap-3 rounded-lg px-1 py-1 transition ${
        mine ? "hover:bg-ink/10" : "hover:bg-white/5"
      }`}
    >
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
          mine ? "bg-ink/15" : "bg-neon/10 text-neon"
        }`}
      >
        <FileText size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">
          {message.attachmentName}
        </span>
        <span
          className={`block text-[11px] ${mine ? "text-ink/50" : "text-white/35"}`}
        >
          {formatBytes(message.attachmentSize)}
        </span>
      </span>
      <Download size={15} className="shrink-0 opacity-60" />
    </a>
  );
}
