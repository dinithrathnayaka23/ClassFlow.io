export type AttachmentType = "IMAGE" | "FILE" | "AUDIO";

export type ChatContact = {
  id: number;
  fullName: string;
  email: string;
  role: string;
  unread: number;
  lastMessage?: string;
  lastAttachmentType?: AttachmentType;
  lastMessageAt?: string;
};

export type ChatMessage = {
  id: number;
  senderId: number;
  senderName: string;
  recipientId: number;
  body: string;
  sentAt: string;
  readAt?: string;
  attachmentName?: string;
  attachmentType?: AttachmentType;
  attachmentSize?: number;
  attachmentDurationSeconds?: number;
};

/**
 * Attachments are fetched by message id, never by their path on disk: the server checks the
 * caller is one of the two people in the conversation before streaming anything back.
 */
export function attachmentUrl(messageId: number) {
  return `/api/chat/attachments/${messageId}`;
}

export function formatBytes(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(seconds?: number) {
  if (seconds === undefined || seconds === null) return "";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Clock time for a bubble; the date lives on the day separator above it. */
export function formatClock(value: string) {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

/** "Today" / "Yesterday" / a date, used for the separators between days. */
export function formatDay(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(date, today)) return "Today";
  if (sameDay(date, yesterday)) return "Yesterday";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date);
}

/** The one-line preview under a name in the conversation list. */
export function previewOf(contact: ChatContact) {
  if (contact.lastAttachmentType === "IMAGE") return "Photo";
  if (contact.lastAttachmentType === "AUDIO") return "Voice message";
  if (contact.lastAttachmentType === "FILE") return "File";
  return contact.lastMessage || "";
}
