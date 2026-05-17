"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { playSfx, useErrorSfx } from "@/lib/client/sfx";
import { createClient } from "@/utils/supabase/client";
import type { Tables, TablesInsert } from "@/utils/database.types";

type Page = Tables<"pages">;
type Chat = Tables<"chat">;
type Room = Tables<"rooms">;

type HomeChatModuleProps = {
  user: User;
};

const HOME_CHAT_URL = "peerpod://home";

export function HomeChatModule({ user }: HomeChatModuleProps) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [posts, setPosts] = useState<Chat[]>([]);
  const [room, setRoom] = useState<Room | null>(null);
  const [sentPostIds, setSentPostIds] = useState<Set<string>>(() => new Set());
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const seenPostIdsRef = useRef<Set<string> | null>(null);
  useErrorSfx(error);

  useEffect(() => {
    let isActive = true;

    void (async () => {
      try {
        const nextRoom = await homeChatAdapter.ensureRoom();
        const nextPosts = await homeChatAdapter.listPosts(nextRoom.page_id);
        if (isActive) {
          setRoom(nextRoom);
          setPosts(nextPosts);
          setError(null);
        }
      } catch (loadError) {
        if (isActive) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load chat.",
          );
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!room || isExtensionRuntime()) {
      return;
    }

    const unsubscribe = homeChatAdapter.subscribeToPosts(room.page_id, (post) => {
      setPosts((current) => mergePosts(current, [post]));
    });

    return unsubscribe;
  }, [room]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [posts.length]);

  useEffect(() => {
    const knownIds = seenPostIdsRef.current;
    const nextIds = new Set(posts.map((post) => post.chat_id));

    if (!knownIds) {
      seenPostIdsRef.current = nextIds;
      return;
    }

    const hasRemoteIncomingMessage = posts.some(
      (post) => !knownIds.has(post.chat_id) && !sentPostIds.has(post.chat_id),
    );

    seenPostIdsRef.current = nextIds;

    if (hasRemoteIncomingMessage) {
      playSfx("im");
    }
  }, [posts, sentPostIds]);

  const handleSend = async () => {
    const content = draft.trim();
    if (!content || !room || isSending) {
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      const post = await homeChatAdapter.sendPost(room.page_id, content);
      setSentPostIds((current) => new Set([...current, post.chat_id]));
      setPosts((current) => mergePosts(current, [post]));
      setDraft("");
    } catch (sendError) {
      setError(
        sendError instanceof Error ? sendError.message : "Could not send message.",
      );
    } finally {
      setIsSending(false);
    }
  };

  return (
    <section className="home-chat-module" aria-label="Home chat">
      <div className="chat-main home-chat-module__panel">
        <header className="chat-panel-header">
          <h2># home</h2>
        </header>
        <div className="chat-topic">
          <p>*** You have joined #home</p>
          <p>*** Static shell, live Supabase chat module</p>
        </div>

        {error ? (
          <p className="status-note status-note--error">{error}</p>
        ) : null}

        <div className="chat-transcript home-chat-module__transcript" ref={transcriptRef}>
          {isLoading ? (
            <p className="status-note">Loading chat...</p>
          ) : posts.length > 0 ? (
            posts.map((post) => (
              <ChatMessage
                key={post.chat_id}
                post={post}
                isCurrentUser={
                  post.user_id === user.id || sentPostIds.has(post.chat_id)
                }
              />
            ))
          ) : (
            <p className="status-note">No messages yet.</p>
          )}
        </div>

        <form
          className="chat-composer"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSend();
          }}
        >
          <label className="sr-only" htmlFor="home-chat-message">
            Message
          </label>
          <textarea
            id="home-chat-message"
            aria-label="Message"
            disabled={isLoading || !room}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void handleSend();
              }
            }}
          />
          <button type="submit" disabled={isLoading || !room || isSending}>
            {isSending ? "Sending..." : "Send"}
          </button>
        </form>
      </div>
    </section>
  );
}

