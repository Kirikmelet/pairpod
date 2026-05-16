"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { FormEvent, ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { AuthForm } from "@/components/auth-form";
import { TodosApp } from "@/components/todos-app";
import {
  completeClientSideAuthRedirect,
  createClient,
} from "@/utils/supabase/client";

type UserProfile = {
  id: string;
  username: string | null;
  email: string | null;
  needsUsername: boolean;
};

type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type HomePageProps = {
  variant?: "page" | "popup";
  onOpenApp?: () => void;
};

export function HomePage({ variant = "page", onOpenApp }: HomePageProps) {
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const authError =
    searchParams.get("error") === "auth"
      ? (searchParams.get("message") ?? "Sign in failed. Please try again.")
      : null;

  const refreshUser = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      setUser(null);
      setProfile(null);
      setProfileError(null);
      return;
    }
    setUser(data.user);
  }, []);

  const refreshProfile = useCallback(async () => {
    const loadedProfile = await fetchProfile("GET");
    setProfile(loadedProfile);
    return loadedProfile;
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let isMounted = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) {
        return;
      }

      setUser(session?.user ?? null);
      if (!session?.user) {
        setProfile(null);
        setProfileError(null);
      }
      setIsLoading(false);
    });

    void completeClientSideAuthRedirect()
      .then((didCompleteRedirect) => {
        if (!isMounted) {
          return;
        }

        if (didCompleteRedirect) {
          return refreshUser();
        }

        return refreshUser();
      })
      .catch(() => {
        if (isMounted) {
          setUser(null);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [refreshUser]);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setProfileError(null);
  };

  useEffect(() => {
    if (!user) {
      return;
    }

    let isActive = true;

    fetchProfile("GET")
      .then((loadedProfile) => {
        if (isActive) {
          setProfile(loadedProfile);
          setProfileError(null);
        }
      })
      .catch((error) => {
        if (isActive) {
          console.error(error);
          setProfile(null);
          setProfileError(
            error instanceof Error ? error.message : "Could not load profile.",
          );
        }
      });

    return () => {
      isActive = false;
    };
  }, [refreshProfile, user]);

  useEffect(() => {
    if (profile && !profile.needsUsername) {
      if (variant === "popup" && onOpenApp) {
        onOpenApp();
        return;
      }
      window.location.assign("/chat");
    }
  }, [onOpenApp, profile, variant]);

  const isPopup = variant === "popup";

  if (isLoading) {
    return (
      <AppShell isPopup={isPopup} title="Uncommon Hacks - Loading">
        <p className="status-note">Loading...</p>
      </AppShell>
    );
  }

  if (!user) {
    return (
      <AppShell isPopup={isPopup} title="Uncommon Hacks - Sign in">
        <AuthForm
          variant={variant}
          initialStatus={authError}
          onSuccess={() => void refreshUser()}
        />
      </AppShell>
    );
  }

  if (!profile && !profileError) {
    return (
      <AppShell isPopup={isPopup} title="Uncommon Hacks - Loading">
        <p className="status-note">Loading profile...</p>
      </AppShell>
    );
  }

  if (profileError) {
    return (
      <AppShell isPopup={isPopup} title="Uncommon Hacks - Profile">
        <div className="app-stack">
          <p className="status-note status-note--error">{profileError}</p>
          <button
            type="button"
            onClick={() => {
              setProfileError(null);
              void refreshProfile();
            }}
            className="btn-primary"
          >
            Try again
          </button>
        </div>
      </AppShell>
    );
  }

  if (!profile) {
    return (
      <AppShell isPopup={isPopup} title="Uncommon Hacks - Loading">
        <p className="status-note">Loading profile...</p>
      </AppShell>
    );
  }

  if (profile.needsUsername) {
    return (
      <AppShell isPopup={isPopup} title="Uncommon Hacks - Username">
        <UsernameForm
          email={user.email ?? profile?.email ?? null}
          onComplete={(nextProfile) => setProfile(nextProfile)}
        />
      </AppShell>
    );
  }

  return (
    <AppShell isPopup={isPopup} title="Uncommon Hacks - Dashboard" wide>
      <div className="app-stack">
        <div className="app-user-bar">
          <p className="app-user-bar__identity">
            @{profile.username}
            {user.app_metadata?.provider === "google" ? " - Google" : null}
          </p>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="text-button"
          >
            Sign out
          </button>
        </div>
        <TodosApp variant={variant} onOpenApp={onOpenApp} />
      </div>
    </AppShell>
  );
}

type UsernameFormProps = {
  email: string | null;
  onComplete(profile: UserProfile): void;
};

