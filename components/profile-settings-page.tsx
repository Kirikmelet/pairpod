"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import type { User } from "@supabase/supabase-js";

export function ProfileSettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setIsLoading(false);
    }).catch(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return <p className="status-note">Loading profile...</p>;
  }

  if (!user) {
    return <p className="status-note status-note--error">Not signed in.</p>;
  }

  const displayName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name.trim()
      : "";

  return (
    <main className="app-scene">
      <div className="app-scene__content">
        <section className="xp-window app-window pop-in">
          <div className="xp-title-bar">
            <span className="xp-title-text">Profile Settings</span>
            <div className="xp-title-controls" aria-hidden="true">
              <span className="xp-title-btn xp-title-btn--min">_</span>
              <span className="xp-title-btn xp-title-btn--max">[]</span>
              <span className="xp-title-btn xp-title-btn--close">x</span>
            </div>
          </div>
          <div className="xp-window-body">
            <div className="app-stack">
              <p className="app-eyebrow">Signed in as</p>
              <h1 className="pod-page-title">{displayName || user.email}</h1>
              <p className="app-copy">{user.email}</p>
              <a href="/" className="btn-primary" style={{ display: "inline-block", textAlign: "center" }}>
                Back to Home
              </a>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
