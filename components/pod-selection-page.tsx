type Pod = {
  domain: string;
  description: string;
  online: number;
  tone: "blue" | "orange" | "green" | "red" | "silver";
  icon: "globe" | "reddit" | "wiki" | "youtube" | "plus";
  members: string[];
};

type Activity = {
  domain: string;
  text: string;
  time: string;
  icon: Pod["icon"];
};

const pods: Pod[] = [
  { domain: "github.com", description: "Code, collaborate, build.", online: 124, tone: "blue", icon: "globe", members: ["M", "R", "A", "J", "T"] },
  { domain: "reddit.com", description: "Communities, stories, discussions.", online: 88, tone: "orange", icon: "reddit", members: ["T", "M", "N", "L", "C"] },
  { domain: "wikipedia.org", description: "Knowledge, facts, learning.", online: 42, tone: "green", icon: "wiki", members: ["S", "K", "P", "D", "R"] },
  { domain: "youtube.com", description: "Videos, creators, conversations.", online: 67, tone: "red", icon: "youtube", members: ["A", "B", "K", "E", "G"] },
  { domain: "Add Custom Pod", description: "Enter any domain to create a pod.", online: 0, tone: "silver", icon: "plus", members: [] },
];

const recentPosts: Activity[] = [
  { domain: "reddit.com", text: "How do I stay consistent?", time: "12m ago", icon: "reddit" },
  { domain: "reddit.com", text: "Tips for learning React in 2024", time: "1h ago", icon: "reddit" },
  { domain: "github.com", text: "Discussion on App Router", time: "2h ago", icon: "globe" },
];

const recentComments: Activity[] = [
  { domain: "github.com", text: "Great explanation!", time: "8m ago", icon: "globe" },
  { domain: "reddit.com", text: "Totally agree with this.", time: "35m ago", icon: "reddit" },
  { domain: "youtube.com", text: "Love this breakdown", time: "1h ago", icon: "youtube" },
];

const history: Activity[] = [
  { domain: "youtube.com", text: "Visited 2h ago", time: "", icon: "youtube" },
  { domain: "github.com", text: "Visited 5h ago", time: "", icon: "globe" },
  { domain: "reddit.com", text: "Visited yesterday", time: "", icon: "reddit" },
  { domain: "wikipedia.org", text: "Visited yesterday", time: "", icon: "wiki" },
];

export function PodSelectionPage() {
  return (
    <main className="app-scene pod-scene">
      <AppBackground />
      <section className="pod-window xp-window pop-in" aria-labelledby="pod-title">
        <div className="xp-title-bar">
          <PodTitleIcon />
          <span className="xp-title-text">Uncommon Hacks - Your Pods</span>
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
                <h1 className="pod-page-title" id="pod-title">Your Pods</h1>
                <p className="app-copy">Chat with people on the same domain.</p>
              </header>

              <div className="pod-list">
                {pods.map((pod) => (
                  <article className={`pod-card pod-card--${pod.tone}`} key={pod.domain}>
                    <PodIcon icon={pod.icon} />
                    <div className="pod-card__content">
                      <h2 className="pod-card__title">{pod.domain}</h2>
                      <p className="pod-card__copy">{pod.description}</p>
                      {pod.online > 0 ? (
                        <p className="pod-card__meta"><span className="live-dot" />{pod.online} online</p>
                      ) : null}
                    </div>
                    {pod.members.length > 0 ? (
                      <div className="pod-avatars" aria-label={`${pod.domain} active members`}>
                        {pod.members.map((member, index) => (
                          <span className={`pod-avatar pod-avatar--${index + 1}`} key={member}>{member}</span>
                        ))}
                      </div>
                    ) : null}
                    <button className="pod-card__button" type="button" aria-label={`Open ${pod.domain}`}>
                      <span aria-hidden="true">&gt;</span>
                    </button>
                  </article>
                ))}
              </div>
            </section>

            <aside className="pod-sidebar" aria-label="Pod activity">
              <UserTile />
              <ActivityPanel title="Recent Posts" action="View all posts" items={recentPosts} />
              <ActivityPanel title="Recent Comments" action="View all comments" items={recentComments} />
              <ActivityPanel title="Past Pod Activity" action="View full history" items={history} compact />
            </aside>
          </div>
        </div>
      </section>
    </main>
  );
}