function UsernameForm({ email, onComplete }: UsernameFormProps) {
  const [username, setUsername] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setStatus(null);

    try {
      const profile = await fetchProfile("POST", { username });
      onComplete(profile);
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Could not save that username.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="app-stack">
      <header className="brand">
        <div className="brand-row">
          <UserSetupIcon />
          <div className="brand-name">
            <span className="peer">Pick</span>{" "}
            <span className="pod">Username</span>
          </div>
        </div>
        <p className="brand-tagline">
          {email ? `signed in as ${email}` : "choose how your pod sees you"}
        </p>
      </header>

      <form className="app-stack" onSubmit={(event) => void handleSubmit(event)}>
        <label className="form-group">
          <span className="form-label">Username</span>
          <span className="input-wrap">
            <input
              type="text"
              autoComplete="username"
              required
              minLength={3}
              maxLength={24}
              pattern="[A-Za-z0-9_]+"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="form-input"
              placeholder="cool_hacker"
            />
            <UserIcon />
          </span>
        </label>

        <p className="status-note text-center">
          Use 3-24 letters, numbers, or underscores.
        </p>

        {status ? (
          <p className="status-note status-note--error">{status}</p>
        ) : null}

        <button type="submit" disabled={isSaving} className="btn-primary">
          {isSaving ? "Saving..." : "Continue"}
        </button>
      </form>
    </div>
  );
}

async function fetchProfile(
  method: "GET" | "POST",
  body?: { username: string },
) {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Your sign-in session was not found. Please sign in again.");
  }

  const response = await fetch("/api/profile", {
    method,
    headers: {
      authorization: `Bearer ${session.access_token}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = (await response.json()) as ApiResponse<UserProfile>;

  if (!response.ok || !result.ok) {
    throw new Error(result.ok ? "Profile request failed." : result.error);
  }

  return result.data;
}

type AppShellProps = {
  children: ReactNode;
  isPopup: boolean;
  title: string;
  wide?: boolean;
};

function AppShell({ children, isPopup, title, wide = false }: AppShellProps) {
  return (
    <main className={`app-scene ${isPopup ? "app-scene--popup" : ""}`}>
      <AppBackground />
      <div className="app-scene__content">
        <section
          className={`xp-window app-window ${wide ? "app-window--wide" : ""} ${
            isPopup ? "app-window--popup" : "pop-in"
          }`}
        >
          <div className="xp-title-bar">
            <PodTitleIcon />
            <span className="xp-title-text">{title}</span>
            <div className="xp-title-controls" aria-hidden="true">
              <span className="xp-title-btn xp-title-btn--min">_</span>
              <span className="xp-title-btn xp-title-btn--max">[]</span>
              <span className="xp-title-btn xp-title-btn--close">x</span>
            </div>
          </div>
          <div className="xp-window-body">{children}</div>
        </section>
      </div>
    </main>
  );
}

function AppBackground() {
  return (
    <div className="app-background" aria-hidden="true">
      <div className="sky" />
      <div className="clouds">
        <div className="cloud cloud-1" />
        <div className="cloud cloud-2" />
        <div className="cloud cloud-3" />
        <div className="cloud cloud-4" />
        <div className="cloud cloud-5" />
      </div>
      <svg
        className="hills-svg"
        viewBox="0 0 1000 500"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <ellipse cx="650" cy="520" rx="620" ry="340" fill="#3d8e22" />
        <ellipse cx="600" cy="540" rx="540" ry="300" fill="#4aa828" />
        <ellipse cx="560" cy="530" rx="440" ry="260" fill="#5cb838" />
        <ellipse cx="520" cy="510" rx="320" ry="190" fill="#6ebe44" opacity="0.7" />
        <ellipse cx="500" cy="500" rx="200" ry="120" fill="#8cd960" opacity="0.45" />
      </svg>
      <div className="ground" />
      <div className="bubbles">
        <div className="bubble bubble-1" />
        <div className="bubble bubble-2" />
        <div className="bubble bubble-3" />
        <div className="bubble bubble-4" />
        <div className="bubble bubble-5" />
      </div>
    </div>
  );
}

function PodTitleIcon() {
  return (
    <svg className="xp-title-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <ellipse cx="8" cy="9.5" rx="6" ry="5.5" fill="#6ebe44" stroke="#3d8e22" strokeWidth="0.8" />
      <ellipse cx="7" cy="8" rx="3.5" ry="3.5" fill="rgba(255,255,255,0.3)" />
      <line x1="8" y1="4" x2="8" y2="1.5" stroke="#3a7820" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="6.5" cy="1.5" r="1.5" fill="#8cd960" />
      <circle cx="9.5" cy="2" r="1.2" fill="#6ebe44" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.2-6 8-6s6.5 2 8 6" />
    </svg>
  );
}

function UserSetupIcon() {
  return (
    <svg className="logo-pod" viewBox="0 0 38 44" fill="none" aria-hidden="true">
      <ellipse cx="19" cy="27" rx="16" ry="16" fill="#6ebe44" stroke="#3d8e22" strokeWidth="1.2" />
      <circle cx="19" cy="22" r="6" fill="white" opacity="0.85" />
      <path d="M8 39c2.2-7 5.9-10.5 11-10.5S27.8 32 30 39" fill="white" opacity="0.85" />
      <path d="M19 8 Q15 2 11 1 Q14 5 14 10" stroke="#3a7820" strokeWidth="1.5" fill="#4a9e2a" strokeLinecap="round" />
      <path d="M19 8 Q23 2 28 1 Q24 5 24 10" stroke="#3a7820" strokeWidth="1.5" fill="#6ebe44" strokeLinecap="round" />
      <line x1="19" y1="12" x2="19" y2="8" stroke="#3a7820" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
