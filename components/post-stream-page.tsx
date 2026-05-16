"use client";

import { FormEvent, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  formatTimestamp,
  getDisplayName,
  postJson,
  type PostRecord,
  type CommentRecord,
  usePageBundle,
} from "@/lib/client/page-api";

type SidebarItem = {
  title: string;
  meta: string;
};

export function PostStreamPage() {
  const { bundle, commentsBySection, loading, error, refresh, buildScopedHref } =
    usePageBundle();
  const [mode, setMode] = useState<"question" | "guide">("question");
  const [header, setHeader] = useState("");
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const posts = useMemo(
    () => (bundle?.posts ?? []).filter((post) => post.type !== "chat").slice().reverse(),
    [bundle?.posts],
  );

  const hotThreads: SidebarItem[] = posts.slice(0, 3).map((post) => ({
    title: post.header || post.content,
    meta: `${getCommentCount(commentsBySection, post.id)} replies`,
  }));

  const roomStats: SidebarItem[] = [
    { title: `${posts.length} posts`, meta: "current room" },
    { title: `${bundle?.comments.length ?? 0} comments`, meta: "across all threads" },
    { title: `${bundle?.room.max_users ?? 50} max users`, meta: "room capacity" },
  ];

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!bundle || !content.trim()) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const endpoint = mode === "question" ? "/api/questions" : "/api/guides";
      await postJson(endpoint, {
        roomId: bundle.room.id,
        pageId: bundle.page.id,
        header: header.trim() || null,
        content: content.trim(),
      });

      setHeader("");
      setContent("");
      await refresh();
    } catch (createError) {
      setSubmitError(
        createError instanceof Error ? createError.message : `Failed to create ${mode}`,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PostShell
      title={`3WPosts - ${getPageTitle(bundle)}`}
      labelledBy="post-stream-title"
      chatHref={buildScopedHref("/chat")}
      postsHref={buildScopedHref("/posts")}
      podsHref={buildScopedHref("/")}
    >
      <div className="post-layout">
        <ComposePanel
          mode={mode}
          header={header}
          content={content}
          isSubmitting={isSubmitting}
          error={submitError}
          onModeChange={setMode}
          onHeaderChange={setHeader}
          onContentChange={setContent}
          onSubmit={handleSubmit}
          roomName={getPageTitle(bundle)}
          chatHref={buildScopedHref("/chat")}
        />
        <section className="post-stream" aria-label="Post stream">
          <PanelHeader title="Post Stream" />
          <div className="post-filterbar">
            <button type="button" className="active">
              Live
            </button>
            <button type="button">Questions</button>
            <button type="button">Guides</button>
            <button type="button">Following</button>
          </div>

          {error ? <p className="status-note status-note--error">{error}</p> : null}
          {loading ? <p className="status-note">Loading posts...</p> : null}

          <div className="post-list">
            {posts.length > 0 ? (
              posts.map((post, index) => (
                <article className={`post-card post-card--${pickTone(index)}`} key={post.id}>
                  <div className="post-votes">
                    <button type="button">+</button>
                    <strong>{post.likes}</strong>
                    <button type="button">-</button>
                  </div>
                  <div className="post-card__body">
                    <header>
                      <span className="post-tag">{post.type}</span>
                      <h2>
                        <a href={buildScopedHref(`/posts/${post.id}`)}>
                          {post.header || truncate(post.content)}
                        </a>
                      </h2>
                      <p>
                        posted by <strong>{getDisplayName(post.user_id)}</strong> -{" "}
                        {formatTimestamp(post.created_at)}
                      </p>
                    </header>
                    <p>{post.content}</p>
                    <footer>
                      <a href={buildScopedHref("/chat")}>Continue in #chat</a>
                      <a href={buildScopedHref(`/posts/${post.id}`)}>
                        {getCommentCount(commentsBySection, post.id)} replies
                      </a>
                      <button type="button">Save</button>
                    </footer>
                  </div>
                </article>
              ))
            ) : !loading ? (
              <article className="post-card post-card--blue">
                <div className="post-card__body">
                  <header>
                    <span className="post-tag">empty</span>
                    <h2>No guides or questions yet</h2>
                    <p>Create the first thread from the panel on the left.</p>
                  </header>
                </div>
              </article>
            ) : null}
          </div>
        </section>
        <PostSidebar
          hotThreads={hotThreads}
          roomStats={roomStats}
          chatHref={buildScopedHref("/chat")}
          postsHref={buildScopedHref("/posts")}
          podsHref={buildScopedHref("/")}
        />
      </div>
    </PostShell>
  );
}

