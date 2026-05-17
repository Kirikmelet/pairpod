"use client";

import { useEffect, useMemo, useState } from "react";
import { getDmPath, startDirectMessage } from "@/lib/client/dms";
import {
  getPublicProfileAvatar,
  getPublicProfileDisplayName,
  loadPublicUserProfile,
} from "@/lib/client/users";
import { useErrorSfx } from "@/lib/client/sfx";
import type { UserProfileRecord } from "@/lib/client/page-api";

type UserProfilePageProps = {
  userId: string;
};

export function UserProfilePage({ userId }: UserProfilePageProps) {
  const [profile, setProfile] = useState<UserProfileRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [isStartingDm, setIsStartingDm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useErrorSfx(error);

  useEffect(() => {
    let isActive = true;

    async function loadProfile() {
      setLoading(true);
      setError(null);

      try {
        const nextProfile = await loadPublicUserProfile(userId);
        if (isActive) {
          setProfile(nextProfile);
        }
      } catch (loadError) {
        if (isActive) {
          setError(
            loadError instanceof Error ? loadError.message : "Could not load this profile.",
          );
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      isActive = false;
    };
  }, [userId]);

  const displayName = useMemo(() => getPublicProfileDisplayName(profile), [profile]);
  const avatarUrl = getPublicProfileAvatar(profile);

  const handleStartDm = async () => {
    if (!profile || isStartingDm) {
      return;
    }

    setIsStartingDm(true);
    setError(null);

    try {
      const thread = await startDirectMessage(profile.id);
      window.location.href = getDmPath(`/dms/${thread.id}`);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Could not start DM.");
    } finally {
      setIsStartingDm(false);
    }
  };

  return (
    <main className="profile-scene">
      <ProfileBackground />
      <div className="app-scene__content profile-scene__content">
        <section className="xp-window user-profile-window" aria-labelledby="user-profile-title">
          <div className="xp-title-bar chat-titlebar">
            <ProfileGlyph />
            <span className="xp-title-text" id="user-profile-title">
              PairPod - User Profile
            </span>
            <div className="xp-title-controls" aria-hidden="true">
              <span className="xp-title-btn xp-title-btn--min">_</span>
              <span className="xp-title-btn xp-title-btn--max">[]</span>
              <span className="xp-title-btn xp-title-btn--close">x</span>
            </div>
          </div>

          <nav className="chat-menu chat-nav profile-nav" aria-label="User profile menu">
            <a href={getDmPath("/")}>Room</a>
            <a href={getDmPath("/chat")}>Chat</a>
            <a href={getDmPath("/posts")}>Posts</a>
            <a href={getDmPath("/dms")}>DMs</a>
          </nav>

          <div className="xp-window-body user-profile-body">
            {loading ? <p className="status-note">Loading profile...</p> : null}
            {error ? <p className="status-note status-note--error">{error}</p> : null}

            {profile ? (
              <>
                <header className="user-profile-card">
                  <img className="user-profile-avatar" src={avatarUrl} alt="" />
                  <div>
                    <p className="app-eyebrow">PairPod profile</p>
                    <h1>{displayName}</h1>
                    <p className="app-copy">
                      {profile.username ? `@${profile.username}` : "Anonymous PairPod user"}
                    </p>
                  </div>
                </header>

                <dl className="user-profile-facts">
                  <div>
                    <dt>Display name</dt>
                    <dd>{displayName}</dd>
                  </div>
                  <div>
                    <dt>Username</dt>
                    <dd>{profile.username ? `@${profile.username}` : "Not set"}</dd>
                  </div>
                  <div>
                    <dt>Joined</dt>
                    <dd>{profile.created_at ? formatProfileDate(profile.created_at) : "Unknown"}</dd>
                  </div>
                </dl>

                <button
                  className="profile-save-button"
                  type="button"
                  disabled={isStartingDm}
                  onClick={() => void handleStartDm()}
                >
                  {isStartingDm ? "Opening DM..." : "Start DM"}
                </button>
              </>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function formatProfileDate(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return date.toLocaleDateString([], {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function ProfileBackground() {
  return (
    <div className="app-background" aria-hidden="true">
      <div className="sky" />
      <div className="clouds">
        <div className="cloud cloud-1" />
        <div className="cloud cloud-2" />
        <div className="cloud cloud-3" />
      </div>
      <div className="ground" />
    </div>
  );
}

function ProfileGlyph() {
  return (
    <svg className="xp-title-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="5.5" r="3" fill="#6ebe44" stroke="#3d8e22" />
      <path
        d="M3.5 14c.6-3 2.2-4.5 4.5-4.5s3.9 1.5 4.5 4.5"
        fill="#8cd960"
        stroke="#3d8e22"
      />
    </svg>
  );
}
