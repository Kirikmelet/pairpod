"use client";

import { FormEvent, useState } from "react";
import {
  DEFAULT_AVATAR_URL,
  formatTimestamp,
  getDisplayName,
  getRoomDisplayName,
  type PageBundle,
  type UserProfileRecord,
  useCurrentUserProfile,
  usePageBundle,
} from "@/lib/client/page-api";
import { useErrorSfx } from "@/lib/client/sfx";
import { createClient } from "@/utils/supabase/client";

type Activity = {
  domain: string;
  text: string;
  time: string;
  icon: "globe" | "wiki";
};

type PodSelectionPageProps = {
  userEmail?: string | null;
  onSignOut?: () => void;
};

export function PodSelectionPage({ userEmail = null }: PodSelectionPageProps) {
  const {
    bundle,
    usersById,
    loading,
    error,
    buildRoomHref,
    buildDomainHref,
    buildScopedHref,
    currentUrl,
    domainUrl,
    roomScope,
  } =
    usePageBundle();
  const { profile } = useCurrentUserProfile();
  const [customDomain, setCustomDomain] = useState("");
  const [podName, setPodName] = useState("");
  const [podSlug, setPodSlug] = useState("");
  useErrorSfx(error);

  const posts = bundle?.posts ?? [];
  const comments = bundle?.comments ?? [];
  const pageDomain = getPageDomain(bundle);
  const domainName = getRoomDisplayName(domainUrl);
  const currentUserName = profile
    ? getDisplayName(profile.id, { [profile.id]: profile })
    : (userEmail ?? "Signed in user");

  const handleCustomDomainSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextDomain = customDomain.trim();
    if (!nextDomain || typeof window === "undefined") {
      return;
    }

    window.location.href = buildDomainHref("/", nextDomain);
  };

  const handleCreatePodSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = podName.trim();
    const slug = normalizePodSlug(podSlug || name);
    if (!slug || typeof window === "undefined") {
      return;
    }

    const podUrl = `https://${slug}.pairpod.local/`;
    window.location.href = buildDomainHref("/", podUrl);
  };

  const recentPosts: Activity[] = posts.slice(-3).reverse().map((post) => ({
    domain: pageDomain,
    text: post.header || post.content,
    time: formatTimestamp(post.created_at),
    icon: "globe",
  }));

  const recentComments: Activity[] = comments.slice(-3).reverse().map((comment) => ({
    domain: pageDomain,
    text: comment.content,
    time: formatTimestamp(comment.created_at),
    icon: "wiki",
  }));

  const history: Activity[] = bundle
    ? [
        {
          domain: pageDomain,
          text: `Opened room ${bundle.room.id.slice(0, 8)}`,
          time: formatTimestamp(bundle.room.created_at),
          icon: "globe",
        },
        {
          domain: pageDomain,
          text: `${posts.length} posts in this pod`,
          time: "Live",
          icon: "wiki",
        },
      ]
    : [];

  return (
    <main className="app-scene pod-scene">
      <AppBackground />
      <section className="pod-window xp-window pop-in" aria-labelledby="pod-title">
        <div className="xp-title-bar">
          <PodTitleIcon />
          <span className="xp-title-text">PairPod - Your Pods</span>
          <div className="xp-title-controls" aria-hidden="true">
            <span className="xp-title-btn xp-title-btn--min">_</span>
            <span className="xp-title-btn xp-title-btn--max">[]</span>
            <span className="xp-title-btn xp-title-btn--close">x</span>
          </div>
        </div>

        <div className="xp-window-body pod-window__body">
          <div className="pod-dashboard">
            <section className="pod-main">
              <header className="pod-page-header">
                <p className="app-eyebrow">domain chatrooms</p>
                <h1 className="pod-page-title" id="pod-title">
                  Your Pods
                </h1>
                <p className="app-copy">
                  {loading
                    ? "Loading the current page room..."
                    : `Connected to ${getRoomDisplayName(currentUrl)}`}
                </p>
                <div className="room-scope-tabs" aria-label="Room scope">
                  <a
                    className={roomScope === "global" ? "active" : ""}
                    href={buildRoomHref("/", "global")}
                  >
                    Global
                  </a>
                  <a
                    className={roomScope === "domain" ? "active" : ""}
                    href={buildRoomHref("/", "domain")}
                  >
                    {domainName}
                  </a>
                  <a className="room-scope-tabs__dm" href={buildScopedHref("/dms")}>
                    DMs
                  </a>
                  <a href={buildScopedHref("/peers")}>3D Peers</a>
                </div>
                <form
                  className="domain-picker"
                  onSubmit={(event) => handleCustomDomainSubmit(event)}
                >
                  <label className="sr-only" htmlFor="domain-picker-input">
                    Set domain
                  </label>
                  <input
                    id="domain-picker-input"
                    value={customDomain}
                    onChange={(event) => setCustomDomain(event.target.value)}
                    placeholder="example.com"
                  />
                  <button type="submit" disabled={!customDomain.trim()}>
                    Open
                  </button>
                </form>
                <form
                  className="pod-create-form"
                  onSubmit={(event) => handleCreatePodSubmit(event)}
                >
                  <div>
                    <label htmlFor="pod-name-input">Create pod or map</label>
                    <input
                      id="pod-name-input"
                      value={podName}
                      onChange={(event) => {
                        setPodName(event.target.value);
                        if (!podSlug.trim()) {
                          setPodSlug(normalizePodSlug(event.target.value));
                        }
                      }}
                      placeholder="Late night build room"
                      maxLength={48}
                    />
                  </div>
                  <div>
                    <label htmlFor="pod-slug-input">Pod slug</label>
                    <input
                      id="pod-slug-input"
                      value={podSlug}
                      onChange={(event) => setPodSlug(normalizePodSlug(event.target.value))}
                      placeholder="late-night-build"
                      maxLength={36}
                    />
                  </div>
                  <button type="submit" disabled={!normalizePodSlug(podSlug || podName)}>
                    Create
                  </button>
                </form>
              </header>

              {error ? (
                <p className="status-note status-note--error">{error}</p>
              ) : null}

              <div className="pod-list">
                <article className="pod-card pod-card--blue">
                  <PodIcon icon="globe" imageUrl={getDomainIconUrl(bundle?.page.normalized_url)} />
                  <div className="pod-card__content">
                    <h2 className="pod-card__title">{pageDomain}</h2>
                    <p className="pod-card__copy">
                      {loading
                        ? "Bootstrapping page, room, posts, and comments..."
                        : "Shared room for this webpage. Open chat or posts to collaborate."}
                    </p>
                    {bundle ? (
                      <p className="pod-card__meta">
                        <span className="live-dot" />
                        {posts.length} posts · {comments.length} comments
                      </p>
                    ) : null}
                  </div>
                  <div className="pod-avatars" aria-label={`${pageDomain} active members`}>
                    {getAuthorBadges(bundle, usersById).map((member, index) => (
                      <span className={`pod-avatar pod-avatar--${(index % 5) + 1}`} key={member}>
                        {member}
                      </span>
                    ))}
                  </div>
                  <a
                    className="pod-card__button"
                    href={buildScopedHref("/chat")}
                    aria-label={`Open ${pageDomain}`}
                  >
                    <span aria-hidden="true">&gt;</span>
                  </a>
                </article>

                <article className="pod-card pod-card--silver">
                  <PodIcon icon="plus" />
                  <div className="pod-card__content">
                    <h2 className="pod-card__title">Connected Views</h2>
                    <p className="pod-card__copy">
                      Move between the room, the post stream, and the current page context.
                    </p>
                    <p className="pod-card__meta">All links preserve the same page URL</p>
                  </div>
                  <div className="pod-avatars" aria-hidden="true" />
                  <a
                    className="pod-card__button"
                    href={buildScopedHref("/posts")}
                    aria-label="Open posts"
                  >
                    <span aria-hidden="true">&gt;</span>
                  </a>
                </article>
                <article className="pod-card pod-card--green">
                  <PodIcon icon="plus" />
                  <div className="pod-card__content">
                    <h2 className="pod-card__title">Your Own Map</h2>
                    <p className="pod-card__copy">
                      Make a named room that behaves like its own tiny world for chat, posts, and peers.
                    </p>
                    <p className="pod-card__meta">
                      {normalizePodSlug(podSlug || podName) || "custom"} · pairpod.local
                    </p>
                  </div>
                  <div className="pod-avatars" aria-hidden="true" />
                  <button
                    className="pod-card__button"
                    type="button"
                    aria-label="Create pod"
                    onClick={() => {
                      const slug = normalizePodSlug(podSlug || podName);
                      if (slug && typeof window !== "undefined") {
                        window.location.href = buildDomainHref("/", `https://${slug}.pairpod.local/`);
                      }
                    }}
                    disabled={!normalizePodSlug(podSlug || podName)}
                  >
                    <span aria-hidden="true">+</span>
                  </button>
                </article>
              </div>
            </section>

            <aside className="pod-sidebar" aria-label="Pod activity">
              <UserTile
                email={userEmail}
                profileHref={buildScopedHref("/profile")}
                avatarUrl={profile?.avatar_url ?? DEFAULT_AVATAR_URL}
                displayName={currentUserName}
              />
              <ActivityPanel title="Recent Posts" actionLabel="Open posts" href={buildScopedHref("/posts")} items={recentPosts} />
              <ActivityPanel title="Recent Comments" actionLabel="Open chat" href={buildScopedHref("/chat")} items={recentComments} />
              <ActivityPanel title="Past Pod Activity" actionLabel="Refresh context" href={buildScopedHref("/")} items={history} compact />
            </aside>
          </div>
        </div>
      </section>
    </main>
  );
}

function normalizePodSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
}

function getPageDomain(bundle: PageBundle | null) {
  if (!bundle) {
    return "Global";
  }

  return getRoomDisplayName(bundle.page.normalized_url);
}

function getAuthorBadges(
  bundle: PageBundle | null,
  usersById: Record<string, UserProfileRecord>,
) {
  const authors = new Set<string>();

  for (const post of bundle?.posts ?? []) {
    authors.add(getDisplayName(post.user_id, usersById).charAt(0).toUpperCase());
  }

  for (const comment of bundle?.comments ?? []) {
    authors.add(getDisplayName(comment.user_id, usersById).charAt(0).toUpperCase());
  }

  if (authors.size === 0) {
    authors.add("P");
  }

  return [...authors].slice(0, 5);
}

function ActivityPanel({
  title,
  actionLabel,
  href,
  items,
  compact = false,
}: {
  title: string;
  actionLabel: string;
  href: string;
  items: Activity[];
  compact?: boolean;
}) {
  return (
    <section className="activity-panel">
      <header className="activity-panel__titlebar">
        <span className="activity-panel__glyph" aria-hidden="true" />
        <h2>{title}</h2>
        <span className="activity-panel__control" aria-hidden="true">
          _
        </span>
        <span className="activity-panel__control" aria-hidden="true">
          x
        </span>
      </header>
      <div className="activity-panel__body">
        {items.length > 0 ? (
          items.map((item) => (
            <article
              className={`activity-item ${compact ? "activity-item--compact" : ""}`}
              key={`${title}-${item.domain}-${item.text}`}
            >
              <PodMiniIcon icon={item.icon} />
              <div className="activity-item__content">
                <h3>{item.domain}</h3>
                <p>{item.text}</p>
              </div>
              {item.time ? <time>{item.time}</time> : null}
            </article>
          ))
        ) : (
          <article className={`activity-item ${compact ? "activity-item--compact" : ""}`}>
            <PodMiniIcon icon="wiki" />
            <div className="activity-item__content">
              <h3>No activity yet</h3>
              <p>Create a post or send a chat message to populate this panel.</p>
            </div>
          </article>
        )}
        <a className="activity-panel__action" href={href}>
          {actionLabel} <span aria-hidden="true">-&gt;</span>
        </a>
      </div>
    </section>
  );
}

