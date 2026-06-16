"use client";

import { FormEvent, useEffect, useState } from "react";
import { Save, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import { Notice, SectionTitle } from "@/components/ui";
import { Field } from "./shared";

type ProfileView = {
  id: number;
  email: string;
  fullName: string;
  role: string;
  phone?: string;
  bio?: string;
};

export function Profile() {
  const [profile, setProfile] = useState<ProfileView>();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    api<ProfileView>("/users/me").then(setProfile);
  }, []);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    try {
      setProfile(
        await api("/users/me", {
          method: "PATCH",
          body: JSON.stringify(
            Object.fromEntries(new FormData(event.currentTarget)),
          ),
        }),
      );
      setMessage("Profile updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update profile");
    }
  }
  return (
    <>
      <SectionTitle eyebrow="Your account" title="Profile" />
      <div className="grid gap-6 lg:grid-cols-[.35fr_.65fr]">
        <aside className="panel p-6">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-neon/10 text-neon">
            <UserRound size={24} />
          </span>
          <h2 className="mt-5 text-xl font-black">
            {profile?.fullName || "Loading..."}
          </h2>
          <p className="mt-2 text-sm text-white/40">{profile?.email}</p>
          <span className="badge mt-5">{profile?.role}</span>
        </aside>
        <form className="panel space-y-5 p-6" onSubmit={save}>
          <Notice error={error} success={message} />
          <Field label="Full name">
            <input
              className="input"
              name="fullName"
              defaultValue={profile?.fullName}
              key={`name-${profile?.fullName}`}
              required
            />
          </Field>
          <Field label="Phone">
            <input
              className="input"
              name="phone"
              defaultValue={profile?.phone}
              key={`phone-${profile?.phone}`}
            />
          </Field>
          <Field label="Bio">
            <textarea
              className="input"
              name="bio"
              rows={5}
              defaultValue={profile?.bio}
              key={`bio-${profile?.bio}`}
              placeholder="Share a little context with your class."
            />
          </Field>
          <button className="btn">
            <Save size={15} />
            Save profile
          </button>
        </form>
      </div>
    </>
  );
}