function ActivityPanel({
  title,
  action,
  items,
  compact = false,
}: {
  title: string;
  action: string;
  items: Activity[];
  compact?: boolean;
}) {
  return (
    <section className="activity-panel">
      <header className="activity-panel__titlebar">
        <span className="activity-panel__glyph" aria-hidden="true" />
        <h2>{title}</h2>
        <span className="activity-panel__control" aria-hidden="true">_</span>
        <span className="activity-panel__control" aria-hidden="true">x</span>
      </header>
      <div className="activity-panel__body">
        {items.map((item) => (
          <article className={`activity-item ${compact ? "activity-item--compact" : ""}`} key={`${title}-${item.domain}-${item.text}`}>
            <PodMiniIcon icon={item.icon} />
            <div className="activity-item__content">
              <h3>{item.domain}</h3>
              <p>{item.text}</p>
            </div>
            {item.time ? <time>{item.time}</time> : null}
          </article>
        ))}
        <a className="activity-panel__action" href="#">
          {action} <span aria-hidden="true">-&gt;</span>
        </a>
      </div>
    </section>
  );
}

function UserTile() {
  return (
    <section className="pod-user-tile" aria-label="Current user">
      <span className="pod-user-avatar" aria-hidden="true"><PodFace /></span>
      <div>
        <h2>user_3w</h2>
        <p><span className="live-dot" /> Online</p>
      </div>
      <button className="pod-user-menu" type="button" aria-label="Open user menu">
        <span aria-hidden="true">v</span>
      </button>
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
      <svg className="hills-svg" viewBox="0 0 1000 500" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
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

function PodIcon({ icon }: { icon: Pod["icon"] }) {
  return (
    <span className={`pod-icon pod-icon--${icon}`} aria-hidden="true">
      <IconShape icon={icon} />
    </span>
  );
}

function PodMiniIcon({ icon }: { icon: Pod["icon"] }) {
  return (
    <span className={`pod-mini-icon pod-mini-icon--${icon}`} aria-hidden="true">
      <IconShape icon={icon} />
    </span>
  );
}

function IconShape({ icon }: { icon: Pod["icon"] }) {
  if (icon === "reddit") return <RedditIcon />;
  if (icon === "wiki") return <WikiIcon />;
  if (icon === "youtube") return <YoutubeIcon />;
  if (icon === "plus") return <PlusIcon />;
  return <GlobeIcon />;
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="18" stroke="currentColor" strokeWidth="4" />
      <path d="M8 24h32M24 6c6 5 9 11 9 18s-3 13-9 18M24 6c-6 5-9 11-9 18s3 13 9 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function RedditIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="26" r="15" fill="currentColor" />
      <circle cx="18" cy="25" r="3" fill="white" />
      <circle cx="30" cy="25" r="3" fill="white" />
      <path d="M18 32c4 3 8 3 12 0" stroke="white" strokeWidth="3" strokeLinecap="round" />
      <path d="M24 12l5-5 7 2" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <circle cx="38" cy="10" r="4" fill="currentColor" />
    </svg>
  );
}

function WikiIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none">
      <path d="M7 13h7l7 22 7-22h5l7 22" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function YoutubeIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none">
      <rect x="7" y="13" width="34" height="22" rx="6" fill="currentColor" />
      <path d="M21 18l11 6-11 6V18z" fill="white" />
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
      <path d="M32 13c-11 0-20 9-20 21s9 21 20 21 20-9 20-21-9-21-20-21z" fill="#6ebe44" stroke="#2d7018" strokeWidth="3" />
      <path d="M23 12c2-5 7-8 13-8-2 5-6 8-13 8z" fill="#8cd960" stroke="#2d7018" strokeWidth="2" />
      <circle cx="24" cy="31" r="6" fill="white" />
      <circle cx="40" cy="31" r="6" fill="white" />
      <circle cx="25" cy="32" r="3" fill="#1a2a44" />
      <circle cx="41" cy="32" r="3" fill="#1a2a44" />
      <path d="M24 43c5 4 11 4 16 0" stroke="#2d5018" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
