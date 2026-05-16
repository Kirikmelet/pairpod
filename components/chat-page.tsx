type Member = {
  name: string;
  status: "Online" | "Away";
  tone: number;
};

type Message = {
  time: string;
  author: string;
  tone: "purple" | "pink" | "green" | "blue" | "bot" | "brown";
  lines: string[];
  badge?: string;
  callout?: string;
  replies?: string;
};

type Activity = {
  title: string;
  meta: string;
  count?: string;
};

const members: Member[] = [
  { name: "pixelboy", status: "Online", tone: 1 },
  { name: "luna_dev", status: "Online", tone: 2 },
  { name: "rootkit", status: "Online", tone: 3 },
  { name: "starry_nova", status: "Online", tone: 4 },
  { name: "debugger99", status: "Away", tone: 5 },
  { name: "octo_lover", status: "Online", tone: 6 },
  { name: "code_newbie", status: "Away", tone: 7 },
  { name: "dev_jay", status: "Online", tone: 8 },
];

const messages: Message[] = [
  { time: "10:22", author: "pixelboy", tone: "purple", lines: ["just pushed a new commit!"] },
  { time: "10:23", author: "luna_dev", tone: "pink", lines: ["looks clean! love the animations"] },
  { time: "10:24", author: "rootkit", tone: "green", lines: ["anyone down to review my PR?", "github.com/rootkit/project/pull/42"] },
  { time: "10:24", author: "starry_nova", tone: "blue", lines: ["on it! give me 5 mins"] },
  {
    time: "10:25",
    author: "AI Buddy",
    tone: "bot",
    badge: "BOT",
    lines: ["Need help with Git? Try /git <question>", "Example: /git how do I squash commits?"],
  },
  {
    time: "10:25",
    author: "debugger99",
    tone: "brown",
    lines: ["having an issue with auth... anyone", "seen this before?"],
    callout: "Error: bad credentials",
    replies: "3 replies - View thread",
  },
  { time: "10:26", author: "pixelboy", tone: "purple", lines: ["hmm check your token permissions"] },
];

const posts: Activity[] = [
  { title: "How do I stay consistent?", meta: "coder_newbie", count: "24" },
  { title: "Best VS Code extensions?", meta: "dev_jay", count: "18" },
  { title: "Git workflow tips", meta: "octo_lover", count: "32" },
];

const recent: Activity[] = [
  { title: "luna_dev joined the room", meta: "2m ago" },
  { title: "rootkit shared a post", meta: "15m ago" },
  { title: "starry_nova commented", meta: "1h ago" },
  { title: "pixelboy pushed a commit", meta: "2h ago" },
];

export function ChatPage() {
  return (
    <main className="chat-shell">
      <section className="chat-window xp-window" aria-labelledby="chat-title">
        <div className="xp-title-bar chat-titlebar">
          <PodGlyph />
          <span className="xp-title-text" id="chat-title">3WChat - github.com</span>
          <div className="xp-title-controls" aria-hidden="true">
            <span className="xp-title-btn xp-title-btn--min">_</span>
            <span className="xp-title-btn xp-title-btn--max">[]</span>
            <span className="xp-title-btn xp-title-btn--close">x</span>
          </div>
        </div>

        <nav className="chat-menu" aria-label="Chat menu">
          <a href="#">Room</a>
          <a href="#">Edit</a>
          <a href="#">View</a>
          <a href="#">Actions</a>
          <a href="#">Help</a>
        </nav>

        <div className="chat-layout">
          <aside className="chat-members" aria-label="Room members">
            <PanelHeader title="Members (124)" />
            <div className="chat-members__list">
              {members.map((member) => (
                <article className="chat-member" key={member.name}>
                  <span className={`chat-avatar chat-avatar--${member.tone}`}>{member.name.charAt(0).toUpperCase()}</span>
                  <div>
                    <h2>{member.name}</h2>
                    <p>{member.status}</p>
                  </div>
                </article>
              ))}
              <a className="chat-more" href="#">+ 115 more</a>
            </div>
            <div className="chat-member-actions">
              <button type="button" className="chat-side-button"><span className="chat-side-icon">+</span>Invite Someone</button>
              <button type="button" className="chat-side-button"><span className="chat-side-icon">[]</span>Leave Room</button>
            </div>
          </aside>

          <section className="chat-main" aria-label="Chat transcript">
            <PanelHeader title="# chat" />
            <div className="chat-topic">
              <p>*** You have joined #chat</p>
              <p>*** Topic: Welcome to github.com! Code, collaborate, build.</p>
              <p>*** 124 users in this room</p>
            </div>
            <div className="chat-transcript">
              {messages.map((message) => (
                <article className="chat-message" key={`${message.time}-${message.author}`}>
                  <span className="chat-message__time">[{message.time}]</span>
                  <div className="chat-message__body">
                    <p>
                      <strong className={`chat-name chat-name--${message.tone}`}>{message.author}:</strong>
                      {message.badge ? <span className="chat-badge">{message.badge}</span> : null}
                      {" "}{message.lines[0]}
                    </p>
                    {message.lines.slice(1).map((line) => (
                      <p className={line.includes("github.com") || line.startsWith("Example:") ? "chat-link-line" : ""} key={line}>{line}</p>
                    ))}
                    {message.callout ? <p className="chat-error">{message.callout}</p> : null}
                    {message.replies ? <a className="chat-thread" href="#">-&gt; {message.replies}</a> : null}
                  </div>
                </article>
              ))}
            </div>
            <div className="chat-toolbar" aria-label="Message tools">
              {["A", "A*", "B", "I", "U", "link", "img", ":)"].map((tool) => (
                <button type="button" key={tool}>{tool}</button>
              ))}
            </div>
            <form className="chat-composer">
              <label className="sr-only" htmlFor="chat-message">Message</label>
              <textarea id="chat-message" aria-label="Message" />
              <button type="submit">Send</button>
              <button type="button" aria-label="Voice message">)))</button>
            </form>
          </section>

          <aside className="chat-rail" aria-label="Room details">
            <section className="chat-info-card">
              <PanelHeader title="Room Info" />
              <div className="chat-info-card__body">
                <PodRoomIcon />
                <div>
                  <h2>github.com</h2>
                  <p>Code, collaborate, build.</p>
                </div>
                <p className="chat-info-card__meta">Created: Feb 8, 2024</p>
                <p className="chat-info-card__meta">124 online <span className="live-dot" /> 582 members</p>
              </div>
            </section>
            <RailPanel title="Recent Posts" action="View all posts" items={posts} />
            <RailPanel title="Recent Activity" action="View full history" items={recent} />
          </aside>
        </div>
      </section>
    </main>
  );
}

function PanelHeader({ title }: { title: string }) {
  return <header className="chat-panel-header"><h2>{title}</h2></header>;
}

function RailPanel({ title, action, items }: { title: string; action: string; items: Activity[] }) {
  return (
    <section className="chat-rail-panel">
      <PanelHeader title={title} />
      <div className="chat-rail-panel__body">
        {items.map((item) => (
          <article className="chat-rail-item" key={`${title}-${item.title}`}>
            <h3>{item.title}</h3>
            <p>{item.meta}{item.count ? <span>{item.count} replies</span> : null}</p>
          </article>
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