function ChatMessage({
  post,
  isCurrentUser,
}: {
  post: Chat;
  isCurrentUser: boolean;
}) {
  const createdAt = new Date(post.created_at);
  const timestamp = Number.isNaN(createdAt.getTime())
    ? "--:--"
    : formatChatTime(createdAt);

  return (
    <article className="chat-message">
      <span className="chat-message__time">[{timestamp}]</span>
      <div className="chat-message__body">
        <p>
          <strong className={`chat-name chat-name--${isCurrentUser ? "blue" : "green"}`}>
            {isCurrentUser ? "You" : "Peer"}:
          </strong>{" "}
          {post.body}
        </p>
      </div>
    </article>
  );
}

function formatChatTime(date: Date) {
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
}

const homeChatAdapter = {
  async ensureRoom() {
    const page = await ensureHomePage();
    const supabase = createClient();
    const { data: existingRoom, error: roomError } = await supabase
      .from("rooms")
      .select("*")
      .eq("page_id", page.id)
      .order("created_at", { ascending: true })
      .limit(1);

    if (roomError) {
      throw roomError;
    }

    if (existingRoom?.[0]) {
      return existingRoom[0];
    }

    const { data: createdRooms, error: createRoomError } = await supabase
      .from("rooms")
      .insert({ page_id: page.id })
      .select("*")
      .limit(1);

    if (createRoomError) {
      throw createRoomError;
    }

    const createdRoom = createdRooms?.[0];
    if (!createdRoom) {
      throw new Error("Could not create the home chat room.");
    }

    return createdRoom;
  },
  async listPosts(roomId: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("chat")
      .select("*")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true });

    if (error) {
      throw error;
    }

    return data ?? [];
  },
  async sendPost(roomId: string, content: string) {
    const supabase = createClient();
    const payload: TablesInsert<"chat"> = {
      room_id: roomId,
      body: content,
      user_id: null,
    };
    const { data, error } = await supabase
      .from("chat")
      .insert(payload)
      .select("*")
      .limit(1);

    if (error) {
      throw error;
    }

    const createdPost = data?.[0];
    if (!createdPost) {
      throw new Error("Could not send message.");
    }

    return createdPost;
  },
  subscribeToPosts(roomId: string, onPost: (post: Chat) => void) {
    const supabase = createClient();
    const channel = supabase
      .channel(`home-chat:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => onPost(payload.new as Chat),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  },
};

async function ensureHomePage(): Promise<Page> {
  const supabase = createClient();
  const { data: existingPages, error: pageError } = await supabase
    .from("pages")
    .select("*")
    .eq("normalized_url", HOME_CHAT_URL)
    .limit(1);

  if (pageError) {
    throw pageError;
  }

  const existingPage = existingPages?.[0];
  if (existingPage) {
    return existingPage;
  }

  const { data: createdPages, error: createPageError } = await supabase
    .from("pages")
    .insert({ normalized_url: HOME_CHAT_URL })
    .select("*")
    .limit(1);

  if (createPageError) {
    const { data: racedPages, error: racedPageError } = await supabase
      .from("pages")
      .select("*")
      .eq("normalized_url", HOME_CHAT_URL)
      .limit(1);

    if (racedPageError || !racedPages?.[0]) {
      throw createPageError;
    }

    return racedPages[0];
  }

  const createdPage = createdPages?.[0];
  if (!createdPage) {
    throw new Error("Could not create the home page record.");
  }

  return createdPage;
}

function isExtensionRuntime() {
  const globalWithExtensionApis = globalThis as typeof globalThis & {
    browser?: { runtime?: { id?: string } };
    chrome?: { runtime?: { id?: string } };
  };
  const runtime =
    globalWithExtensionApis.browser ?? globalWithExtensionApis.chrome;

  return Boolean(runtime?.runtime?.id);
}

function mergePosts(existing: Chat[], incoming: Chat[]) {
  const byId = new Map(existing.map((post) => [post.chat_id, post]));
  for (const post of incoming) {
    byId.set(post.chat_id, post);
  }
  return [...byId.values()].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
}
