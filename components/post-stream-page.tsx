import type { ReactNode } from "react";

type Comment = {
  author: string;
  time: string;
  body: string;
  likes: number;
  dislikes: number;
  tone: "blue" | "green" | "orange" | "purple";
};

export type Post = {
  slug: string;
  title: string;
  author: string;
  time: string;
  body: string;
  replies: number;
  votes: number;
  tag: string;
  tone: "blue" | "green" | "orange" | "purple";
  comments: Comment[];
};

type SidebarItem = {
  title: string;
  meta: string;
};

export const posts: Post[] = [
  {
    slug: "auth-callback-structure",
    title: "How should we structure auth callbacks?",
    author: "debugger99",
    time: "8m ago",
    body: "I am wiring Supabase auth into the extension flow and want to keep the server routes tidy. Anyone have a clean pattern for redirect handling? The tricky part is keeping the extension, web app, and callback route all speaking the same redirect language without scattering URL checks across the client.",
    replies: 14,
    votes: 32,
    tag: "backend",
    tone: "blue",
    comments: [
      { author: "rootkit", time: "6m ago", body: "Keep the callback route tiny. Validate the code, exchange it server-side, then centralize the final redirect in one helper.", likes: 18, dislikes: 1, tone: "green" },
      { author: "luna_dev", time: "4m ago", body: "Also make the error page styled. Auth failures feel much less scary when they land inside the same XP window chrome.", likes: 11, dislikes: 0, tone: "purple" },
      { author: "pixelboy", time: "2m ago", body: "For the extension, I would avoid storing intermediate state in the popup. Let the browser tab complete auth, then ask users to reload the extension.", likes: 9, dislikes: 2, tone: "blue" },
    ],
  },
  {
    slug: "pod-card-polish",
    title: "Tiny UI polish pass on the pod cards",
    author: "luna_dev",
    time: "18m ago",
    body: "The shared globals are doing most of the work now. I pushed a pass that makes the pod selection cards feel closer to the chat chrome while still leaving room for domain-specific color.",
    replies: 8,
    votes: 27,
    tag: "design",
    tone: "purple",
    comments: [
      { author: "starry_nova", time: "15m ago", body: "The beveled arrows are the right kind of extra. They make the page feel clickable without needing tutorial text.", likes: 12, dislikes: 0, tone: "blue" },
      { author: "dev_jay", time: "10m ago", body: "Could use the same panel shell for saved posts later. Nice reuse.", likes: 7, dislikes: 1, tone: "orange" },
    ],
  },
  {
    slug: "git-workflow-tips",
    title: "Git workflow tips for small teams",
    author: "octo_lover",
    time: "42m ago",
    body: "Squash feature branches, keep main deployable, and write commit messages like the next person is reading during a small emergency.",
    replies: 32,
    votes: 58,
    tag: "git",
    tone: "green",
    comments: [
      { author: "pixelboy", time: "39m ago", body: "Small PRs are the cheat code. Review becomes a conversation instead of archaeology.", likes: 21, dislikes: 1, tone: "blue" },
      { author: "code_newbie", time: "28m ago", body: "Do you squash before review or after approval?", likes: 8, dislikes: 0, tone: "orange" },
      { author: "octo_lover", time: "20m ago", body: "After approval. Keeps review history readable while still landing one clean commit.", likes: 16, dislikes: 0, tone: "green" },
    ],
  },
  {
    slug: "vscode-next-extensions",
    title: "Best VS Code extensions for Next apps?",
    author: "dev_jay",
    time: "1h ago",
    body: "Looking for a lean setup that helps with TypeScript, Tailwind-ish class cleanup, and Supabase types without turning my editor into a control panel.",
    replies: 18,
    votes: 41,
    tag: "tools",
    tone: "orange",
    comments: [
      { author: "debugger99", time: "55m ago", body: "ESLint, Error Lens, and the official Tailwind extension if the project uses it. I keep the rest boring.", likes: 14, dislikes: 2, tone: "purple" },
      { author: "rootkit", time: "48m ago", body: "Supabase type generation matters more than editor plugins. Make it a script and commit the generated file.", likes: 13, dislikes: 1, tone: "green" },
    ],
  },
];

const hotThreads: SidebarItem[] = [
  { title: "Review my PR checklist", meta: "rootkit - 21 replies" },
  { title: "Edge extension reload flow", meta: "pixelboy - 13 replies" },
  { title: "Database type generation", meta: "code_newbie - 9 replies" },
];

const roomStats: SidebarItem[] = [
  { title: "124 online", meta: "right now" },
  { title: "582 members", meta: "in this pod" },
  { title: "48 posts", meta: "today" },
];

export function getPostBySlug(slug: string) {
  return posts.find((post) => post.slug === slug);
}

