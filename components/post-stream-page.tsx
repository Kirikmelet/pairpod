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

type SidebarItem = {
  title: string;
  meta: string;
};

type PostStreamPageProps = {
  variant?: "page" | "popup";
};

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
  const [mode, setMode] = useState<"question" | "guide">("question");
  const [header, setHeader] = useState("");
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);

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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!bundle || !content.trim()) {
      return;
    }

  const formData = new FormData(event.target);
  const postType = event.target.querySelector('select').value;
  const title = event.target.querySelector('input[type="text"]').value;
  const content = event.target.querySelector('textarea').value;

  const { data, error } = await supabase
    .from('posts')
    .insert([
      { 
        type: postType, 
        header: title, 
        content: content,
        // user_id: currentUserId // Usually required for RLS
      }
    ])
    .select();

  if (error) {
    console.error('Error posting:', error.message);
  } else {
    console.log('Post created successfully:', data);
    // Optional: Reset form or refresh list
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
        voteFailure instanceof Error ? voteFailure.message : "Failed to update vote",
      );
    }
  };

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
        {!isPopup ? (
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
        ) : null}
        <section className="post-stream" aria-label="Post stream">
          <PanelHeader title="Post Stream" />
          {isPopup ? (
            <form
              className="post-compose-strip"
              onSubmit={(event) => void handleSubmit(event)}
            >
              <div className="post-compose-strip__row">
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
                  value={header}
                  onChange={(event) => setHeader(event.target.value)}
                  placeholder="Title"
                />
              </div>
              <textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="Write a post..."
                rows={2}
              />
              {submitError ? (
                <p className="status-note status-note--error">{submitError}</p>
              ) : null}
              <button type="submit" disabled={isSubmitting || !content.trim()}>
                {isSubmitting ? "Posting..." : `Post ${mode}`}
              </button>
            </form>
          ) : null}
          {!isPopup ? (
            <div className="post-filterbar">
              <button type="button" className="active">
                Live
              </button>
              <button type="button">Questions</button>
              <button type="button">Guides</button>
              <button type="button">Following</button>
            </div>
          ) : null}

          {error ? (
            <p className="status-note status-note--error">{error}</p>
          ) : null}
          {voteError ? (
            <p className="status-note status-note--error">{voteError}</p>
          ) : null}
          {loading ? <p className="status-note">Loading posts...</p> : null}

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
                        -{" "}
                        {formatTimestamp(post.created_at)}
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
        voteFailure instanceof Error ? voteFailure.message : "Failed to update vote",
      );
    }
  };

  if (loading) {
    return (
      <PostShell
        title="PairPod - Loading"
        labelledBy="post-detail-title"
        chatHref={buildScopedHref("/chat")}
        postsHref={buildScopedHref("/posts")}
        podsHref={buildScopedHref("/")}
        globalHref={buildRoomHref("/posts", "global")}
        domainHref={buildRoomHref("/posts", "domain")}
        domainName={domainName}
        roomScope={roomScope}
      >
        <p className="status-note">Loading post...</p>
      </PostShell>
    );
  }

  if (error) {
    return (
      <PostShell
        title="PairPod - Error"
        labelledBy="post-detail-title"
        chatHref={buildScopedHref("/chat")}
        postsHref={buildScopedHref("/posts")}
        podsHref={buildScopedHref("/")}
        globalHref={buildRoomHref("/posts", "global")}
        domainHref={buildRoomHref("/posts", "domain")}
        domainName={domainName}
        roomScope={roomScope}
      >
        <p className="status-note status-note--error">{error}</p>
      </PostShell>
    );
  }

  if (!post) {
    return (
      <PostShell
        title="PairPod - Missing Post"
        labelledBy="post-detail-title"
        chatHref={buildScopedHref("/chat")}
        postsHref={buildScopedHref("/posts")}
        podsHref={buildScopedHref("/")}
        globalHref={buildRoomHref("/posts", "global")}
        domainHref={buildRoomHref("/posts", "domain")}
        domainName={domainName}
        roomScope={roomScope}
      >
        <p className="status-note status-note--error">
          This post could not be found in the current page context.
        </p>
      </PostShell>
    );
  }

  return (
    <PostShell
      title={`PairPod - ${post.header || "Thread"}`}
      labelledBy="post-detail-title"
      chatHref={buildScopedHref("/chat")}
      postsHref={buildScopedHref("/posts")}
      podsHref={buildScopedHref("/")}
      globalHref={buildRoomHref("/posts", "global")}
      domainHref={buildRoomHref("/posts", "domain")}
      domainName={domainName}
      roomScope={roomScope}
    >
      <div className="post-detail-layout">
        <section className="post-detail-main">
          <PanelHeader title="Full Post" />
          <article
            className={`post-card post-card--full post-card--${pickTone(0)}`}
          >
            <div className="post-votes">
              <button type="button" onClick={() => void handlePostVote(post, 1)}>
                +
              </button>
              <strong>{post.likes}</strong>
              <button type="button" onClick={() => void handlePostVote(post, -1)}>
                -
              </button>
            </div>
            <div className="post-card__body">
              <header>
                <span className="post-tag">{post.type}</span>
                <h1 id="post-detail-title">
                  {post.header || truncate(post.content)}
                </h1>
                <p>
                  posted by{" "}
                  <strong>
                    {getDisplayName(post.user_id, usersById)}
                  </strong>{" "}
                  -{" "}
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
  commentsByPost: Record<string, CommentRecord[]>,
  postId: string,
) {
  return commentsByPost[postId]?.length ?? 0;
}

