"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  formatTimestamp,
  getDisplayName,
  getRoomDisplayName,
  postJson,
  splitContentLines,
  type UserProfileRecord,
  useCurrentUserProfile,
  usePageBundle,
} from "@/lib/client/page-api";
import { playSfx, useErrorSfx } from "@/lib/client/sfx";

type ChatPageProps = {
  currentUsername?: string;
};

type Member = {
  name: string;
  status: "Online" | "Away";
};

export function ChatPage({ currentUsername }: ChatPageProps) {
  const {
    bundle,
    commentsByPost,
    usersById,
    loading,
    error,
    refresh,
    buildRoomHref,
    buildScopedHref,
    domainUrl,
    roomScope,
  } = usePageBundle();
  const domainName = getRoomDisplayName(domainUrl);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const seenChatPostIdsRef = useRef<Set<string> | null>(null);
  const sentChatPostIdsRef = useRef<Set<string>>(new Set());
  const { profile: currentProfile } = useCurrentUserProfile();
  useErrorSfx(error);
  useErrorSfx(submitError);

  const chatPosts = useMemo(
    () => (bundle?.posts ?? []).filter((post) => post.type === "chat"),
    [bundle?.posts],
  );

  const discussionPosts = useMemo(
    () =>
      (bundle?.posts ?? [])
        .filter((post) => post.type !== "chat")
        .slice(-3)
        .reverse(),
    [bundle?.posts],
  );

  const authors = useMemo<Member[]>(() => {
    const values = new Map<string, Member>();

    if (currentUsername?.trim()) {
      values.set(currentUsername, {
        name: currentUsername,
        status: "Online",
      });
    }

    for (const post of bundle?.posts ?? []) {
      const fallbackName = getDisplayName(post.user_id, usersById);
      const name =
        currentUsername?.trim() && fallbackName === "Anonymous"
          ? currentUsername
          : fallbackName;

      if (!values.has(name)) {
        values.set(name, {
          name,
          status: post.type === "chat" ? "Online" : "Away",
        });
      }
    }

    for (const comment of bundle?.comments ?? []) {
      const fallbackName = getDisplayName(comment.user_id, usersById);
      const name =
        currentUsername?.trim() && fallbackName === "Anonymous"
          ? currentUsername
          : fallbackName;

      if (!values.has(name)) {
        values.set(name, {
          name,
          status: "Away",
        });
      }
    }

    return [...values.values()].slice(0, 8);
  }, [bundle?.comments, bundle?.posts, currentUsername, usersById]);

  const recentCommentActivity = useMemo(
    () => (bundle?.comments ?? []).slice(-4).reverse(),
    [bundle?.comments],
  );

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (!transcript) {
      return;
    }

    transcript.scrollTo({
      top: transcript.scrollHeight,
      behavior: "smooth",
    });
  }, [chatPosts.length]);

  useEffect(() => {
    const knownIds = seenChatPostIdsRef.current;
    const nextIds = new Set(chatPosts.map((post) => post.id));

    if (!knownIds) {
      seenChatPostIdsRef.current = nextIds;
      return;
    }

    const hasRemoteIncomingMessage = chatPosts.some(
      (post) =>
        !knownIds.has(post.id) &&
        !sentChatPostIdsRef.current.has(post.id) &&
        (!currentProfile?.id || post.user_id !== currentProfile.id),
    );

    seenChatPostIdsRef.current = nextIds;

    if (hasRemoteIncomingMessage) {
      playSfx("im");
    }
  }, [chatPosts, currentProfile?.id]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!bundle || !message.trim()) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const createdPost = await postJson("/api/chat", {
        roomId: bundle.room.id,
        pageId: bundle.page.id,
        message: message.trim(),
      });
      if (isRecordWithId(createdPost)) {
        sentChatPostIdsRef.current.add(createdPost.id);
      }
      setMessage("");
      await refresh({ silent: true });
    } catch (sendError) {
      setSubmitError(
        sendError instanceof Error
          ? sendError.message
          : "Failed to send message",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="chat-shell">
      <ChatSceneBackground />
      <div className="chat-shell__content">
        <section
          className="chat-window xp-window chat-window--animate"
          aria-labelledby="chat-title"
        >
          <div className="xp-title-bar chat-titlebar">
            <PodGlyph />
            <span className="xp-title-text" id="chat-title">
              PairPod - {getChatTitle(bundle)}
            </span>
            <div className="xp-title-controls" aria-hidden="true">
              <span className="xp-title-btn xp-title-btn--min">_</span>
              <span className="xp-title-btn xp-title-btn--max">[]</span>
              <span className="xp-title-btn xp-title-btn--close">x</span>
            </div>
          </div>

          <nav className="chat-menu chat-nav" aria-label="Chat menu">
            <a href={buildScopedHref("/")}>Room</a>
            <a href={buildScopedHref("/posts")} className="nav-cta">
              Posts
            </a>
            <a href={buildScopedHref("/chat")} className="chat-nav__active">
              Chat
            </a>
            <a
              href={buildRoomHref("/chat", "global")}
              className={roomScope === "global" ? "chat-nav__active" : ""}
            >
              Global
            </a>
            <a
              href={buildRoomHref("/chat", "domain")}
              className={roomScope === "domain" ? "chat-nav__active" : ""}
            >
              {domainName}
            </a>
          </nav>

          <div className="chat-layout">
            <aside className="chat-members" aria-label="Room members">
              <PanelHeader title={`Members (${authors.length || 1})`} />
              <div className="chat-members__list">
                {authors.length > 0 ? (
                  authors.map((member, index) => (
                    <article className="chat-member" key={member.name}>
                      <span
                        className={`chat-avatar chat-avatar--${(index % 8) + 1}`}
                      >
                        {member.name.charAt(0).toUpperCase()}
                      </span>
                      <div>
                        <h2>{member.name}</h2>
                        <p>
                          <span
                            className={`chat-status-dot chat-status-dot--${
                              member.status === "Online" ? "online" : "away"
                            }`}
                          />
                          {member.status}
                        </p>
                      </div>
                    </article>
                  ))
                ) : (
                  <article className="chat-member">
                    <span className="chat-avatar chat-avatar--1">A</span>
                    <div>
                      <h2>Anonymous</h2>
                      <p>
                        <span className="chat-status-dot chat-status-dot--away" />
                        Waiting
                      </p>
                    </div>
                  </article>
                )}
              </div>
              <div className="chat-member-actions">
                <a
                  href={buildScopedHref("/posts")}
                  className="chat-side-button"
                >
                  <span className="chat-side-icon" aria-hidden="true">
                    <ListIcon />
                  </span>
                  Open Posts
                </a>
                <a href={buildScopedHref("/")} className="chat-side-button">
                  <span className="chat-side-icon" aria-hidden="true">
                    <HomeIcon />
                  </span>
                  Back to Pod
                </a>
              </div>
            </aside>

            <section className="chat-main" aria-label="Chat transcript">
              <PanelHeader title="# chat" />
              <div className="chat-topic">
                <p>*** You have joined #chat</p>
                <p>*** Topic: Shared discussion for {getChatTitle(bundle)}</p>
                <p>
                  ***{" "}
                  {loading
                    ? "Loading..."
                    : `${chatPosts.length} messages and ${
                        bundle?.comments.length ?? 0
                      } comments`}
                </p>
              </div>

              {error ? <p className="chat-error">{error}</p> : null}
              {submitError ? <p className="chat-error">{submitError}</p> : null}

              <div className="chat-transcript" ref={transcriptRef}>
                {loading && !bundle ? (
                  <article className="chat-message">
                    <div className="chat-message__body">
                      <p>Loading chat history...</p>
                    </div>
                  </article>
                ) : chatPosts.length > 0 ? (
                  chatPosts.map((post, index) => {
                    const relatedComments = commentsByPost[post.id] ?? [];
                    const lines = splitContentLines(post.content);

                    return (
                      <article className="chat-message" key={post.id}>
                        <span className="chat-message__time">
                          [{formatTimestamp(post.created_at)}]
                        </span>
                        <div className="chat-message__body">
                          <p>
                            <strong
                              className={`chat-name chat-name--${pickTone(index)}`}
                            >
                              {getDisplayName(post.user_id, usersById)}:
                            </strong>{" "}
                            {lines[0] ?? post.content}
                          </p>
                          {lines.slice(1).map((line) => (
                            <p key={`${post.id}-${line}`}>{line}</p>
                          ))}
                          {relatedComments.length > 0 ? (
                            <a
                              className="chat-thread"
                              href={buildScopedHref(`/posts/${post.id}`)}
                            >
                              -&gt; {relatedComments.length} replies - View
                              thread
                            </a>
                          ) : null}
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <article className="chat-message">
                    <div className="chat-message__body">
                      <p>No chat messages yet. Send the first one below.</p>
                    </div>
                  </article>
                )}
              </div>

              <div className="chat-toolbar" aria-label="Message tools">
                {["A", "A*", "B", "I", "U", "link", "img", ":)"].map((tool) => (
                  <button type="button" key={tool}>
                    {tool}
                  </button>
                ))}
              </div>

              <form
                className="chat-composer"
                onSubmit={(event) => void handleSubmit(event)}
              >
                <label className="sr-only" htmlFor="chat-message">
                  Message
                </label>
                <textarea
                  id="chat-message"
                  className="chat-composer__input"
                  aria-label="Message"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Send a message to the room..."
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      if (!isSubmitting && bundle && message.trim()) {
                        event.currentTarget.form?.requestSubmit();
                      }
                    }
                  }}
                />
                <button
                  type="submit"
                  className="chat-composer__send"
                  disabled={isSubmitting || !bundle}
                >
                  {isSubmitting ? "…" : "Send"}
                </button>
                <a
                  href={buildScopedHref("/posts")}
                  className="chat-composer__posts"
                  aria-label="Open post stream"
                >
                  <ListIcon />
                </a>
              </form>
            </section>

            <aside className="chat-rail" aria-label="Room details">
              <section className="chat-info-card">
                <PanelHeader title="Room Info" />
                <div className="chat-info-card__body">
                  <PodRoomIcon />
                  <div>
                    <h2>{getChatTitle(bundle)}</h2>
                    <p>Code, collaborate, build.</p>
                  </div>
                  <p className="chat-info-card__meta">
                    Created:{" "}
                    {bundle
                      ? formatTimestamp(bundle.room.created_at)
                      : "Loading..."}
                  </p>
                  <p className="chat-info-card__meta">
                    {chatPosts.length} chat messages{" "}
                    <span className="live-dot" /> {discussionPosts.length}{" "}
                    active threads
                  </p>
                </div>
              </section>
              <RailPanel
                title="Recent Posts"
                action={buildScopedHref("/posts")}
                items={discussionPosts}
              />
              <CommentPanel
                title="Recent Activity"
                action={buildScopedHref("/posts")}
                items={recentCommentActivity}
                usersById={usersById}
              />
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}

function isRecordWithId(value: unknown): value is { id: string } {
  return (
    value !== null &&
    typeof value === "object" &&
    "id" in value &&
    typeof value.id === "string"
  );
}

function ChatSceneBackground() {
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

function getChatTitle(bundle: ReturnType<typeof usePageBundle>["bundle"]) {
  if (!bundle) {
    return "Global";
  }

  return getRoomDisplayName(bundle.page.normalized_url);
}

function pickTone(index: number) {
  return ["purple", "pink", "green", "blue", "brown"][index % 5];
}

function PanelHeader({ title }: { title: string }) {
  return (
    <header className="chat-panel-header">
      <h2>{title}</h2>
    </header>
  );
}

function RailPanel({
  title,
  action,
  items,
}: {
  title: string;
  action: string;
  items: Array<{
    id: string;
    header: string | null;
    content: string;
    created_at: string;
    type: string;
  }>;
}) {
  return (
    <section className="chat-rail-panel">
      <PanelHeader title={title} />
      <div className="chat-rail-panel__body">
        {items.length > 0 ? (
          items.map((item) => (
            <article className="chat-rail-item" key={item.id}>
              <h3>{item.header || item.content}</h3>
              <p>
                {item.type} <span>{formatTimestamp(item.created_at)}</span>
              </p>
            </article>
          ))
        ) : (
          <article className="chat-rail-item">
            <h3>No recent posts</h3>
            <p>Create a guide or question to populate this panel.</p>
          </article>
        )}
        <a href={action}>View all posts</a>
      </div>
    </section>
  );
}

function CommentPanel({
  title,
  action,
  items,
  usersById,
}: {
  title: string;
  action: string;
  usersById: Record<string, UserProfileRecord>;
  items: Array<{
    id: string;
    content: string;
    created_at: string;
    user_id: string | null;
  }>;
}) {
  return (
    <section className="chat-rail-panel">
      <PanelHeader title={title} />
      <div className="chat-rail-panel__body">
        {items.length > 0 ? (
          items.map((item) => (
            <article className="chat-rail-item" key={item.id}>
              <h3>{getDisplayName(item.user_id, usersById)}</h3>
              <p>
                {item.content} <span>{formatTimestamp(item.created_at)}</span>
              </p>
            </article>
          ))
        ) : (
          <article className="chat-rail-item">
            <h3>No recent activity</h3>
            <p>Replies and answers will appear here.</p>
          </article>
        )}
        <a href={action}>View full history</a>
      </div>
    </section>
  );
}

function PodGlyph() {
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
      <circle cx="6.4" cy="9" r="1.4" fill="#1a2a44" />
      <circle cx="9.6" cy="9" r="1.4" fill="#1a2a44" />
      <path
        d="M6 12c1.2 1 2.8 1 4 0"
        stroke="#2d5018"
        strokeWidth="1"
        strokeLinecap="round"
      />
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
    </svg>
  );
}

function PodRoomIcon() {
  return (
    <span className="chat-room-icon" aria-hidden="true">
      <svg viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="24" r="18" stroke="currentColor" strokeWidth="4" />
        <path
          d="M8 24h32M24 6c6 5 9 11 9 18s-3 13-9 18M24 6c-6 5-9 11-9 18s3 13 9 18"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" width="18" height="18">
      <rect x="3" y="4" width="14" height="2" rx="1" fill="currentColor" />
      <rect x="3" y="9" width="10" height="2" rx="1" fill="currentColor" />
      <rect x="3" y="14" width="12" height="2" rx="1" fill="currentColor" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" width="18" height="18">
      <path d="M10 3L3 9h2v8h4v-5h2v5h4V9h2L10 3z" fill="currentColor" />
    </svg>
  );
}