export function PostStreamPage() {
  return (
    <PostShell title="3WPosts - github.com" labelledBy="post-stream-title">
      <div className="post-layout">
        <ComposePanel />
        <section className="post-stream" aria-label="Post stream">
          <PanelHeader title="Post Stream" />
          <div className="post-filterbar">
            <button type="button" className="active">Hot</button>
            <button type="button">New</button>
            <button type="button">Unanswered</button>
            <button type="button">Following</button>
          </div>
          <div className="post-list">
            {posts.map((post) => (
              <article className={`post-card post-card--${post.tone}`} key={post.slug}>
                <div className="post-votes">
                  <button type="button">+</button>
                  <strong>{post.votes}</strong>
                  <button type="button">-</button>
                </div>
                <div className="post-card__body">
                  <header>
                    <span className="post-tag">{post.tag}</span>
                    <h2><a href={`/posts/${post.slug}`}>{post.title}</a></h2>
                    <p>posted by <strong>{post.author}</strong> - {post.time}</p>
                  </header>
                  <p>{post.body}</p>
                  <footer>
                    <a href="/chat">Continue in #chat</a>
                    <a href={`/posts/${post.slug}`}>{post.replies} replies</a>
                    <button type="button">Save</button>
                  </footer>
                </div>
              </article>
            ))}
          </div>
        </section>
        <PostSidebar />
      </div>
    </PostShell>
  );
}

export function PostDetailPage({ post }: { post: Post }) {
  return (
    <PostShell title={`3WPosts - ${post.title}`} labelledBy="post-detail-title">
      <div className="post-detail-layout">
        <section className="post-detail-main">
          <PanelHeader title="Full Post" />
          <article className={`post-card post-card--${post.tone} post-card--full`}>
            <div className="post-votes">
              <button type="button">+</button>
              <strong>{post.votes}</strong>
              <button type="button">-</button>
            </div>
            <div className="post-card__body">
              <header>
                <span className="post-tag">{post.tag}</span>
                <h1 id="post-detail-title">{post.title}</h1>
                <p>posted by <strong>{post.author}</strong> - {post.time}</p>
              </header>
              <p>{post.body}</p>
              <footer>
                <a href="/posts">Back to post list</a>
                <a href="/chat">Continue in #chat</a>
              </footer>
            </div>
          </article>

          <section className="post-comments" aria-label="Comments">
            <PanelHeader title={`Comments (${post.comments.length})`} />
            <div className="post-comments__list">
              {post.comments.map((comment) => (
                <article className={`post-comment post-comment--${comment.tone}`} key={`${comment.author}-${comment.time}`}>
                  <div className="post-comment__avatar">{comment.author.charAt(0).toUpperCase()}</div>
                  <div className="post-comment__body">
                    <header>
                      <h2>{comment.author}</h2>
                      <span>{comment.time}</span>
                    </header>
                    <p>{comment.body}</p>
                    <div className="post-comment__votes" aria-label="Comment votes">
                      <button type="button">Like</button>
                      <strong>{comment.likes}</strong>
                      <button type="button">Dislike</button>
                      <strong>{comment.dislikes}</strong>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </section>

        <aside className="post-sidebar">
          <section className="post-shortcuts">
            <PanelHeader title="Post Actions" />
            <a href="/posts">Back to posts</a>
            <a href="/chat">Open #chat stream</a>
            <a href="#">Follow thread</a>
          </section>
          <PostSidebar />
        </aside>
      </div>
    </PostShell>
  );
}

function PostShell({ title, labelledBy, children }: { title: string; labelledBy: string; children: ReactNode }) {
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
          <a href="/chat">Chat</a>
          <a href="/pods">Pods</a>
          <a href="/posts">Posts</a>
          <a href="#">Sort</a>
          <a href="#">Help</a>
        </nav>
        {children}
      </section>
    </main>
  );
}

function ComposePanel() {
  return (
    <aside className="post-compose-panel">
      <PanelHeader title="Create Post" />
      <form className="post-compose">
        <label><span>Title</span><input type="text" defaultValue="Share something with github.com" /></label>
        <label><span>Post</span><textarea defaultValue="Ask a question, share a commit, or start a thread..." /></label>
        <button type="button">Post to Pod</button>
      </form>
      <div className="post-room-card">
        <PodRoomIcon />
        <div><h2>github.com</h2><p>Code, collaborate, build.</p></div>
        <a href="/chat">Open #chat</a>
      </div>
    </aside>
  );
}

function PostSidebar() {
  return (
    <>
      <SidePanel title="Hot Threads" action="View all threads" items={hotThreads} />
      <SidePanel title="Room Stats" action="Full activity" items={roomStats} />
      <section className="post-shortcuts">
        <PanelHeader title="Connected Views" />
        <a href="/chat"># chat stream</a>
        <a href="/pods">Your pods</a>
        <a href="#">Saved posts</a>
      </section>
    </>
  );
}

function PanelHeader({ title }: { title: string }) {
  return <header className="chat-panel-header"><h2>{title}</h2></header>;
}

function SidePanel({ title, action, items }: { title: string; action: string; items: SidebarItem[] }) {
  return (
    <section className="chat-rail-panel">
      <PanelHeader title={title} />
      <div className="chat-rail-panel__body">
        {items.map((item) => (
          <article className="chat-rail-item" key={item.title}><h3>{item.title}</h3><p>{item.meta}</p></article>
        ))}
        <a href="#">{action}</a>
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
        <path d="M8 24h32M24 6c6 5 9 11 9 18s-3 13-9 18M24 6c-6 5-9 11-9 18s3 13 9 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </span>
  );
}
