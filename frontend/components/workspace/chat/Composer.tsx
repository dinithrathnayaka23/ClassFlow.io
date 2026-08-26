"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ImagePlus, Mic, Paperclip, Send, Square, Trash2, X } from "lucide-react";
import { formatBytes, formatDuration } from "./types";

type Pending = { file: File; previewUrl?: string; durationSeconds?: number };

/**
 * The message box: text, a photo or file to attach, or a recorded voice note.
 *
 * An attachment is staged rather than sent immediately, so a caption can be typed alongside
 * it and a mistaken pick can be dropped before anything leaves the browser.
 */
export function Composer({
  disabled,
  onSendText,
  onSendAttachment,
}: {
  disabled?: boolean;
  onSendText: (body: string) => Promise<void>;
  onSendAttachment: (
    file: File,
    body: string,
    durationSeconds?: number,
  ) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  // Mirrors `elapsed`, because the recorder's onstop handler reads the final length
  // after the last render and would otherwise close over a stale value.
  const recordedSeconds = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);

  // Object URLs are only valid until revoked, so each preview is released when it is
  // replaced or the composer unmounts.
  useEffect(() => {
    const url = pending?.previewUrl;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [pending?.previewUrl]);

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => {
      setElapsed((value) => {
        recordedSeconds.current = value + 1;
        return value + 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [recording]);

  // A recording still running when the view closes would keep the mic light on.
  useEffect(() => {
    return () => {
      recorder.current?.stream.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function stage(file: File | undefined) {
    if (!file) return;
    setError("");
    setPending({
      file,
      previewUrl: file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : undefined,
    });
  }

  async function startRecording() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser cannot record audio");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const instance = new MediaRecorder(stream);
      chunks.current = [];
      instance.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      instance.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks.current, { type: instance.mimeType });
        if (!blob.size) return;
        // Named for the recipient's download list; the extension follows the recorded type.
        const extension = instance.mimeType.includes("ogg") ? "ogg" : "webm";
        setPending({
          file: new File([blob], `voice-message.${extension}`, {
            type: instance.mimeType,
          }),
          durationSeconds: Math.max(1, Math.round(recordedSeconds.current)),
        });
      };
      recorder.current = instance;
      recordedSeconds.current = 0;
      setElapsed(0);
      instance.start();
      setRecording(true);
    } catch {
      setError("Microphone access was blocked");
    }
  }

  function stopRecording(keep: boolean) {
    const instance = recorder.current;
    if (!instance) return;
    if (!keep) instance.onstop = null;
    instance.stop();
    if (!keep) instance.stream.getTracks().forEach((track) => track.stop());
    recorder.current = null;
    setRecording(false);
  }

  function clearPending() {
    setPending(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = text.trim();
    if (!pending && !body) return;
    setError("");
    setSending(true);
    try {
      if (pending) {
        await onSendAttachment(pending.file, body, pending.durationSeconds);
        clearPending();
      } else {
        await onSendText(body);
      }
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the message");
    } finally {
      setSending(false);
    }
  }

  if (recording) {
    return (
      <div className="flex items-center gap-3 border-t border-line p-4">
        <span className="flex h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-red-400" />
        <p className="flex-1 text-sm font-bold">
          Recording {formatDuration(elapsed)}
        </p>
        <button
          type="button"
          className="rounded-full px-3 py-2 text-sm font-bold text-white/50 transition hover:text-red-300"
          onClick={() => stopRecording(false)}
        >
          <Trash2 size={16} className="mr-1 inline" />
          Discard
        </button>
        <button type="button" className="btn" onClick={() => stopRecording(true)}>
          <Square size={14} />
          Stop
        </button>
      </div>
    );
  }

  return (
    <form className="border-t border-line p-3 sm:p-4" onSubmit={submit}>
      {error && (
        <p className="mb-2 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}

      {pending && (
        <div className="mb-3 flex items-center gap-3 rounded-xl border border-line bg-white/[.03] p-2.5">
          {pending.previewUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={pending.previewUrl}
              alt=""
              className="h-12 w-12 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-neon/10 text-neon">
              {pending.durationSeconds ? (
                <Mic size={18} />
              ) : (
                <Paperclip size={18} />
              )}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{pending.file.name}</p>
            <p className="mt-0.5 text-xs text-white/35">
              {pending.durationSeconds
                ? formatDuration(pending.durationSeconds)
                : formatBytes(pending.file.size)}
            </p>
          </div>
          <button
            type="button"
            aria-label="Remove attachment"
            className="rounded-lg p-2 text-white/40 transition hover:bg-white/5 hover:text-red-300"
            onClick={clearPending}
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <input
          ref={fileInput}
          type="file"
          className="hidden"
          onChange={(event) => {
            stage(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <input
          ref={imageInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            stage(event.target.files?.[0]);
            event.target.value = "";
          }}
        />

        <button
          type="button"
          aria-label="Attach a file"
          title="Attach a file"
          className="shrink-0 rounded-lg p-2.5 text-white/45 transition hover:bg-white/5 hover:text-neon"
          disabled={disabled || sending}
          onClick={() => fileInput.current?.click()}
        >
          <Paperclip size={18} />
        </button>
        <button
          type="button"
          aria-label="Send a photo"
          title="Send a photo"
          className="shrink-0 rounded-lg p-2.5 text-white/45 transition hover:bg-white/5 hover:text-neon"
          disabled={disabled || sending}
          onClick={() => imageInput.current?.click()}
        >
          <ImagePlus size={18} />
        </button>

        <textarea
          className="input max-h-32 min-h-[2.75rem] flex-1 resize-none py-3"
          rows={1}
          placeholder={pending ? "Add a caption..." : "Write a message..."}
          value={text}
          disabled={disabled || sending}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends, Shift+Enter starts a new line.
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />

        {text.trim() || pending ? (
          <button
            className="btn shrink-0"
            disabled={disabled || sending}
            aria-label="Send message"
          >
            <Send size={16} />
          </button>
        ) : (
          <button
            type="button"
            aria-label="Record a voice message"
            title="Record a voice message"
            className="shrink-0 rounded-full bg-neon p-3 text-ink transition hover:bg-mint disabled:opacity-50"
            disabled={disabled || sending}
            onClick={startRecording}
          >
            <Mic size={16} />
          </button>
        )}
      </div>
    </form>
  );
}