function getPageTitle(bundle: ReturnType<typeof usePageBundle>["bundle"]) {
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
            <PodGlyph />
            <span className="xp-title-text">{title}</span>
            <div className="xp-title-controls" aria-hidden="true">
              <span className="xp-title-btn xp-title-btn--min">_</span>
              <span className="xp-title-btn xp-title-btn--max">[]</span>
              <span className="xp-title-btn xp-title-btn--close">x</span>
            </div>
          </div>
          <nav className="chat-menu post-nav" aria-label="Post stream menu">
            <a href={chatHref} className="nav-cta">→ Chat</a>
            <a href={podsHref}>Pods</a>
            <a href={postsHref} className="post-nav__active">Posts</a>
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
          disabled={isSubmitting}
        >
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
      <SidePanel
        title="Hot Threads"
        action="View all threads"
        href={postsHref}
        items={hotThreads}
      />
      <SidePanel
        title="Room Stats"
        action="Full activity"
        href={postsHref}
        items={roomStats}
      />
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
  refresh: () => Promise<unknown>;
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
      });
      setReplyContent("");
      setShowReplyForm(false);
      await refresh();
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : "Failed to post reply");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCommentVote = async (commentToUpdate: CommentRecord, delta: 1 | -1) => {
    setVoteError(null);
    try {
      await updateCommentLikes(commentToUpdate, delta);
      await refresh();
    } catch (voteFailure) {
      setVoteError(
        voteFailure instanceof Error ? voteFailure.message : "Failed to update vote",
      );
    }
  };

  return (
    <div className="post-thread-item">
      <article className={`post-comment post-comment--${tone}`}>
        {parentUser ? (
          <div className="post-reply-badge">
            ↳ replying to <strong>@{parentUser}</strong>
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
          <div className="post-comment__votes" aria-label="Comment votes">
            <button type="button" onClick={() => void handleCommentVote(comment, 1)}>
              Like
            </button>
            <strong>{comment.likes}</strong>
            <button type="button" onClick={() => void handleCommentVote(comment, -1)}>
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
        </div>
      </article>

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

      {replies.length > 0 ? (
        <div className="post-thread-replies">
          {replies.map((reply, index) => (
            <article
              key={reply.id}
              className={`post-comment post-comment--${pickTone(index)}`}
            >
              <div className="post-reply-badge post-reply-badge--nested">
                ↳ replying to <strong>@{displayName}</strong>
              </div>
              <div className="post-comment__avatar">
                {getDisplayName(reply.user_id, usersById).charAt(0).toUpperCase()}
              </div>
              <div className="post-comment__body">
                <header>
                  <h2>
                    @
                    {getDisplayName(reply.user_id, usersById)}
                  </h2>
                  <span>{formatTimestamp(reply.created_at)}</span>
                </header>
                <p>{reply.content}</p>
                <div className="post-comment__votes" aria-label="Reply votes">
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
