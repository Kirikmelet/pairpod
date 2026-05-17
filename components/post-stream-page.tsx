"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
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
  useCurrentUserProfile,
  usePageBundle,
} from "@/lib/client/page-api";
import { useErrorSfx } from "@/lib/client/sfx";
import { getUserProfilePath } from "@/lib/client/users";

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

type ReplyTarget = {
  commentId: string | null;
  label: string;
};

/* ------------------------------------------------------------------ */
/*  PostStreamPage                                                     */
/* ------------------------------------------------------------------ */

export function PostStreamPage({ variant = "page" }: PostStreamPageProps) {
  const { profile: currentProfile, loading: profileLoading } = useCurrentUserProfile();
  const {
    bundle,
    commentsByPost,
    currentPostVotesById,
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

  useEffect(() => {
    if (!profileLoading && !currentProfile) {
      window.location.href = "/";
    }
  }, [currentProfile, profileLoading]);
  const [header, setHeader] = useState("");
  const [content, setContent] = useState("");
  const [sectionId, setSectionId] = useState("general");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);
  useErrorSfx(error);
  useErrorSfx(submitError);
  useErrorSfx(voteError);

  /* -- derived data ------------------------------------------------ */
  const posts = useMemo(
    () => (bundle?.posts ?? []).slice().reverse(),
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
      await postJson<PostRecord>(mode === "question" ? "/api/questions" : "/api/guides", {
        roomId: bundle.room.id,
        pageId: bundle.page.id,
        sectionId,
        header,
        content,
      });

      setHeader("");
      setContent("");
      setSectionId("general");
      await refresh({ silent: true });
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
    if (currentPostVotesById?.[post.id] === delta) {
      setVoteError(
        delta === 1
          ? "You already upvoted this post."
          : "You already downvoted this post.",
      );
      return;
    }

    try {
      await updatePostLikes(post, delta);
      await refresh({ silent: true });
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
          <PanelHeader title="Post Stream" />

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
                <PostCard
                  key={post.id}
                  post={post}
                  tone={pickTone(index)}
                  voteValue={currentPostVotesById?.[post.id] ?? null}
                  commentCount={getCommentCount(commentsByPost, post.id)}
                  usersById={usersById}
                  chatHref={buildScopedHref("/chat")}
                  postHref={buildScopedHref(`/posts/${post.id}`)}
                  onVote={handlePostVote}
                />
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

function PostCard({
  post,
  tone,
  voteValue,
  commentCount,
  usersById,
  chatHref,
  postHref,
  onVote,
}: {
  post: PostRecord;
  tone: string;
  voteValue: 1 | -1 | null;
  commentCount: number;
  usersById: Record<string, UserProfileRecord>;
  chatHref: string;
  postHref: string;
  onVote: (post: PostRecord, delta: 1 | -1) => void;
}) {
  return (
    <article className={`post-card post-card--${tone}`}>
      <div className="post-votes">
        <button
          type="button"
          aria-pressed={voteValue === 1}
          disabled={voteValue === 1}
          onClick={() => onVote(post, 1)}
        >
          +
        </button>
        <strong>{post.likes}</strong>
        <button
          type="button"
          aria-pressed={voteValue === -1}
          disabled={voteValue === -1}
          onClick={() => onVote(post, -1)}
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
          <h2>
            <a href={postHref}>{post.header || truncate(post.content)}</a>
          </h2>
          <p>
            posted by{" "}
            <ProfileNameLink userId={post.user_id} usersById={usersById} />{" "}
            - {formatTimestamp(post.created_at)}
          </p>
        </header>
        <p>{post.content}</p>
        <footer>
          <a href={chatHref}>Continue in #chat</a>
          <a href={postHref}>{commentCount} replies</a>
          <a className="post-reply-btn" href={postHref}>Reply</a>
          <button type="button">Save</button>
        </footer>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/*  PostDetailPage                                                     */
/* ------------------------------------------------------------------ */

export function PostDetailPage({ postId }: { postId: string }) {
  const { profile: currentProfile, loading: profileLoading } = useCurrentUserProfile();
  const {
    bundle,
    commentsByPost,
    currentPostxVotesById,
    currentCommentVotesById,
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
  const [replyTarget, setReplyTarget] = useState<ReplyTarget>({
    commentId: null,
    label: "the thread",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);
  useErrorSfx(error);
  useErrorSfx(submitError);
  useErrorSfx(voteError);

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
      await postJson<CommentRecord>("/api/answers", {
        postId: post.id,
        content,
        replyId: replyTarget.commentId,
      });

      setContent("");
      setReplyTarget({ commentId: null, label: "the thread" });
      await refresh({ silent: true });
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
    if (currentPostVotesById?.[postToUpdate.id] === delta) {
      setVoteError(
        delta === 1
          ? "You already upvoted this post."
          : "You already downvoted this post.",
      );
      return;
    }

    try {
      await updatePostLikes(postToUpdate, delta);
      await refresh({ silent: true });
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

  const focusReplyComposer = (target?: ReplyTarget) => {
    if (target) {
      setReplyTarget(target);
    }

    if (typeof document === "undefined") {
      return;
    }

    document.getElementById("post-mobile-composer")?.scrollIntoView({
      block: "end",
      behavior: "smooth",
    });
    window.setTimeout(() => {
      document.getElementById("post-reply-input")?.focus();
    }, 160);
  };

  /* -- success render ---------------------------------------------- */
  return (
    <PostShell title={`PairPod - ${post.header || "Thread"}`} {...shellProps}>
      <div className="post-detail-layout">
        <section className="post-detail-main" aria-label="Thread detail">
          {/* ---------- main post ---------- */}
          <article
            className={`post-card post-card--full post-card--${pickTone(0)}`}
          >
            <div className="post-votes">
              <button
                type="button"
                aria-pressed={currentPostVotesById?.[post.id] === 1}
                disabled={currentPostVotesById?.[post.id] === 1}
                onClick={() => void handlePostVote(post, 1)}
              >
                +
              </button>
              <strong>{post.likes}</strong>
              <button
                type="button"
                aria-pressed={currentPostVotesById?.[post.id] === -1}
                disabled={currentPostVotesById?.[post.id] === -1}
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
                  <ProfileNameLink userId={post.user_id} usersById={usersById} />{" "}
                  - {formatTimestamp(post.created_at)}
                </p>
              </header>
              <p>{post.content}</p>
              <footer>
                <a href={buildScopedHref("/posts")}>Back to post list</a>
                <a href={buildScopedHref("/chat")}>Continue in #chat</a>
                <button
                  className="post-reply-btn"
                  type="button"
                  onClick={() => focusReplyComposer({ commentId: null, label: "the thread" })}
                >
                  Reply
                </button>
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
                    replies={repliesByParent[comment.id] ?? []}
                    refresh={refresh}
                    parentUser={null}
                    usersById={usersById}
                    currentCommentVotesById={currentCommentVotesById}
                    onReply={(target) => focusReplyComposer(target)}
                  />
                ))
              ) : (
                <article className="post-comment post-comment--blue">
                  <div className="post-comment__avatar">A</div>
                  <div className="post-comment__body">
                    <header>
                      <h2>No answers yet</h2>
                    </header>
                    <p>Start the conversation from the composer below.</p>
                  </div>
                </article>
              )}
            </div>

            <form
              id="post-mobile-composer"
              className="post-mobile-composer"
              onSubmit={(event) => void handleSubmit(event)}
            >
              <div className="post-mobile-composer__context">
                <span>Replying to <strong>{replyTarget.label}</strong></span>
                {replyTarget.commentId ? (
                  <button
                    type="button"
                    onClick={() => setReplyTarget({ commentId: null, label: "the thread" })}
                  >
                    Thread
                  </button>
                ) : null}
              </div>
              <div className="post-mobile-composer__input">
                <textarea
                  id="post-reply-input"
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  placeholder={`Reply to ${replyTarget.label}...`}
                  rows={2}
                />
                <button
                  type="submit"
                  disabled={isSubmitting || !content.trim()}
                >
                  {isSubmitting ? "..." : "Send"}
                </button>
              </div>

              {submitError ? (
                <p className="status-note status-note--error">{submitError}</p>
              ) : null}
              {voteError ? (
                <p className="status-note status-note--error">{voteError}</p>
              ) : null}
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

function ProfileNameLink({
  userId,
  usersById,
}: {
  userId: string | null;
  usersById: Record<string, UserProfileRecord>;
}) {
  const displayName = getDisplayName(userId, usersById);
  const href = getUserProfilePath(userId);

  if (!href) {
    return <strong>{displayName}</strong>;
  }

  return (
    <a className="profile-name-link" href={href}>
      <strong>{displayName}</strong>
    </a>
  );
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
      <PostSceneBackground />
      <div className="post-shell__content">
        <section
          className={`post-window xp-window post-window--animate ${
            isPopup ? "post-window--popup" : ""
          }`}
          aria-labelledby={labelledBy}
        >
          <div className="xp-title-bar chat-titlebar">
            <PostTitleIcon />
            <span className="xp-title-text" id={labelledBy}>
              {title}
            </span>
            <div className="xp-title-controls" aria-hidden="true">
              <span className="xp-title-btn xp-title-btn--min">_</span>
              <span className="xp-title-btn xp-title-btn--max">[]</span>
              <span className="xp-title-btn xp-title-btn--close">x</span>
            </div>
          </div>

          <nav className="chat-menu chat-nav" aria-label="Section navigation">
            <a href={podsHref}>Room</a>
            <a href={chatHref}>Chat</a>
            <a href={postsHref} className="chat-nav__active">
              Posts
            </a>
            <a href={chatHref.replace("/chat", "/peers").replace("#/chat", "#/peers")}>
              3D Peers
            </a>
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
      </div>
    </main>
  );
}

function PostSceneBackground() {
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

function PostTitleIcon() {
  return (
    <svg
      className="xp-title-icon post-title-icon"
      viewBox="0 0 32 32"
      role="img"
      aria-label="Posts"
      xmlns="http://www.w3.org/2000/svg"
    >
      <ellipse cx="16" cy="18" rx="12" ry="11" fill="#6ebe44" stroke="#2d7018" strokeWidth="1.8" />
      <path d="M14 8c1.2-3 4-4.8 7.6-4.8-1.2 3.1-3.7 4.8-7.6 4.8z" fill="#8cd960" stroke="#2d7018" strokeWidth="1.2" />
      <line x1="16" y1="9" x2="16" y2="4.5" stroke="#2d7018" strokeWidth="2" strokeLinecap="round" />
      <circle cx="11.5" cy="17" r="3.3" fill="white" />
      <circle cx="20.5" cy="17" r="3.3" fill="white" />
      <circle cx="12.2" cy="17.4" r="1.4" fill="#1a2a44" />
      <circle cx="21.2" cy="17.4" r="1.4" fill="#1a2a44" />
      <path d="M11.5 23c2.9 2.3 6.1 2.3 9 0" stroke="#2d5018" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
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
  replies,
  refresh,
  parentUser,
  usersById,
  currentCommentVotesById,
  onReply,
}: {
  comment: CommentRecord;
  tone: string;
  replies: CommentRecord[];
  refresh: (options?: { silent?: boolean }) => Promise<unknown>;
  parentUser: string | null;
  usersById: Record<string, UserProfileRecord>;
  currentCommentVotesById: Record<string, 1 | -1>;
  onReply: (target: ReplyTarget) => void;
}) {
  const [voteError, setVoteError] = useState<string | null>(null);
  useErrorSfx(voteError);

  const displayName = getDisplayName(comment.user_id, usersById);

  const handleCommentVote = async (
    commentToUpdate: CommentRecord,
    delta: 1 | -1,
  ) => {
    setVoteError(null);
    if (currentCommentVotesById?.[commentToUpdate.id] === delta) {
      setVoteError(
        delta === 1
          ? "You already liked this reply."
          : "You already disliked this reply.",
      );
      return;
    }

    try {
      await updateCommentLikes(commentToUpdate, delta);
      await refresh({ silent: true });
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
          <h2>
            @<ProfileNameLink userId={comment.user_id} usersById={usersById} />
          </h2>
          <span>{formatTimestamp(comment.created_at)}</span>
        </header>
        <p>{comment.content}</p>

        <div className="post-comment__votes" aria-label="Comment votes">
          <button
            type="button"
            aria-pressed={currentCommentVotesById?.[comment.id] === 1}
            disabled={currentCommentVotesById?.[comment.id] === 1}
            onClick={() => void handleCommentVote(comment, 1)}
          >
            Like
          </button>
          <strong>{comment.likes}</strong>
          <button
            type="button"
            aria-pressed={currentCommentVotesById?.[comment.id] === -1}
            disabled={currentCommentVotesById?.[comment.id] === -1}
            onClick={() => void handleCommentVote(comment, -1)}
          >
            Dislike
          </button>
          <button
            type="button"
            className="post-reply-btn"
            onClick={() => onReply({ commentId: comment.id, label: `@${displayName}` })}
          >
            Reply
          </button>
        </div>

        {voteError ? (
          <p className="status-note status-note--error">{voteError}</p>
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
                      @<ProfileNameLink userId={reply.user_id} usersById={usersById} />
                    </h2>
                    <span>{formatTimestamp(reply.created_at)}</span>
                  </header>
                  <p>{reply.content}</p>
                  <div
                    className="post-comment__votes"
                    aria-label="Reply actions"
                  >
                    <button
                      type="button"
                      aria-pressed={currentCommentVotesById?.[reply.id] === 1}
                      disabled={currentCommentVotesById?.[reply.id] === 1}
                      onClick={() => void handleCommentVote(reply, 1)}
                    >
                      Like
                    </button>
                    <strong>{reply.likes}</strong>
                    <button
                      type="button"
                      aria-pressed={currentCommentVotesById?.[reply.id] === -1}
                      disabled={currentCommentVotesById?.[reply.id] === -1}
                      onClick={() => void handleCommentVote(reply, -1)}
                    >
                      Dislike
                    </button>
                    <button
                      type="button"
                      className="post-reply-btn"
                      onClick={() =>
                        onReply({
                          commentId: comment.id,
                          label: `@${getDisplayName(reply.user_id, usersById)}`,
                        })
                      }
                    >
                      Reply
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
