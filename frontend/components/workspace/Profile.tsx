"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Camera, Pencil, Save, Trash2, UserRound, X } from "lucide-react";
import { api } from "@/lib/api";
import { Notice, SectionTitle } from "@/components/ui";
import { ChangePassword } from "./ChangePassword";
import { Field } from "./shared";

type ProfileView = {
  id: number;
  email: string;
  fullName: string;
  role: string;
  phone?: string;
  bio?: string;
  avatarUrl?: string;
};

export function Profile() {
  const [profile, setProfile] = useState<ProfileView>();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function changePhoto(file: File) {
    setMessage("");
    setError("");
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      setProfile(
        await api<ProfileView>("/users/me/avatar", { method: "POST", body }),
      );
      setMessage("Profile picture updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not upload the picture");
    } finally {
      setUploading(false);
      // Clear the input so picking the same file again still fires onChange.
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function removePhoto() {
    setMessage("");
    setError("");
    setUploading(true);
    try {
      setProfile(
        await api<ProfileView>("/users/me/avatar", { method: "DELETE" }),
      );
      setMessage("Profile picture removed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove the picture");
    } finally {
      setUploading(false);
    }
  }

  useEffect(() => {
    api<ProfileView>("/users/me")
      .then(setProfile)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Could not load your profile"),
      );
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const values = Object.fromEntries(new FormData(formElement));
    setMessage("");
    setError("");
    setSaving(true);
    try {
      setProfile(
        await api<ProfileView>("/users/me", {
          method: "PATCH",
          body: JSON.stringify(values),
        }),
      );
      setEditing(false);
      setMessage("Profile updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <SectionTitle
        eyebrow="Your account"
        title="Profile"
        action={
          !editing && profile ? (
            <button
              className="btn"
              onClick={() => {
                setMessage("");
                setError("");
                setEditing(true);
              }}
            >
              <Pencil size={15} />
              Edit details
            </button>
          ) : undefined
        }
      />
      <div className="grid gap-6 lg:grid-cols-[.35fr_.65fr]">
        <aside className="panel p-6">
          {profile?.avatarUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={profile.avatarUrl}
              alt={`${profile.fullName}'s profile picture`}
              className="h-24 w-24 rounded-2xl border border-line object-cover"
            />
          ) : (
            <span className="grid h-24 w-24 place-items-center rounded-2xl bg-neon/10 text-neon">
              <UserRound size={34} />
            </span>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const chosen = event.target.files?.[0];
              if (chosen) changePhoto(chosen);
            }}
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary px-3 py-1.5 text-xs"
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
            >
              <Camera size={13} />
              {uploading
                ? "Uploading..."
                : profile?.avatarUrl
                  ? "Change photo"
                  : "Add photo"}
            </button>
            {profile?.avatarUrl && (
              <button
                type="button"
                className="rounded-full px-3 py-1.5 text-xs font-semibold text-white/45 transition hover:text-red-300"
                onClick={removePhoto}
                disabled={uploading}
              >
                <Trash2 size={13} className="mr-1 inline" />
                Remove
              </button>
            )}
          </div>
          <p className="mt-2 text-[11px] text-white/30">JPG or PNG, up to 5 MB.</p>
          <h2 className="mt-5 text-xl font-black">
            {profile?.fullName || "Loading..."}
          </h2>
          <p className="mt-2 break-words text-sm text-white/40">
            {profile?.email}
          </p>
          <span className="badge mt-5">{profile?.role}</span>
        </aside>

        {editing ? (
          // Remounted per edit session via key, so Cancel discards any typing
          // and the inputs reopen from the saved values.
          <form className="panel space-y-5 p-6" onSubmit={save} key={profile?.id}>
            <Notice error={error} success={message} />
            <Field label="Full name">
              <input
                className="input"
                name="fullName"
                defaultValue={profile?.fullName}
                required
              />
            </Field>
            <Field label="Phone">
              <input
                className="input"
                name="phone"
                defaultValue={profile?.phone ?? ""}
              />
            </Field>
            <Field label="Bio">
              <textarea
                className="input"
                name="bio"
                rows={5}
                defaultValue={profile?.bio ?? ""}
                placeholder="Share a little context with your class."
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <button className="btn" disabled={saving}>
                <Save size={15} />
                {saving ? "Saving..." : "Save changes"}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setEditing(false);
                  setError("");
                }}
                disabled={saving}
              >
                <X size={15} />
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <section className="panel space-y-5 p-6">
            <Notice error={error} success={message} />
            <div>
              <p className="label">Full name</p>
              <p className="text-sm">{profile?.fullName || "—"}</p>
            </div>
            <div>
              <p className="label">Email</p>
              <p className="break-words text-sm text-white/60">
                {profile?.email || "—"}
              </p>
            </div>
            <div>
              <p className="label">Phone</p>
              <p className="text-sm">{profile?.phone || "Not added yet"}</p>
            </div>
            <div>
              <p className="label">Bio</p>
              <p className="whitespace-pre-line text-sm leading-6 text-white/60">
                {profile?.bio || "Not added yet"}
              </p>
            </div>
            <p className="border-t border-line pt-4 text-xs text-white/30">
              These details are read-only. Choose Edit details to change them.
            </p>
          </section>
        )}
      </div>
      <ChangePassword />
    </>
  );
}