export function PostDetailPage({ postId }: { postId: string }) {
  const { bundle, commentsBySection, loading, error, refresh, buildScopedHref } =
    usePageBundle();
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const post = useMemo(
    () => (bundle?.posts ?? []).find((entry) => entry.id === postId),
    [bundle?.posts, postId],
  );

  const comments = commentsBySection[`post:${postId}`] ?? [];

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!post || !content.trim()) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await postJson("/api/answers", {
        postId: post.id,
        content: content.trim(),
      });
      setContent("");
      await refresh();
    } catch (createError) {
      setSubmitError(
        createError instanceof Error ? createError.message : "Failed to create answer",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <PostShell
        title="3WPosts - Loading"
        labelledBy="post-detail-title"
        chatHref={buildScopedHref("/chat")}
        postsHref={buildScopedHref("/posts")}
        podsHref={buildScopedHref("/")}
      >
        <p className="status-note">Loading post...</p>
      </PostShell>
    );
  }

  if (error) {
    return (
      <PostShell
        title="3WPosts - Error"
        labelledBy="post-detail-title"
        chatHref={buildScopedHref("/chat")}
        postsHref={buildScopedHref("/posts")}
        podsHref={buildScopedHref("/")}
      >
        <p className="status-note status-note--error">{error}</p>
      </PostShell>
    );
  }

  if (!post) {
    return (
      <PostShell
        title="3WPosts - Missing Post"
        labelledBy="post-detail-title"
        chatHref={buildScopedHref("/chat")}
        postsHref={buildScopedHref("/posts")}
        podsHref={buildScopedHref("/")}
      >
        <p className="status-note status-note--error">
          This post could not be found in the current page context.
        </p>
      </PostShell>
    );
  }

  return (
    <PostShell
      title={`3WPosts - ${post.header || "Thread"}`}
      labelledBy="post-detail-title"
      chatHref={buildScopedHref("/chat")}
      postsHref={buildScopedHref("/posts")}
      podsHref={buildScopedHref("/")}
    >
      <div className="post-detail-layout">
        <section className="post-detail-main">
          <PanelHeader title="Full Post" />
          <article className={`post-card post-card--full post-card--${pickTone(0)}`}>
            <div className="post-votes">
              <button type="button">+</button>
              <strong>{post.likes}</strong>
              <button type="button">-</button>
            </div>
            <div className="post-card__body">
              <header>
                <span className="post-tag">{post.type}</span>
                <h1 id="post-detail-title">{post.header || truncate(post.content)}</h1>
                <p>
                  posted by <strong>{getDisplayName(post.user_id)}</strong> -{" "}
                  {formatTimestamp(post.created_at)}
                </p>
              </header>
              <p>{post.content}</p>
              <footer>
                <a href={buildScopedHref("/posts")}>Back to post list</a>
                <a href={buildScopedHref("/chat")}>Continue in #chat</a>
              </footer>
            </div>
          </article>

          <section className="post-comments" aria-label="Comments">
            <PanelHeader title={`Comments (${comments.length})`} />
            <div className="post-comments__list">
              {comments.length > 0 ? (
                comments.map((comment, index) => (
                  <CommentCard comment={comment} key={comment.id} tone={pickTone(index)} />
                ))
              ) : (
                <article className="post-comment post-comment--blue">
                  <div className="post-comment__avatar">A</div>
                  <div className="post-comment__body">
                    <header>
                      <h2>No answers yet</h2>
                    </header>
                    <p>Reply to this thread using the form below.</p>
                  </div>
                </article>
              )}
            </div>

            <form className="post-compose" onSubmit={(event) => void handleSubmit(event)}>
              <label>
                <span>Reply</span>
                <textarea
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  placeholder="Write an answer or comment..."
                />
              </label>
              {submitError ? (
                <p className="status-note status-note--error">{submitError}</p>
              ) : null}
              <button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Posting..." : "Post Reply"}
              </button>
            </form>
          </section>
        </section>

        <aside className="post-sidebar">
          <section className="post-shortcuts">
            <PanelHeader title="Post Actions" />
            <a href={buildScopedHref("/posts")}>Back to posts</a>
            <a href={buildScopedHref("/chat")}>Open #chat stream</a>
            <a href={buildScopedHref("/")}>Back to pod</a>
          </section>
        </aside>
      </div>
    </PostShell>
  );
}

function getCommentCount(
  commentsBySection: Record<string, CommentRecord[]>,
  postId: string,
) {
  return commentsBySection[`post:${postId}`]?.length ?? 0;
}

function getPageTitle(bundle: ReturnType<typeof usePageBundle>["bundle"]) {
  if (!bundle) {
    return "current-page";
  }

  try {
    return new URL(bundle.page.normalized_url).hostname;
  } catch {
    return bundle.page.normalized_url;
  }
}

function truncate(content: string) {
  return content.length > 72 ? `${content.slice(0, 69)}...` : content;
}

function pickTone(index: number) {
  return ["blue", "green", "orange", "purple"][index % 4];
}

function PostShell({
  title,
  labelledBy,
  chatHref,
  postsHref,
  podsHref,
  children,
}: {
  title: string;
  labelledBy: string;
  chatHref: string;
  postsHref: string;
  podsHref: string;
  children: ReactNode;
}) {
  return (
    <main className="post-shell">
      <section className="post-window xp-window" aria-labelledby={labelledBy}>
        <div className="xp-title-bar chat-titlebar">
          <PodGlyph />
          <span className="xp-title-text">{title}</span>
          <div className="xp-title-controls" aria-hidden="true">
            <span className="xp-title-btn xp-title-btn--min">_</span>
            <span className="xp-title-btn xp-title-btn--max">[]</span>
            <span className="xp-title-btn xp-title-btn--close">x</span>
          </div>
        </div>
        <nav className="chat-menu" aria-label="Post stream menu">
          <a href={chatHref}>Chat</a>
          <a href={podsHref}>Pods</a>
          <a href={postsHref}>Posts</a>
          <a href={postsHref}>Sort</a>
          <a href={podsHref}>Help</a>
        </nav>
        {children}
      </section>
    </main>
  );
}

