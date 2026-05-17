"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import {
  formatTimestamp,
  getDisplayName,
  getRoomDisplayName,
  postJson,
  splitContentLines,
  type ChatRecord,
  type UserProfileRecord,
  useCurrentUserProfile,
  usePageBundle,
} from "@/lib/client/page-api";
import { createHumanFakeChatDirect } from "@/lib/client/fake-chat";
import { DmNotificationBadge } from "@/components/dm-notification-badge";
import { getDmPath, startDirectMessage } from "@/lib/client/dms";
import { playSfx, useErrorSfx } from "@/lib/client/sfx";
import { getUserProfilePath } from "@/lib/client/users";
import { createClient } from "@/utils/supabase/client";

type TextFormat = "bold" | "italic" | "underline";
type AiChatContextMessage = {
  author: string;
  body: string;
  isAi: boolean;
};

type ChatPageProps = {
  currentUsername?: string;
};

type Member = {
  id: string | null;
  avatarUrl: string | null;
  name: string;
  status: "Online" | "Away";
};

export function ChatPage({ currentUsername }: ChatPageProps) {
  const {
    bundle,
    usersById,
    loading,
    error,
    refresh,
    buildRoomHref,
    buildScopedHref,
    domainUrl,
    roomScope,
  } = usePageBundle();
  const { profile } = useCurrentUserProfile();
  const domainName = getRoomDisplayName(domainUrl);
  const [message, setMessage] = useState("");
  const [hasHydrated, setHasHydrated] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGeneratingPeers, setIsGeneratingPeers] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const composerSelectionRef = useRef({ start: 0, end: 0 });
  const seenChatPostIdsRef = useRef<Set<string> | null>(null);
  const sentChatPostIdsRef = useRef<Set<string>>(new Set());
  const autoAiSeedRef = useRef<string | null>(null);
  const { profile: currentProfile } = useCurrentUserProfile();
  useErrorSfx(error);
  useErrorSfx(submitError);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  const chatMessages = useMemo(
    () => bundle?.chats ?? [],
    [bundle?.chats],
  );

  const discussionPosts = useMemo(
    () => (bundle?.posts ?? []).slice(-3).reverse(),
    [bundle?.posts],
  );

  const authors = useMemo<Member[]>(() => {
    const values = new Map<string, Member>();

    if (currentUsername?.trim()) {
      values.set(currentUsername, {
        id: null,
        avatarUrl: null,
        name: currentUsername,
        status: "Online",
      });
    }

    for (const chat of bundle?.chats ?? []) {
      const authorProfile = chat.user_id ? usersById[chat.user_id] : null;
      const fallbackName = getDisplayName(chat.user_id, usersById);
      const name =
        currentUsername?.trim() && fallbackName === "Anonymous"
          ? currentUsername
          : fallbackName;

      if (!values.has(name)) {
        values.set(name, {
          id: chat.user_id,
          avatarUrl: authorProfile?.avatar_url ?? null,
          name,
          status: "Online",
        });
      }
    }

    for (const post of bundle?.posts ?? []) {
      const authorProfile = post.user_id ? usersById[post.user_id] : null;
      const fallbackName = getDisplayName(post.user_id, usersById);
      const name =
        currentUsername?.trim() && fallbackName === "Anonymous"
          ? currentUsername
          : fallbackName;

      if (!values.has(name)) {
        values.set(name, {
          id: post.user_id,
          avatarUrl: authorProfile?.avatar_url ?? null,
          name,
          status: "Away",
        });
      }
    }

    for (const comment of bundle?.comments ?? []) {
      const authorProfile = comment.user_id ? usersById[comment.user_id] : null;
      const fallbackName = getDisplayName(comment.user_id, usersById);
      const name =
        currentUsername?.trim() && fallbackName === "Anonymous"
          ? currentUsername
          : fallbackName;

      if (!values.has(name)) {
        values.set(name, {
          id: comment.user_id,
          avatarUrl: authorProfile?.avatar_url ?? null,
          name,
          status: "Away",
        });
      }
    }

    return [...values.values()].slice(0, 8);
  }, [bundle?.chats, bundle?.comments, bundle?.posts, currentUsername, usersById]);

  const recentCommentActivity = useMemo(
    () => (bundle?.comments ?? []).slice(-4).reverse(),
    [bundle?.comments],
  );
  const aiControlsDisabled = hasHydrated && (!bundle || isGeneratingPeers);

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (!transcript) {
      return;
    }

    transcript.scrollTo({
      top: transcript.scrollHeight,
      behavior: "smooth",
    });
  }, [chatMessages.length]);

  useEffect(() => {
    const knownIds = seenChatPostIdsRef.current;
    const nextIds = new Set(chatMessages.map((chat) => chat.chat_id));

    if (!knownIds) {
      seenChatPostIdsRef.current = nextIds;
      return;
    }

    const hasRemoteIncomingMessage = chatMessages.some(
      (chat) =>
        !knownIds.has(chat.chat_id) &&
        !sentChatPostIdsRef.current.has(chat.chat_id) &&
        (!currentProfile?.id || chat.user_id !== currentProfile.id),
    );

    seenChatPostIdsRef.current = nextIds;

    if (hasRemoteIncomingMessage) {
      playSfx("im");
    }
  }, [chatMessages, currentProfile?.id]);

  useEffect(() => {
    if (!bundle || loading || isGeneratingPeers) {
      return;
    }

    const aiMessageCount = chatMessages.filter((chat) =>
      chat.user_id ? isAiFakeUser(usersById[chat.user_id]) : false,
    ).length;
    if (aiMessageCount >= AUTO_AI_MIN_MESSAGES) {
      return;
    }

    const seedKey = `pairpod.autoAiChat.v3.${roomScope}.${bundle.page.id}`;
    if (autoAiSeedRef.current === seedKey || wasAutoAiSeededRecently(seedKey)) {
      return;
    }

    autoAiSeedRef.current = seedKey;
    void handleGeneratePeers({ seedKey, silent: true });
  }, [bundle, chatMessages, isGeneratingPeers, loading, roomScope, usersById]);

  useEffect(() => {
    if (!bundle || loading) {
      return;
    }

    const pulseKey = `pairpod.autoAiPulse.v1.${roomScope}.${bundle.page.id}`;
    const pulse = window.setTimeout(() => {
      if (document.visibilityState === "hidden" || isGeneratingPeers) {
        return;
      }

      if (wasAutoAiPulseRecently(pulseKey)) {
        return;
      }

      void handleGeneratePeers({
        messageCount: 1,
        seedKey: pulseKey,
        silent: true,
        userCount: 1,
      });
    }, AUTO_AI_PULSE_DELAY_MS);

    return () => {
      window.clearTimeout(pulse);
    };
  }, [bundle?.page.id, chatMessages.length, isGeneratingPeers, loading, roomScope]);

  const rememberComposerSelection = () => {
    const textarea = composerRef.current;
    if (!textarea) {
      return;
    }

    composerSelectionRef.current = {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
    };
  };

  const applyTextFormat = (format: TextFormat) => {
    const textarea = composerRef.current;
    if (!textarea) {
      return;
    }

    const { startMarker, endMarker, placeholder } = FORMAT_MARKERS[format];
    const textareaValue = textarea.value;
    const activeSelection = document.activeElement === textarea
      ? { start: textarea.selectionStart, end: textarea.selectionEnd }
      : composerSelectionRef.current;
    const selectionStart = clampNumber(activeSelection.start, 0, textareaValue.length);
    const selectionEnd = clampNumber(activeSelection.end, selectionStart, textareaValue.length);
    const selectedText = textareaValue.slice(selectionStart, selectionEnd);
    const insertedText = selectedText || placeholder;
    const nextText =
      textareaValue.slice(0, selectionStart) +
      startMarker +
      insertedText +
      endMarker +
      textareaValue.slice(selectionEnd);

    setMessage(nextText);
    window.setTimeout(() => {
      textarea.focus();
      const cursorStart = selectionStart + startMarker.length;
      const cursorEnd = cursorStart + insertedText.length;
      textarea.setSelectionRange(cursorStart, cursorEnd);
      composerSelectionRef.current = { start: cursorStart, end: cursorEnd };
    }, 0);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const submittedMessage = message.trim();
    if (!bundle || !submittedMessage) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const createdChat = await postJson("/api/chat", {
        roomId: bundle.room.id,
        pageId: bundle.page.id,
        message: submittedMessage,
      });
      if (isChatRecordWithId(createdChat)) {
        sentChatPostIdsRef.current.add(createdChat.chat_id);
      }
      setMessage("");
      await refresh({ silent: true });
      void handleGeneratePeers({
        latestMessage: submittedMessage,
        messageCount: 1,
        recentMessages: buildAiChatContext(chatMessages, usersById, {
          author: "You",
          body: submittedMessage,
          isAi: false,
        }),
        silent: true,
        userCount: 1,
      });
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

  const handleGeneratePeers = async (options?: {
    latestMessage?: string;
    messageCount?: number;
    recentMessages?: AiChatContextMessage[];
    seedKey?: string;
    silent?: boolean;
    userCount?: number;
  }) => {
    if (!bundle || isGeneratingPeers) {
      return;
    }

    setIsGeneratingPeers(true);
    if (!options?.silent) {
      setSubmitError(null);
    }

    try {
      const payload = {
        scope: roomScope,
        domainUrl,
        latestMessage: options?.latestMessage,
        recentMessages: options?.recentMessages ?? buildAiChatContext(chatMessages, usersById),
        reservedNames: buildReservedAiNames(usersById),
        topic: getChatTitle(bundle),
        userCount: options?.userCount ?? 3,
        messageCount: options?.messageCount ?? 5,
      };

      if (isExtensionRuntime()) {
        const didUseServer = await tryCreateServerBackedFakeChat(payload);
        if (!didUseServer) {
          await createHumanFakeChatDirect({
            pageId: bundle.page.id,
            scope: roomScope,
            title: getChatTitle(bundle),
            latestMessage: payload.latestMessage,
            recentMessages: payload.recentMessages,
            reservedNames: payload.reservedNames,
            userCount: payload.userCount,
            messageCount: payload.messageCount,
          });
        }
      } else {
        await postJson("/api/ai/fake-chat", payload);
      }

      await refresh({ silent: true });
      if (options?.seedKey) {
        markAutoAiSeeded(options.seedKey);
      }
    } catch (generateError) {
      if (options?.seedKey && autoAiSeedRef.current === options.seedKey) {
        autoAiSeedRef.current = null;
      }

      if (!options?.silent) {
        setSubmitError(
          generateError instanceof Error
            ? generateError.message
            : "Failed to create AI peers",
        );
      } else {
        console.warn("Automatic AI chat seed failed.", generateError);
      }
    } finally {
      setIsGeneratingPeers(false);
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
            <a className="nav-with-badge" href={getDmPath("/dms")}>
              DMs
              <DmNotificationBadge />
            </a>
            <a href={buildScopedHref("/peers")}>3D Peers</a>
          </nav>

          <div className="chat-layout">
            <aside className="chat-members" aria-label="Room members">
              <PanelHeader title={`Members (${authors.length || 1})`} />
              <div className="chat-members__list">
                {authors.length > 0 ? (
                  authors.map((member, index) => (
                    <article className="chat-member" key={`${member.id ?? "anon"}-${member.name}`}>
                      <span
                        className={`chat-avatar chat-avatar--${(index % 8) + 1}`}
                      >
                        {member.avatarUrl ? (
                          <img src={member.avatarUrl} alt="" />
                        ) : (
                          member.name.charAt(0).toUpperCase()
                        )}
                      </span>
                      <div>
                        <DmUserMenu
                          currentUserId={profile?.id ?? null}
                          userId={member.id}
                          userName={member.name}
                        />
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
                <button
                  type="button"
                  className="chat-side-button"
                  disabled={aiControlsDisabled}
                  onClick={() => void handleGeneratePeers()}
                >
                  <span className="chat-side-icon" aria-hidden="true">
                    <SparkIcon />
                  </span>
                  {isGeneratingPeers ? "Creating..." : "AI peers"}
                </button>
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
                    : `${chatMessages.length} messages and ${
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
                ) : chatMessages.length > 0 ? (
                  chatMessages.map((chat, index) => {
                    const lines = splitContentLines(chat.body ?? "");

                    return (
                      <article className="chat-message" key={chat.chat_id}>
                        <span className="chat-message__time">
                          [{formatTimestamp(chat.created_at)}]
                        </span>
                        <div className="chat-message__body">
                          <p>
                            <strong
                              className={`chat-name chat-name--${pickChatTone(chat.user_id, usersById, index)}`}
                            >
                              <DmInlineUser
                                userId={chat.user_id}
                                userName={getDisplayName(chat.user_id, usersById)}
                              />
                              :
                            </strong>{" "}
                            {renderRichTextLine(lines[0] ?? chat.body ?? "")}
                          </p>
                          {lines.slice(1).map((line) => (
                            <p key={`${chat.chat_id}-${line}`}>
                              {renderRichTextLine(line)}
                            </p>
                          ))}
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
                <button
                  type="button"
                  aria-label="Bold"
                  title="Bold"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    applyTextFormat("bold");
                  }}
                >
                  B
                </button>
                <button
                  type="button"
                  aria-label="Italic"
                  title="Italic"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    applyTextFormat("italic");
                  }}
                >
                  I
                </button>
                <button
                  type="button"
                  aria-label="Underline"
                  title="Underline"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    applyTextFormat("underline");
                  }}
                >
                  U
                </button>
              </div>

              <form
                className="chat-composer"
                onSubmit={(event) => void handleSubmit(event)}
              >
                <label className="sr-only" htmlFor="chat-message">
                  Message
                </label>
                <textarea
                  ref={composerRef}
                  id="chat-message"
                  className="chat-composer__input"
                  aria-label="Message"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  onSelect={rememberComposerSelection}
                  onClick={rememberComposerSelection}
                  onKeyUp={rememberComposerSelection}
                  placeholder="Send a message to the room..."
                  onKeyDown={(event) => {
                    const format = getKeyboardFormat(event);
                    if (format) {
                      event.preventDefault();
                      applyTextFormat(format);
                      return;
                    }

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
                    {chatMessages.length} chat messages{" "}
                    <span className="live-dot" /> {discussionPosts.length}{" "}
                    active threads
                  </p>
                </div>
              </section>
              <section className="chat-rail-panel">
                <PanelHeader title="Peer Tools" />
                <div className="chat-rail-panel__body">
                  <button
                    type="button"
                    className="chat-tool-button"
                    disabled={aiControlsDisabled}
                    onClick={() => void handleGeneratePeers()}
                  >
                    {isGeneratingPeers ? "Creating AI peers..." : "Create AI peer chat"}
                  </button>
                  <a href={buildScopedHref("/peers")}>Open 3D peer map</a>
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

async function tryCreateServerBackedFakeChat(payload: Record<string, unknown>) {
  const endpoint = getConfiguredSiteEndpoint("/api/ai/fake-chat");
  if (!endpoint) {
    return false;
  }

  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return false;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    console.warn("Server-backed extension AI chat failed.", await response.text());
    return false;
  }

  const result = (await response.json()) as { ok?: boolean };
  return result.ok === true;
}

function getConfiguredSiteEndpoint(pathname: string) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!siteUrl) {
    return null;
  }

  return new URL(pathname, siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`).toString();
}

function isExtensionRuntime() {
  const globalWithExtensionApis = globalThis as typeof globalThis & {
    browser?: { runtime?: { id?: string } };
    chrome?: { runtime?: { id?: string } };
  };
  const runtime = globalWithExtensionApis.browser ?? globalWithExtensionApis.chrome;

  return Boolean(runtime?.runtime?.id);
}

function isChatRecordWithId(value: unknown): value is Pick<ChatRecord, "chat_id"> {
  return (
    value !== null &&
    typeof value === "object" &&
    "chat_id" in value &&
    typeof value.chat_id === "string"
  );
}

const AUTO_AI_SEED_COOLDOWN_MS = 1000 * 60 * 2;
const AUTO_AI_PULSE_COOLDOWN_MS = 1000 * 22;
const AUTO_AI_PULSE_DELAY_MS = 1000 * 8;
const AUTO_AI_MIN_MESSAGES = 3;
const FORMAT_MARKERS = {
  bold: { startMarker: "**", endMarker: "**", placeholder: "bold text" },
  italic: { startMarker: "*", endMarker: "*", placeholder: "italic text" },
  underline: { startMarker: "__", endMarker: "__", placeholder: "underlined text" },
} satisfies Record<TextFormat, { startMarker: string; endMarker: string; placeholder: string }>;

function wasAutoAiSeededRecently(seedKey: string) {
  return wasLocalActionRecent(seedKey, AUTO_AI_SEED_COOLDOWN_MS);
}

function wasAutoAiPulseRecently(seedKey: string) {
  return wasLocalActionRecent(seedKey, AUTO_AI_PULSE_COOLDOWN_MS);
}

function wasLocalActionRecent(seedKey: string, ttlMs: number) {
  if (typeof window === "undefined") {
    return true;
  }

  const lastSeededAt = Number(window.localStorage.getItem(seedKey) ?? 0);
  return Number.isFinite(lastSeededAt) && Date.now() - lastSeededAt < ttlMs;
}

function markAutoAiSeeded(seedKey: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(seedKey, String(Date.now()));
}

function isAiFakeUser(user: UserProfileRecord | null | undefined) {
  const configurations = user?.configurations;
  return (
    configurations !== null &&
    typeof configurations === "object" &&
    !Array.isArray(configurations) &&
    configurations.kind === "ai_fake_user"
  );
}

function buildAiChatContext(
  chats: ChatRecord[],
  usersById: Record<string, UserProfileRecord>,
  extra?: AiChatContextMessage,
) {
  const recent = chats.slice(-8).map((chat) => {
    const user = chat.user_id ? usersById[chat.user_id] : null;
    const body = chat.body?.trim() ?? "";

    return {
      author: getDisplayName(chat.user_id, usersById),
      body,
      isAi: isAiFakeUser(user) || looksLikePrefixedAiFallback(body),
    };
  }).filter((message) => message.body);

  if (extra?.body.trim()) {
    recent.push({
      ...extra,
      body: extra.body.trim(),
    });
  }

  return recent.slice(-9);
}

function buildReservedAiNames(usersById: Record<string, UserProfileRecord>) {
  const reserved = new Set<string>();

  for (const user of Object.values(usersById)) {
    addReservedName(reserved, user.display_name);
    addReservedName(reserved, user.username);
    addReservedName(reserved, getDisplayName(user.id, { [user.id]: user }));
  }

  return [...reserved].slice(0, 80);
}

function addReservedName(reserved: Set<string>, value: string | null | undefined) {
  const normalized = normalizeReservedName(value);
  if (normalized) {
    reserved.add(normalized);
  }
}

function normalizeReservedName(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "") ?? "";
}

function looksLikePrefixedAiFallback(body: string) {
  return /^[A-Za-z0-9_.-]{3,28}:\s+/.test(body);
}

function getKeyboardFormat(event: KeyboardEvent<HTMLTextAreaElement>): TextFormat | null {
  if (!event.metaKey && !event.ctrlKey) {
    return null;
  }

  const key = event.key.toLowerCase();
  if (key === "b") {
    return "bold";
  }
  if (key === "i") {
    return "italic";
  }
  if (key === "u") {
    return "underline";
  }

  return null;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function renderRichTextLine(line: string) {
  const segments: ReactNode[] = [];
  const pattern = /(\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|\*([^*\n]+?)\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(line)) !== null) {
    if (match.index > lastIndex) {
      segments.push(
        <span key={`${lastIndex}-plain`}>
          {line.slice(lastIndex, match.index)}
        </span>,
      );
    }

    if (match[2]) {
      segments.push(<strong key={`${match.index}-bold`}>{match[2]}</strong>);
    } else if (match[3]) {
      segments.push(<u key={`${match.index}-underline`}>{match[3]}</u>);
    } else if (match[4]) {
      segments.push(<em key={`${match.index}-italic`}>{match[4]}</em>);
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < line.length) {
    segments.push(
      <span key={`${lastIndex}-plain-end`}>
        {line.slice(lastIndex)}
      </span>,
    );
  }

  return segments.length > 0 ? segments : line;
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

function pickChatTone(
  userId: string | null,
  usersById: Record<string, UserProfileRecord>,
  index: number,
) {
  if (userId && isAiFakeUser(usersById[userId])) {
    return pickTone(index + 2);
  }

  return pickTone(index);
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

function DmUserMenu({
  currentUserId,
  userId,
  userName,
}: {
  currentUserId: string | null;
  userId: string | null;
  userName: string;
}) {
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canStartDm = Boolean(userId && userId !== currentUserId);
  const profileHref = getUserProfilePath(userId);

  const handleStartDm = async () => {
    if (!userId || isStarting) {
      return;
    }

    setIsStarting(true);
    setError(null);

    try {
      const thread = await startDirectMessage(userId);
      window.location.href = getDmPath(`/dms/${thread.id}`);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Could not start DM.");
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="dm-user-menu">
      {profileHref ? (
        <a className="dm-user-menu__trigger" href={profileHref}>
          {userName}
        </a>
      ) : (
        <strong>{userName}</strong>
      )}
      <button type="button" disabled={!canStartDm || isStarting} onClick={handleStartDm}>
        {isStarting ? "Opening..." : "DM"}
      </button>
      {error ? (
        <div className="dm-user-menu__popup">
          <p>{error}</p>
        </div>
      ) : null}
    </div>
  );
}

function DmInlineUser({
  userId,
  userName,
}: {
  userId: string | null;
  userName: string;
}) {
  const profileHref = getUserProfilePath(userId);

  if (!profileHref) {
    return <span>{userName}</span>;
  }

  return <a href={profileHref}>{userName}</a>;
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

function SparkIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" width="18" height="18">
      <path
        d="M10 2l1.5 5.2L17 9l-5.5 1.8L10 16l-1.5-5.2L3 9l5.5-1.8L10 2z"
        fill="currentColor"
      />
    </svg>
  );
}
