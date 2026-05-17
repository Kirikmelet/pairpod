"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { AuthForm } from "@/components/auth-form";
import { ChatPage } from "@/components/chat-page";
import { PodSelectionPage } from "@/components/pod-selection-page";
import { PostDetailPage, PostStreamPage } from "@/components/post-stream-page";
import { ProfileSettingsPage } from "@/components/profile-settings-page";
import { playSfx, useErrorSfx, useSfxUnlock } from "@/lib/client/sfx";
import {
  completeClientSideAuthRedirect,
  createClient,
} from "@/utils/supabase/client";

type HomePageProps = {
  variant?: "page" | "popup";
  onOpenApp?: () => void;
};

type ExtensionRuntime = {
  runtime?: {
    getURL?: (path: string) => string;
  };
};

export function HomePage({ variant = "page", onOpenApp }: HomePageProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  useSfxUnlock();
  useErrorSfx(authError);

  const refreshUser = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.auth.getUser();

    if (error) {
      setUser(null);
      return;
    }

    setAuthError(null);
    setUser(data.user);
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
      setIsLoading(false);
    });

    void completeClientSideAuthRedirect()
      .then((didCompleteRedirect) => {
        if (!isMounted) {
          return;
        }

        if (didCompleteRedirect) {
          playSfx("welcome");
          return refreshUser();
        }

        return refreshUser();
      })
      .catch(() => {
        if (isMounted) {
          setUser(null);
          setAuthError("Could not complete sign in. Please try again.");
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
    playSfx("goodbye");
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
  };

  const isPopup = variant === "popup";

  if (isLoading) {
    return (
      <AppShell isPopup={isPopup} title="PairPod - Loading">
        <p className="status-note">Loading...</p>
      </AppShell>
    );
  }

  if (!user) {
    if (isPopup) {
      return <StaticLoginRedirect isPopup={isPopup} />;
    }

    return (
      <AppShell isPopup={isPopup} title="PairPod - Sign in">
        <AuthForm
          variant={variant}
          initialStatus={null}
          onSuccess={() => void refreshUser()}
        />
      </AppShell>
    );
  }

  if (!isPopup) {
    return <PodSelectionPage userEmail={user.email ?? null} onSignOut={() => void handleSignOut()} />;
  }

  return <ExtensionPopupApp user={user} onSignOut={() => void handleSignOut()} />;
}

function StaticLoginRedirect({
  isPopup,
}: {
  isPopup: boolean;
}) {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const runtime = getExtensionRuntime();
    const loginUrl = isPopup
      ? (runtime?.runtime?.getURL?.("login.html") ?? "login.html")
      : "/login.html";

    if (!window.location.href.endsWith("/login.html")) {
      window.location.replace(loginUrl);
    }
  }, [isPopup]);

  return (
    <AppShell isPopup={isPopup} title="Uncommon Hacks - Sign in">
      <p className="status-note">Opening sign in...</p>
    </AppShell>
  );
}

function getExtensionRuntime() {
  const globalWithRuntime = globalThis as typeof globalThis & {
    browser?: ExtensionRuntime;
    chrome?: ExtensionRuntime;
  };

  return globalWithRuntime.browser ?? globalWithRuntime.chrome ?? null;
}

function ExtensionPopupApp({
  user,
  onSignOut,
}: {
  user: User;
  onSignOut: () => void;
}) {
  const route = useExtensionHashRoute();

  return (
    <div
      className="extension-app"
      onClickCapture={(event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }

        if (target.closest(".xp-title-btn--close")) {
          event.preventDefault();
          event.stopPropagation();
          onSignOut();
        }
      }}
    >
      <div className="extension-user-bar">
        <span className="extension-user-bar__identity">
          {getDisplayIdentity(user)}
        </span>
        <div className="extension-user-bar__actions">
          <a href="#/" className="text-button">Home</a>
          <button type="button" onClick={onSignOut} className="text-button text-button--danger">
            Sign out
          </button>
        </div>
      </div>
      {route.kind === "chat" ? (
        <ChatPage />
      ) : route.kind === "posts" ? (
        <PostStreamPage variant="popup" />
      ) : route.kind === "post-detail" ? (
        <PostDetailPage postId={route.postId} />
      ) : route.kind === "profile" ? (
        <ProfileSettingsPage variant="popup" />
      ) : (
        <PodSelectionPage userEmail={user.email ?? null} onSignOut={onSignOut} />
      )}
    </div>
  );
}

function useExtensionHashRoute():
  | { kind: "home" }
  | { kind: "chat" }
  | { kind: "posts" }
  | { kind: "profile" }
  | { kind: "post-detail"; postId: string } {
  const [hash, setHash] = useState(() =>
    typeof window === "undefined" ? "" : window.location.hash,
  );

  useEffect(() => {
    const handleHashChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const path = hash.replace(/^#/, "").split("?")[0] || "/";
  const postMatch = path.match(/^\/posts\/([^/?#]+)$/);

  if (postMatch?.[1]) {
    return { kind: "post-detail", postId: decodeURIComponent(postMatch[1]) };
  }

  if (path === "/chat") {
    return { kind: "chat" };
  }

  if (path === "/posts") {
    return { kind: "posts" };
  }

  if (path === "/profile") {
    return { kind: "profile" };
  }

  return { kind: "home" };
}

function getDisplayIdentity(user: User) {
  const fullName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name.trim()
      : "";

  return fullName || user.email || "Authenticated user";
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
        <ellipse
          cx="520"
          cy="510"
          rx="320"
          ry="190"
          fill="#6ebe44"
          opacity="0.7"
        />
        <ellipse
          cx="500"
          cy="500"
          rx="200"
          ry="120"
          fill="#8cd960"
          opacity="0.45"
        />
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
    <svg
      className="xp-title-icon"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <ellipse
        cx="8"
        cy="9.5"
        rx="6"
        ry="5.5"
        fill="#6ebe44"
        stroke="#3d8e22"
        strokeWidth="0.8"
      />
      <ellipse cx="7" cy="8" rx="3.5" ry="3.5" fill="rgba(255,255,255,0.3)" />
      <line
        x1="8"
        y1="4"
        x2="8"
        y2="1.5"
        stroke="#3a7820"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="6.5" cy="1.5" r="1.5" fill="#8cd960" />
      <circle cx="9.5" cy="2" r="1.2" fill="#6ebe44" />
    </svg>
  );
}
