"use client";

import { FormEvent, useState } from "react";
import { KeyRound } from "lucide-react";
import { api } from "@/lib/api";
import { Notice } from "@/components/ui";
import { Field } from "./shared";

/**
 * Self-service password change on the profile page.
 *
 * The current password is required, so an unattended browser is not enough to take the
 * account over. The server invalidates every other session and hands back a fresh cookie,
 * which is why this does not sign the person out of the tab they are using.
 */
export function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const newPassword = String(values.get("newPassword") || "");
    setError("");
    setMessage("");

    // Checked here as well as by the browser so the mismatch never reaches the server.
    if (newPassword !== String(values.get("confirmPassword") || "")) {
      setError("The new passwords do not match");
      return;
    }

    setSaving(true);
    try {
      await api("/users/me/password", {
        method: "PATCH",
        body: JSON.stringify({
          currentPassword: String(values.get("currentPassword") || ""),
          newPassword,
        }),
      });
      form.reset();
      setOpen(false);
      setMessage("Password changed. Other devices have been signed out.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not change your password",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel mt-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-black">Password</h2>
          <p className="mt-1 text-sm text-white/40">
            Changing it signs you out on every other device.
          </p>
        </div>
        {!open && (
          <button
            className="btn shrink-0"
            onClick={() => {
              setMessage("");
              setError("");
              setOpen(true);
            }}
          >
            <KeyRound size={15} />
            Change password
          </button>
        )}
      </div>

      <div className="mt-4">
        <Notice error={error} success={message} />
      </div>

      {open && (
        <form className="space-y-4" onSubmit={submit}>
          <Field label="Current password">
            <input
              className="input"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="New password">
              <input
                className="input"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </Field>
            <Field label="Confirm new password">
              <input
                className="input"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </Field>
          </div>
          <p className="text-xs text-white/30">At least 8 characters.</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn" disabled={saving}>
              {saving ? "Saving..." : "Update password"}
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={saving}
              onClick={() => {
                setOpen(false);
                setError("");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
