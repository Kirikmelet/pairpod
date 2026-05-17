"use client";

import { FormEvent, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  formatTimestamp,
  getDisplayName,
  getRoomDisplayName,
  postJson,
  updateCommentLikes,
  updatePostLikes,
  type PostRecord,
  type CommentRecord,
  type UserProfileRecord,
  usePageBundle,
} from "@/lib/client/page-api";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type SidebarItem = {
  title: string;
  meta: string;
};

type PostStreamPageProps = {
  variant?: "page" | "popup";
};

/* ------------------------------------------------------------------ */
/*  PostStreamPage                                                     */
/* ------------------------------------------------------------------ */

export function PostStreamPage({ variant = "page" }: PostStreamPageProps) {
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

  const isPopup = variant === "popup";
  const domainName = getRoomDisplayName(domainUrl);

  /* -- form state -------------------------------------------------- */
  const [mode, setMode] = useState<"question" | "guide">("question");
  const [header, setHeader] = useState("");
  const [content, setContent] = useState("");
  const [sectionId, setSectionId] = useState("general");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);

  /* -- derived data ------------------------------------------------ */
  const posts = useMemo(
    () =>
      (bundle?.posts ?? [])
        .filter((post) => post.type !== "chat")
        .slice()
        .reverse(),
    [bundle?.posts],
  );

  const hotThreads: SidebarItem[] = posts.slice(0, 3).map((post) => ({
    title: post.header || post.content,
    meta: `${getCommentCount(commentsByPost, post.id)} replies`,
  }));

  const roomStats: SidebarItem[] = [
    { title: `${posts.length} posts`, meta: "current room" },
    {
      title: `${bundle?.comments.length ?? 0} comments`,
      meta: "across all threads",
    },
    {
      title: `${bundle?.room.max_users ?? 50} max users`,
      meta: "room capacity",
    },
  ];

  /* -- handlers ---------------------------------------------------- */
  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!bundle || !content.trim()) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const endpoint = mode === "question" ? "/api/questions" : "/api/guides";

      await postJson(endpoint, {
        /* DB column: room_id (uuid) */
        roomId: bundle.room.id,
        /* used by API to resolve room_id / context */
        pageId: bundle.page.id,
        /* DB column: type (text) — "question" | "guide" */
        type: mode,
        /* DB column: section_id (text) */
        section_id: sectionId,
        /* DB column: header (text) */
        header: header.trim() || null,
        /* DB column: content (text) */
        content: content.trim(),
        /* DB column: likes (int4) — default 0 on creation */
        likes: 0,
        /* DB columns id, user_id, created_at are set server-side */
      });

      setHeader("");
      setContent("");
      setSectionId("general");
      await refresh();
    } catch (createError) {
      setSubmitError(
        createError instanceof Error
          ? createError.message
          : `Failed to create ${mode}`,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePostVote = async (post: PostRecord, delta: 1 | -1) => {
    setVoteError(null);
    try {
      await updatePostLikes(post, delta);
      await refresh();
    } catch (voteFailure) {
      setVoteError(
        voteFailure instanceof Error
          ? voteFailure.message
          : "Failed to update vote",
      );
    }
  };

  /* -- render ------------------------------------------------------ */
  return (
    <PostShell
      title={`PairPod - ${getPageTitle(bundle)}`}
      labelledBy="post-stream-title"
      chatHref={buildScopedHref("/chat")}
      postsHref={buildScopedHref("/posts")}
      podsHref={buildScopedHref("/")}
      globalHref={buildRoomHref("/posts", "global")}
      domainHref={buildRoomHref("/posts", "domain")}
      domainName={domainName}
      roomScope={roomScope}
      variant={variant}
    >
      <div className={`post-layout ${isPopup ? "post-layout--popup" : ""}`}>
        {/* ---------- compose panel (full mode) ---------- */}
        {!isPopup ? (
          <ComposePanel
            mode={mode}
            header={header}
            content={content}
            sectionId={sectionId}
            isSubmitting={isSubmitting}
            error={submitError}
            onModeChange={setMode}
            onHeaderChange={setHeader}
            onContentChange={setContent}
            onSectionIdChange={setSectionId}
            onSubmit={handleSubmit}
            roomName={getPageTitle(bundle)}
            chatHref={buildScopedHref("/chat")}
          />
        ) : null}

        {/* ---------- compose strip (popup mode) ---------- */}
        <section className="post-stream" aria-label="Post feed">
          {isPopup ? (
            <form
              className="post-compose-strip"
              onSubmit={(event) => void handleSubmit(event)}
            >
              <select
                aria-label="Post type"
                value={mode}
                onChange={(event) =>
                  setMode(event.target.value as "question" | "guide")
                }
              >
                <option value="question">Question</option>
                <option value="guide">Guide</option>
              </select>

              <input
                type="text"
                aria-label="Section ID"
                value={sectionId}
                onChange={(event) => setSectionId(event.target.value)}
                placeholder="Section (e.g. general)"
              />

              <input
                type="text"
                value={header}
                onChange={(event) => setHeader(event.target.value)}
                placeholder="Title"
              />

              <textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="Write a post..."
                rows={2}
              />

              {submitError ? (
                <p className="status-note status-note--error">{submitError}</p>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting || !content.trim()}
              >
                {isSubmitting ? "Posting..." : `Post ${mode}`}
              </button>
            </form>
          ) : null}

          {/* ---------- tab bar (full mode) ---------- */}
          {!isPopup ? (
            <nav className="post-tabs" aria-label="Post filters">
              <button type="button" className="post-tab post-tab--active">
                Live
              </button>
              <button type="button" className="post-tab">Questions</button>
              <button type="button" className="post-tab">Guides</button>
              <button type="button" className="post-tab">Following</button>
            </nav>
          ) : null}

          {/* ---------- status messages ---------- */}
          {error ? (
            <p className="status-note status-note--error">{error}</p>
          ) : null}
          {voteError ? (
            <p className="status-note status-note--error">{voteError}</p>
          ) : null}
          {loading ? <p className="status-note">Loading posts...</p> : null}

          {/* ---------- post list ---------- */}
          <div className="post-list">
            {posts.length > 0 ? (
              posts.map((post, index) => (
                <article
                  className={`post-card post-card--${pickTone(index)}`}
                  key={post.id}
                >
                  <div className="post-votes">
                    <button
                      type="button"
                      onClick={() => void handlePostVote(post, 1)}
                    >
                      +
                    </button>
                    <strong>{post.likes}</strong>
                    <button
                      type="button"
                      onClick={() => void handlePostVote(post, -1)}
                    >
                      -
                    </button>
                  </div>

                  <div className="post-card__body">
                    <header>
                      <span className="post-tag">{post.type}</span>
                      {post.section_id ? (
                        <span className="post-section-tag">
                          {post.section_id}
                        </span>
                      ) : null}
                      <h2>
                        <a href={buildScopedHref(`/posts/${post.id}`)}>
                          {post.header || truncate(post.content)}
                        </a>
                      </h2>
                      <p>
                        posted by{" "}
                        <strong>
                          {getDisplayName(post.user_id, usersById)}
                        </strong>{" "}
                        - {formatTimestamp(post.created_at)}
                      </p>
                    </header>
                    <p>{post.content}</p>
                    <footer>
                      <a href={buildScopedHref("/chat")}>Continue in #chat</a>
                      <a href={buildScopedHref(`/posts/${post.id}`)}>
                        {getCommentCount(commentsByPost, post.id)} replies
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

        {/* ---------- sidebar (full mode) ---------- */}
        {!isPopup ? (
          <PostSidebar
            hotThreads={hotThreads}
            roomStats={roomStats}
            chatHref={buildScopedHref("/chat")}
            postsHref={buildScopedHref("/posts")}
            podsHref={buildScopedHref("/")}
          />
        ) : null}
      </div>
    </PostShell>
  );
}

/* ------------------------------------------------------------------ */
/*  PostDetailPage                                                     */
/* ------------------------------------------------------------------ */

export function PostDetailPage({ postId }: { postId: string }) {
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

  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);

  /* -- derived data ------------------------------------------------ */
  const post = useMemo(
    () => (bundle?.posts ?? []).find((entry) => entry.id === postId),
    [bundle?.posts, postId],
  );

  const comments = commentsByPost[postId] ?? [];

  const topLevelComments = useMemo(
    () => comments.filter((c) => c.reply_id === null),
    [comments],
  );

  const repliesByParent = useMemo(() => {
    const map: Record<string, CommentRecord[]> = {};
    for (const c of comments) {
      if (c.reply_id) {
        (map[c.reply_id] ??= []).push(c);
      }
    }
    return map;
  }, [comments]);

  /* -- handlers ---------------------------------------------------- */
  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!post || !content.trim()) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await postJson("/api/answers", {
        /* parent post reference */
        postId: post.id,
        /* DB column: content (text) */
        content: content.trim(),
        /* DB column: likes (int4) — default 0 */
        likes: 0,
        /* top-level comment — no parent reply */
        reply_id: null,
      });

      setContent("");
      await refresh();
    } catch (createError) {
      setSubmitError(
        createError instanceof Error
          ? createError.message
          : "Failed to create answer",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePostVote = async (postToUpdate: PostRecord, delta: 1 | -1) => {
    setVoteError(null);
    try {
      await updatePostLikes(postToUpdate, delta);
      await refresh();
    } catch (voteFailure) {
      setVoteError(
        voteFailure instanceof Error
          ? voteFailure.message
          : "Failed to update vote",
      );
    }
  };

  /* -- shell props shared across loading / error / success --------- */
  const shellProps = {
    labelledBy: "post-detail-title",
    chatHref: buildScopedHref("/chat"),
    postsHref: buildScopedHref("/posts"),
    podsHref: buildScopedHref("/"),
    globalHref: buildRoomHref("/posts", "global"),
    domainHref: buildRoomHref("/posts", "domain"),
    domainName,
    roomScope,
  };

  if (loading) {
    return (
      <PostShell title="PairPod - Loading" {...shellProps}>
        <p className="status-note">Loading post...</p>
      </PostShell>
    );
  }

  if (error) {
    return (
      <PostShell title="PairPod - Error" {...shellProps}>
        <p className="status-note status-note--error">{error}</p>
      </PostShell>
    );
  }

  if (!post) {
    return (
      <PostShell title="PairPod - Missing Post" {...shellProps}>
        <p className="status-note">
          This post could not be found in the current page context.
        </p>
      </PostShell>
    );
  }

  /* -- success render ---------------------------------------------- */
  return (
    <PostShell title={`PairPod - ${post.header || "Thread"}`} {...shellProps}>
      <div className="post-layout">
        <section className="post-stream" aria-label="Thread detail">
          {/* ---------- main post ---------- */}
          <article
            className={`post-card post-card--full post-card--${pickTone(0)}`}
          >
            <div className="post-votes">
              <button
                type="button"
                onClick={() => void handlePostVote(post, 1)}
              >
                +
              </button>
              <strong>{post.likes}</strong>
              <button
                type="button"
                onClick={() => void handlePostVote(post, -1)}
              >
                -
              </button>
            </div>

            <div className="post-card__body">
              <header>
                <span className="post-tag">{post.type}</span>
                {post.section_id ? (
                  <span className="post-section-tag">{post.section_id}</span>
                ) : null}
                <h2>{post.header || truncate(post.content)}</h2>
                <p>
                  posted by{" "}
                  <strong>
                    {getDisplayName(post.user_id, usersById)}
                  </strong>{" "}
                  - {formatTimestamp(post.created_at)}
                </p>
              </header>
              <p>{post.content}</p>
              <footer>
                <a href={buildScopedHref("/posts")}>Back to post list</a>
                <a href={buildScopedHref("/chat")}>Continue in #chat</a>
              </footer>
            </div>
          </article>

          {/* ---------- comments ---------- */}
          <section className="post-comments" aria-label="Comments">
            <PanelHeader title={`Comments (${comments.length})`} />

            <div className="post-comments__list">
              {topLevelComments.length > 0 ? (
                topLevelComments.map((comment, index) => (
                  <CommentCard
                    key={comment.id}
                    comment={comment}
                    tone={pickTone(index)}
                    postId={postId}
                    replies={repliesByParent[comment.id] ?? []}
                    refresh={refresh}
                    parentUser={null}
                    usersById={usersById}
                  />
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

            {/* ---------- reply form ---------- */}
            <form
              className="post-compose"
              onSubmit={(event) => void handleSubmit(event)}
            >
              <div className="post-compose-field">
                <span className="post-compose-label">Reply</span>
                <textarea
                  className="post-compose-input"
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  placeholder="Write an answer or comment..."
                />
              </div>

              {submitError ? (
                <p className="status-note status-note--error">{submitError}</p>
              ) : null}
              {voteError ? (
                <p className="status-note status-note--error">{voteError}</p>
              ) : null}

              <button
                type="submit"
                className="post-compose-submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Posting..." : "Post Reply"}
              </button>
            </form>
          </section>
        </section>

        {/* ---------- sidebar ---------- */}
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

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getCommentCount(
  commentsByPost: Record<string, CommentRecord[]>,
  postId: string,
) {
  return commentsByPost[postId]?.length ?? 0;
}

function getPageTitle(
  bundle: ReturnType<typeof usePageBundle>["bundle"],
) {
  if (!bundle) {
    return "Global";
  }
  return getRoomDisplayName(bundle.page.normalized_url);
}

function truncate(content: string) {
  return content.length > 72 ? `${content.slice(0, 69)}...` : content;
}

function pickTone(index: number) {
  return ["blue", "green", "orange", "purple"][index % 4];
}

/* ------------------------------------------------------------------ */
/*  PostShell                                                          */
/* ------------------------------------------------------------------ */

function PostShell({
  title,
  labelledBy,
  chatHref,
  postsHref,
  podsHref,
  globalHref,
  domainHref,
  domainName,
  roomScope,
  variant = "page",
  children,
}: {
  title: string;
  labelledBy: string;
  chatHref: string;
  postsHref: string;
  podsHref: string;
  globalHref: string;
  domainHref: string;
  domainName: string;
  roomScope: "global" | "domain";
  variant?: "page" | "popup";
  children: ReactNode;
}) {
  const isPopup = variant === "popup";

  return (
    <main className={`post-shell ${isPopup ? "post-shell--popup" : ""}`}>
      <section
        className={`post-window xp-window post-window--animate ${
          isPopup ? "post-window--popup" : ""
        }`}
        aria-labelledby={labelledBy}
      >
        <div className="xp-title-bar">
          <span className="xp-title-bar__text">{title}</span>
          <span className="xp-title-bar__controls">_ [] x</span>
        </div>

        <nav className="chat-nav" aria-label="Section navigation">
          <a href={chatHref}>&rarr; Chat</a>
          <a href={podsHref}>Pods</a>
          <a href={postsHref}>Posts</a>
          <a
            href={globalHref}
            className={roomScope === "global" ? "chat-nav__active" : ""}
          >
            Global
          </a>
          <a
            href={domainHref}
            className={roomScope === "domain" ? "chat-nav__active" : ""}
          >
            {domainName}
          </a>
        </nav>

        {children}
      </section>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/*  ComposePanel                                                       */
/* ------------------------------------------------------------------ */

function ComposePanel({
  mode,
  header,
  content,
  sectionId,
  isSubmitting,
  error,
  onModeChange,
  onHeaderChange,
  onContentChange,
  onSectionIdChange,
  onSubmit,
  roomName,
  chatHref,
}: {
  mode: "question" | "guide";
  header: string;
  content: string;
  sectionId: string;
  isSubmitting: boolean;
  error: string | null;
  onModeChange: (value: "question" | "guide") => void;
  onHeaderChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onSectionIdChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  roomName: string;
  chatHref: string;
}) {
  return (
    <aside className="post-compose-panel">
      <form
        className="post-compose"
        onSubmit={(event) => void onSubmit(event)}
      >
        {/* type */}
        <div className="post-compose-field">
          <span className="post-compose-label">Type</span>
          <select
            className="post-compose-input"
            value={mode}
            onChange={(event) =>
              onModeChange(event.target.value as "question" | "guide")
            }
          >
            <option value="question">Question</option>
            <option value="guide">Guide</option>
          </select>
        </div>

        {/* section_id */}
        <div className="post-compose-field">
          <span className="post-compose-label">Section</span>
          <input
            className="post-compose-input"
            type="text"
            value={sectionId}
            onChange={(event) => onSectionIdChange(event.target.value)}
            placeholder="Section ID (e.g. general)"
          />
        </div>

        {/* header */}
        <div className="post-compose-field">
          <span className="post-compose-label">Title</span>
          <input
            className="post-compose-input"
            type="text"
            value={header}
            onChange={(event) => onHeaderChange(event.target.value)}
            placeholder="Share something with the room"
          />
        </div>

        {/* content */}
        <div className="post-compose-field">
          <span className="post-compose-label">Post</span>
          <textarea
            className="post-compose-input"
            value={content}
            onChange={(event) => onContentChange(event.target.value)}
            placeholder="Ask a question, share a guide, or start a thread..."
          />
        </div>

        {error ? (
          <p className="status-note status-note--error">{error}</p>
        ) : null}

        <button
          type="submit"
          className="post-compose-submit"
          disabled={isSubmitting || !content.trim()}
        >
          {isSubmitting ? "Posting..." : `Post ${mode}`}
        </button>
      </form>

      <div className="post-compose-panel__info">
        <strong>{roomName}</strong>
        <p>Code, collaborate, build.</p>
        <a href={chatHref}>Open #chat</a>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/*  PostSidebar                                                        */
/* ------------------------------------------------------------------ */

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
    <aside className="post-sidebar">
      <SidePanel
        title="Hot Threads"
        action="View all"
        href={postsHref}
        items={hotThreads}
      />
      <SidePanel
        title="Room Stats"
        action="View details"
        href={postsHref}
        items={roomStats}
      />
      <section className="post-shortcuts">
        <PanelHeader title="Shortcuts" />
        <a href={chatHref}># chat stream</a>
        <a href={podsHref}>Your pods</a>
        <a href={postsHref}>Saved posts</a>
      </section>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/*  CommentCard                                                        */
/* ------------------------------------------------------------------ */

function CommentCard({
  comment,
  tone,
  postId,
  replies,
  refresh,
  parentUser,
  usersById,
}: {
  comment: CommentRecord;
  tone: string;
  postId: string;
  replies: CommentRecord[];
  refresh: () => Promise<void>;
  parentUser: string | null;
  usersById: Record<string, UserProfileRecord>;
}) {
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyContent, setReplyContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);

  const displayName = getDisplayName(comment.user_id, usersById);

  const handleReply = async (event: FormEvent) => {
    event.preventDefault();
    if (!replyContent.trim()) return;

    setIsSubmitting(true);
    setReplyError(null);

    try {
      await postJson("/api/answers", {
        postId,
        content: replyContent.trim(),
        replyId: comment.id,
        likes: 0,
      });

      setReplyContent("");
      setShowReplyForm(false);
      await refresh();
    } catch (err) {
      setReplyError(
        err instanceof Error ? err.message : "Failed to post reply",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCommentVote = async (
    commentToUpdate: CommentRecord,
    delta: 1 | -1,
  ) => {
    setVoteError(null);
    try {
      await updateCommentLikes(commentToUpdate, delta);
      await refresh();
    } catch (voteFailure) {
      setVoteError(
        voteFailure instanceof Error
          ? voteFailure.message
          : "Failed to update vote",
      );
    }
  };

  return (
    <article className={`post-comment post-comment--${tone}`}>
      {parentUser ? (
        <div className="post-reply-badge">
          &crarr; replying to <strong>@{parentUser}</strong>
        </div>
      ) : null}

      <div className="post-comment__avatar">
        {displayName.charAt(0).toUpperCase()}
      </div>

      <div className="post-comment__body">
        <header>
          <h2>@{displayName}</h2>
          <span>{formatTimestamp(comment.created_at)}</span>
        </header>
        <p>{comment.content}</p>

        <div className="post-comment__actions" aria-label="Comment actions">
          <button
            type="button"
            onClick={() => void handleCommentVote(comment, 1)}
          >
            Like
          </button>
          <strong>{comment.likes}</strong>
          <button
            type="button"
            onClick={() => void handleCommentVote(comment, -1)}
          >
            Dislike
          </button>
          <button
            type="button"
            className="post-reply-btn"
            onClick={() => {
              setShowReplyForm((prev) => !prev);
              setReplyError(null);
            }}
          >
            {showReplyForm ? "Cancel" : "Reply"}
          </button>
        </div>

        {voteError ? (
          <p className="status-note status-note--error">{voteError}</p>
        ) : null}

        {/* ---------- inline reply form ---------- */}
        {showReplyForm ? (
          <form
            className="post-reply-form"
            onSubmit={(event) => void handleReply(event)}
          >
            <div className="post-reply-form__label">
              Replying to <strong>@{displayName}</strong>
            </div>
            <textarea
              className="post-compose-input"
              value={replyContent}
              onChange={(event) => setReplyContent(event.target.value)}
              placeholder={`Reply to @${displayName}...`}
              rows={3}
            />
            {replyError ? (
              <p className="status-note status-note--error">{replyError}</p>
            ) : null}
            <button
              type="submit"
              className="post-compose-submit"
              disabled={isSubmitting || !replyContent.trim()}
            >
              {isSubmitting ? "Posting..." : "Post Reply"}
            </button>
          </form>
        ) : null}

        {/* ---------- nested replies ---------- */}
        {replies.length > 0 ? (
          <div className="post-thread-replies">
            {replies.map((reply, index) => (
              <article
                key={reply.id}
                className={`post-comment post-comment--${pickTone(index)}`}
              >
                <div className="post-reply-badge post-reply-badge--nested">
                  &crarr; replying to <strong>@{displayName}</strong>
                </div>
                <div className="post-comment__avatar">
                  {getDisplayName(reply.user_id, usersById)
                    .charAt(0)
                    .toUpperCase()}
                </div>
                <div className="post-comment__body">
                  <header>
                    <h2>
                      @{getDisplayName(reply.user_id, usersById)}
                    </h2>
                    <span>{formatTimestamp(reply.created_at)}</span>
                  </header>
                  <p>{reply.content}</p>
                  <div
                    className="post-comment__actions"
                    aria-label="Reply actions"
                  >
                    <button
                      type="button"
                      onClick={() => void handleCommentVote(reply, 1)}
                    >
                      Like
                    </button>
                    <strong>{reply.likes}</strong>
                    <button
                      type="button"
                      onClick={() => void handleCommentVote(reply, -1)}
                    >
                      Dislike
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/*  Small UI components                                                */
/* ------------------------------------------------------------------ */

function PanelHeader({ title }: { title: string }) {
  return (
    <div className="panel-header">
      <h3>{title}</h3>
    </div>
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
    <section className="side-panel">
      <PanelHeader title={title} />
      <div className="side-panel__list">
        {items.length > 0 ? (
          items.map((item) => (
            <div className="side-panel__item" key={item.title}>
              <strong>{item.title}</strong>
              <span>{item.meta}</span>
            </div>
          ))
        ) : (
          <div className="side-panel__empty">
            <p>No data yet</p>
            <p>Create activity in the room to populate this panel.</p>
          </div>
        )}
      </div>
      <a href={href} className="side-panel__action">
        {action}
      </a>
    </section>
  );
}
