"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  formatTimestamp,
  getDisplayName,
  postJson,
  splitContentLines,
  usePageBundle,
} from "@/lib/client/page-api";

type ChatPageProps = {
  currentUsername?: string;
};

type Member = {
  name: string;
  status: "Online" | "Away";
};

export function ChatPage({ currentUsername }: ChatPageProps) {
  const { bundle, commentsBySection, loading, error, refresh, buildScopedHref } =
    usePageBundle();
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

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
      const fallbackName = getDisplayName(post.user_id);
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
      const fallbackName = getDisplayName(comment.user_id);
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
  }, [bundle?.comments, bundle?.posts, currentUsername]);

  const recentCommentActivity = useMemo(
    () => (bundle?.comments ?? []).slice(-4).reverse(),
    [bundle?.comments],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!bundle || !message.trim()) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await postJson("/api/chat", {
        roomId: bundle.room.id,
        pageId: bundle.page.id,
        message: message.trim(),
      });
      setMessage("");
      await refresh();
    } catch (sendError) {
      setSubmitError(
        sendError instanceof Error ? sendError.message : "Failed to send message",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="chat-shell">
      <section className="chat-window xp-window" aria-labelledby="chat-title">
        <div className="xp-title-bar chat-titlebar">
          <PodGlyph />
          <span className="xp-title-text" id="chat-title">
            3WChat - {getChatTitle(bundle)}
          </span>
          <div className="xp-title-controls" aria-hidden="true">
            <span className="xp-title-btn xp-title-btn--min">_</span>
            <span className="xp-title-btn xp-title-btn--max">[]</span>
            <span className="xp-title-btn xp-title-btn--close">x</span>
          </div>
        </div>

        <nav className="chat-menu" aria-label="Chat menu">
          <a href={buildScopedHref("/")}>Room</a>
          <a href={buildScopedHref("/posts")}>Posts</a>
          <a href={buildScopedHref("/chat")}>Chat</a>
          <a href={buildScopedHref("/posts")}>Questions</a>
          <a href={buildScopedHref("/")}>Help</a>
        </nav>

        <div className="chat-layout">
          <aside className="chat-members" aria-label="Room members">
            <PanelHeader title={`Members (${authors.length || 1})`} />
            <div className="chat-members__list">
              {authors.length > 0 ? (
                authors.map((member, index) => (
                  <article className="chat-member" key={member.name}>
                    <span className={`chat-avatar chat-avatar--${(index % 8) + 1}`}>
                      {member.name.charAt(0).toUpperCase()}
                    </span>
                    <div>
                      <h2>{member.name}</h2>
                      <p>{member.status}</p>
                    </div>
                  </article>
                ))
              ) : (
                <article className="chat-member">
                  <span className="chat-avatar chat-avatar--1">A</span>
                  <div>
                    <h2>Anonymous</h2>
                    <p>No messages yet</p>
                  </div>
                </article>
              )}
            </div>
            <div className="chat-member-actions">
              <a href={buildScopedHref("/posts")} className="chat-side-button">
                <span className="chat-side-icon">+</span>Open Posts
              </a>
              <a href={buildScopedHref("/")} className="chat-side-button">
                <span className="chat-side-icon">[]</span>Back to Pod
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
                  : `${chatPosts.length} messages and ${bundle?.comments.length ?? 0} comments`}
              </p>
            </div>

            {error ? <p className="chat-error">{error}</p> : null}
            {submitError ? <p className="chat-error">{submitError}</p> : null}

            <div className="chat-transcript">
              {loading ? (
                <article className="chat-message">
                  <div className="chat-message__body">
                    <p>Loading chat history...</p>
                  </div>
                </article>
              ) : chatPosts.length > 0 ? (
                chatPosts.map((post, index) => {
                  const relatedComments = commentsBySection[`post:${post.id}`] ?? [];
                  const lines = splitContentLines(post.content);

                  return (
                    <article className="chat-message" key={post.id}>
                      <span className="chat-message__time">
                        [{formatTimestamp(post.created_at)}]
                      </span>
                      <div className="chat-message__body">
                        <p>
                          <strong className={`chat-name chat-name--${pickTone(index)}`}>
                            {getDisplayName(post.user_id)}:
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
                            -&gt; {relatedComments.length} replies - View thread
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

            <form className="chat-composer" onSubmit={(event) => void handleSubmit(event)}>
              <label className="sr-only" htmlFor="chat-message">
                Message
              </label>
              <textarea
                id="chat-message"
                aria-label="Message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Share a message with the room..."
              />
              <button type="submit" disabled={isSubmitting || !bundle}>
                {isSubmitting ? "Sending..." : "Send"}
              </button>
              <a href={buildScopedHref("/posts")} aria-label="Open post stream">
                )))
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
                  Created: {bundle ? formatTimestamp(bundle.room.created_at) : "Loading..."}
                </p>
                <p className="chat-info-card__meta">
                  {chatPosts.length} chat messages <span className="live-dot" />{" "}
                  {discussionPosts.length} active threads
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
            />
          </aside>
        </div>
      </section>
    </main>
  );
}

function getChatTitle(bundle: ReturnType<typeof usePageBundle>["bundle"]) {
  if (!bundle) {
    return "current-page";
  }

  try {
    return new URL(bundle.page.normalized_url).hostname;
  } catch {
    return bundle.page.normalized_url;
  }
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
}: {
  title: string;
  action: string;
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
              <h3>{getDisplayName(item.user_id)}</h3>
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
    <svg className="xp-title-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
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