function UserTile({
  email,
  profileHref,
  avatarUrl,
  displayName,
}: {
  email: string | null;
  profileHref: string;
  avatarUrl: string;
  displayName: string;
}) {
  return (
    <section className="pod-user-tile" aria-label="Current user">
      <span className="pod-user-avatar" aria-hidden="true">
        <img src={avatarUrl} alt="" />
      </span>
      <div>
        <h2>{displayName}</h2>
        {email ? <p className="pod-user-email">{email}</p> : null}
        <p>
          <span className="live-dot" /> Online
        </p>
      </div>
      <div className="pod-user-actions">
        <a className="pod-user-menu" href={profileHref} aria-label="Open profile settings">
          <span aria-hidden="true">v</span>
        </a>
      </div>
    </section>
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

function PodIcon({
  icon,
  imageUrl,
}: {
  icon: "globe" | "plus";
  imageUrl?: string | null;
}) {
  return (
    <span className={`pod-icon pod-icon--${icon}`} aria-hidden="true">
      {imageUrl ? <img src={imageUrl} alt="" /> : <IconShape icon={icon} />}
    </span>
  );
}

function getDomainIconUrl(url: string | undefined) {
  if (!url || getRoomDisplayName(url) === "Global") {
    return null;
  }

  return `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(url)}&sz=64`;
}

function PodMiniIcon({ icon }: { icon: "globe" | "wiki" }) {
  return (
    <span className={`pod-mini-icon pod-mini-icon--${icon}`} aria-hidden="true">
      <IconShape icon={icon} />
    </span>
  );
}

function IconShape({ icon }: { icon: "globe" | "plus" | "wiki" }) {
  if (icon === "wiki") {
    return <WikiIcon />;
  }
  if (icon === "plus") {
    return <PlusIcon />;
  }
  return <GlobeIcon />;
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="18" stroke="currentColor" strokeWidth="4" />
      <path
        d="M8 24h32M24 6c6 5 9 11 9 18s-3 13-9 18M24 6c-6 5-9 11-9 18s3 13 9 18"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function WikiIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none">
      <path
        d="M7 13h7l7 22 7-22h5l7 22"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none">
      <path d="M24 10v28M10 24h28" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}

function PodFace() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <path
        d="M32 13c-11 0-20 9-20 21s9 21 20 21 20-9 20-21-9-21-20-21z"
        fill="#6ebe44"
        stroke="#2d7018"
        strokeWidth="3"
      />
      <path
        d="M23 12c2-5 7-8 13-8-2 5-6 8-13 8z"
        fill="#8cd960"
        stroke="#2d7018"
        strokeWidth="2"
      />
      <circle cx="24" cy="31" r="6" fill="white" />
      <circle cx="40" cy="31" r="6" fill="white" />
      <circle cx="25" cy="32" r="3" fill="#1a2a44" />
      <circle cx="41" cy="32" r="3" fill="#1a2a44" />
      <path d="M24 43c5 4 11 4 16 0" stroke="#2d5018" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