function ComposePanel({
  mode,
  header,
  content,
  isSubmitting,
  error,
  onModeChange,
  onHeaderChange,
  onContentChange,
  onSubmit,
  roomName,
  chatHref,
}: {
  mode: "question" | "guide";
  header: string;
  content: string;
  isSubmitting: boolean;
  error: string | null;
  onModeChange: (value: "question" | "guide") => void;
  onHeaderChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  roomName: string;
  chatHref: string;
}) {
  return (
    <aside className="post-compose-panel">
      <PanelHeader title="Create Post" />
      <form className="post-compose" onSubmit={onSubmit}>
        <label>
          <span>Type</span>
          <select value={mode} onChange={(event) => onModeChange(event.target.value as "question" | "guide")}>
            <option value="question">Question</option>
            <option value="guide">Guide</option>
          </select>
        </label>
        <label>
          <span>Title</span>
          <input
            type="text"
            value={header}
            onChange={(event) => onHeaderChange(event.target.value)}
            placeholder="Share something with the room"
          />
        </label>
        <label>
          <span>Post</span>
          <textarea
            value={content}
            onChange={(event) => onContentChange(event.target.value)}
            placeholder="Ask a question, share a guide, or start a thread..."
          />
        </label>
        {error ? <p className="status-note status-note--error">{error}</p> : null}
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Posting..." : `Post ${mode}`}
        </button>
      </form>
      <div className="post-room-card">
        <PodRoomIcon />
        <div>
          <h2>{roomName}</h2>
          <p>Code, collaborate, build.</p>
        </div>
        <a href={chatHref}>Open #chat</a>
      </div>
    </aside>
  );
}

function PostSidebar({
  hotThreads,
  roomStats,
  chatHref,
  postsHref,
  podsHref,
}: {
  hotThreads: SidebarItem[];
  roomStats: SidebarItem[];
  chatHref: string;
  postsHref: string;
  podsHref: string;
}) {
  return (
    <>
      <SidePanel title="Hot Threads" action="View all threads" href={postsHref} items={hotThreads} />
      <SidePanel title="Room Stats" action="Full activity" href={postsHref} items={roomStats} />
      <section className="post-shortcuts">
        <PanelHeader title="Connected Views" />
        <a href={chatHref}># chat stream</a>
        <a href={podsHref}>Your pods</a>
        <a href={postsHref}>Saved posts</a>
      </section>
    </>
  );
}

function CommentCard({
  comment,
  tone,
}: {
  comment: CommentRecord;
  tone: string;
}) {
  return (
    <article className={`post-comment post-comment--${tone}`}>
      <div className="post-comment__avatar">
        {getDisplayName(comment.user_id).charAt(0).toUpperCase()}
      </div>
      <div className="post-comment__body">
        <header>
          <h2>{getDisplayName(comment.user_id)}</h2>
          <span>{formatTimestamp(comment.created_at)}</span>
        </header>
        <p>{comment.content}</p>
        <div className="post-comment__votes" aria-label="Comment votes">
          <button type="button">Like</button>
          <strong>{comment.likes}</strong>
          <button type="button">Dislike</button>
          <strong>0</strong>
        </div>
      </div>
    </article>
  );
}

function PanelHeader({ title }: { title: string }) {
  return (
    <header className="chat-panel-header">
      <h2>{title}</h2>
    </header>
  );
}

function SidePanel({
  title,
  action,
  href,
  items,
}: {
  title: string;
  action: string;
  href: string;
  items: SidebarItem[];
}) {
  return (
    <section className="chat-rail-panel">
      <PanelHeader title={title} />
      <div className="chat-rail-panel__body">
        {items.length > 0 ? (
          items.map((item) => (
            <article className="chat-rail-item" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.meta}</p>
            </article>
          ))
        ) : (
          <article className="chat-rail-item">
            <h3>No data yet</h3>
            <p>Create activity in the room to populate this panel.</p>
          </article>
        )}
        <a href={href}>{action}</a>
      </div>
    </section>
  );
}

function PodGlyph() {
  return (
    <svg className="xp-title-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <ellipse cx="8" cy="9.5" rx="6" ry="5.5" fill="#6ebe44" stroke="#3d8e22" strokeWidth="0.8" />
      <circle cx="6.4" cy="9" r="1.4" fill="#1a2a44" />
      <circle cx="9.6" cy="9" r="1.4" fill="#1a2a44" />
      <path d="M6 12c1.2 1 2.8 1 4 0" stroke="#2d5018" strokeWidth="1" strokeLinecap="round" />
      <line x1="8" y1="4" x2="8" y2="1.5" stroke="#3a7820" strokeWidth="1.5" strokeLinecap="round" />
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
