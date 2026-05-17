"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  getDmPath,
  getMemberDisplayName,
  listDmMessages,
  listDmThreads,
  sendDmMessage,
  type DmMessage,
  type DmThreadSummary,
} from "@/lib/client/dms";
import {
  DEFAULT_AVATAR_URL,
  formatTimestamp,
  useCurrentUserProfile,
} from "@/lib/client/page-api";
import { createClient } from "@/utils/supabase/client";

type DmPageProps = {
  threadId?: string;
};

export function DmPage({ threadId }: DmPageProps) {
  const { profile } = useCurrentUserProfile();
  const [threads, setThreads] = useState<DmThreadSummary[]>([]);
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(Boolean(threadId));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  const currentThread = useMemo(
    () => threads.find((thread) => thread.id === threadId) ?? null,
    [threadId, threads],
  );
  const conversationMembers = useMemo(
    () => {
      if (!currentThread) {
        return [];
      }

      const otherMembers = currentThread.members.filter(
        (member) => member.id !== profile?.id,
      );
      return otherMembers.length > 0 ? otherMembers : currentThread.members;
    },
    [currentThread, profile?.id],
  );
  const title = currentThread
    ? conversationMembers.map(getMemberDisplayName).join(", ") || "Direct Message"
    : "Direct Messages";

  useEffect(() => {
    let isMounted = true;

    async function loadThreads() {
      setLoadingThreads(true);
      setError(null);

      try {
        const nextThreads = await listDmThreads();
        if (isMounted) {
          setThreads(nextThreads);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(loadError instanceof Error ? loadError.message : "Could not load DMs.");
        }
      } finally {
        if (isMounted) {
          setLoadingThreads(false);
        }
      }
    }

    void loadThreads();

    const supabase = createClient();
    const channel = supabase
      .channel("dm-inbox")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dm_messages" },
        () => void loadThreads(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dm_thread_members" },
        () => void loadThreads(),
      )
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!threadId) {
      const timeout = window.setTimeout(() => {
        setMessages([]);
        setLoadingMessages(false);
      }, 0);
      return () => window.clearTimeout(timeout);
    }

    let isMounted = true;
    const activeThreadId = threadId;

    async function loadMessages() {
      setLoadingMessages(true);
      setError(null);

      try {
        const nextMessages = await listDmMessages(activeThreadId);
        if (isMounted) {
          setMessages(nextMessages);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(
            loadError instanceof Error ? loadError.message : "Could not load messages.",
          );
        }
      } finally {
        if (isMounted) {
          setLoadingMessages(false);
        }
      }
    }

    void loadMessages();

    const supabase = createClient();
    const channel = supabase
      .channel(`dm-thread:${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          filter: `thread_id=eq.${activeThreadId}`,
          schema: "public",
          table: "dm_messages",
        },
        () => void loadMessages(),
      )
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
    };
  }, [threadId]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!threadId || !draft.trim() || sending) {
      return;
    }

    setSending(true);
    setError(null);

    try {
      const created = await sendDmMessage(threadId, draft.trim());
      setMessages((current) =>
        current.some((message) => message.id === created.id)
          ? current
          : [...current, created],
      );
      setDraft("");
      setThreads(await listDmThreads());
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Could not send message.");
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="dm-shell">
      <DmBackground />
      <section className="dm-window xp-window" aria-labelledby="dm-title">
        <div className="xp-title-bar chat-titlebar">
          <DmGlyph />
          <span className="xp-title-text" id="dm-title">
            PairPod - {title}
          </span>
          <div className="xp-title-controls" aria-hidden="true">
            <span className="xp-title-btn xp-title-btn--min">_</span>
            <span className="xp-title-btn xp-title-btn--max">[]</span>
            <span className="xp-title-btn xp-title-btn--close">x</span>
          </div>
        </div>

        <nav className="chat-menu chat-nav" aria-label="Direct message menu">
          <a href={getDmPath("/")}>Room</a>
          <a href={getDmPath("/chat")}>Chat</a>
          <a href={getDmPath("/posts")}>Posts</a>
          <a className="chat-nav__active" href={getDmPath("/dms")}>
            DMs
          </a>
        </nav>

        <div className="dm-layout">
          <aside className="dm-sidebar" aria-label="DM conversations">
            <header className="chat-panel-header">
              <h2>Conversations</h2>
            </header>
            <div className="dm-thread-list">
              {loadingThreads ? (
                <p className="status-note">Loading conversations...</p>
              ) : threads.length > 0 ? (
                threads.map((thread) => (
                  <DmThreadLink
                    currentUserId={profile?.id ?? null}
                    isActive={thread.id === threadId}
                    key={thread.id}
                    thread={thread}
                  />
                ))
              ) : (
                <p className="status-note">No DMs yet. Start one from chat.</p>
              )}
            </div>
          </aside>

          <section className="dm-conversation" aria-label="DM messages">
            <header className="dm-conversation__header">
              <div>
                <p className="app-eyebrow">private chat</p>
                <h1>{title}</h1>
              </div>
              {currentThread ? (
                <div className="dm-member-stack" aria-label="Conversation members">
                  {conversationMembers.map((member) => (
                    <img
                      alt=""
                      key={member.id}
                      src={member.avatar_url || DEFAULT_AVATAR_URL}
                    />
                  ))}
                </div>
              ) : null}
            </header>

            {error ? <p className="chat-error">{error}</p> : null}

            {threadId ? (
              <>
                <div className="dm-transcript" ref={transcriptRef}>
                  {loadingMessages ? (
                    <p className="status-note">Loading messages...</p>
                  ) : messages.length > 0 ? (
                    messages.map((message) => (
                      <DmMessageBubble
                        isOwnMessage={message.sender?.id === profile?.id}
                        key={message.id}
                        message={message}
                      />
                    ))
                  ) : (
                    <p className="status-note">No messages yet.</p>
                  )}
                </div>

                <form className="dm-composer" onSubmit={(event) => void handleSubmit(event)}>
                  <label className="sr-only" htmlFor="dm-message">
                    Message
                  </label>
                  <textarea
                    id="dm-message"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="Write a direct message..."
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                  />
                  <button type="submit" disabled={sending || !draft.trim()}>
                    {sending ? "Sending..." : "Send"}
                  </button>
                </form>
              </>
            ) : (
              <div className="dm-empty-state">
                <h2>Select a conversation</h2>
                <p>Open a thread from the left, or click a user in chat to start a new DM.</p>
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}

function DmThreadLink({
  currentUserId,
  isActive,
  thread,
}: {
  currentUserId: string | null;
  isActive: boolean;
  thread: DmThreadSummary;
}) {
  const otherMembers = thread.members.filter((member) => member.id !== currentUserId);
  const label = otherMembers.map(getMemberDisplayName).join(", ") || "Direct Message";
  const avatar = otherMembers[0]?.avatar_url || DEFAULT_AVATAR_URL;

  return (
    <a
      className={`dm-thread-link ${isActive ? "dm-thread-link--active" : ""}`}
      href={getDmPath(`/dms/${thread.id}`)}
    >
      <img src={avatar} alt="" />
      <span>
        <strong>{label}</strong>
        <small>
          {thread.latestMessage
            ? thread.latestMessage.content
            : `Started ${formatTimestamp(thread.createdAt)}`}
        </small>
      </span>
    </a>
  );
}

function DmMessageBubble({
  isOwnMessage,
  message,
}: {
  isOwnMessage: boolean;
  message: DmMessage;
}) {
  return (
    <article className={`dm-message ${isOwnMessage ? "dm-message--own" : ""}`}>
      <img src={message.sender?.avatar_url || DEFAULT_AVATAR_URL} alt="" />
      <div>
        <header>
          <strong>{isOwnMessage ? "You" : getMemberDisplayName(message.sender)}</strong>
          <time>{formatTimestamp(message.createdAt)}</time>
        </header>
        <p>{message.content}</p>
      </div>
    </article>
  );
}

function DmBackground() {
  return (
    <div className="app-background" aria-hidden="true">
      <div className="sky" />
      <div className="clouds">
        <div className="cloud cloud-1" />
        <div className="cloud cloud-2" />
        <div className="cloud cloud-3" />
      </div>
      <div className="ground" />
    </div>
  );
}

function DmGlyph() {
  return (
    <svg className="xp-title-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="4" width="12" height="9" rx="2" fill="#6ebe44" stroke="#3d8e22" />
      <path d="M3.5 6.2 8 9.2l4.5-3" stroke="#1a2a44" strokeLinecap="round" />
    </svg>
  );
}
