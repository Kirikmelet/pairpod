"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/client";
import type { Tables, TablesInsert } from "@/utils/database.types";

type Page = Tables<"pages">;
type Post = Tables<"posts">;
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
  const [posts, setPosts] = useState<Post[]>([]);
  const [room, setRoom] = useState<Room | null>(null);
  const [sentPostIds, setSentPostIds] = useState<Set<string>>(() => new Set());
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let isActive = true;

    void (async () => {
      try {
        const nextRoom = await homeChatAdapter.ensureRoom();
        const nextPosts = await homeChatAdapter.listPosts(nextRoom.id);
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
    if (!room) {
      return;
    }

    const unsubscribe = homeChatAdapter.subscribeToPosts(room.id, (post) => {
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

  const handleSend = async () => {
    const content = draft.trim();
    if (!content || !room || isSending) {
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      const post = await homeChatAdapter.sendPost(room.id, content);
      setSentPostIds((current) => new Set([...current, post.id]));
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
                key={post.id}
                post={post}
                isCurrentUser={
                  post.user_id === user.id || sentPostIds.has(post.id)
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
  post: Post;
  isCurrentUser: boolean;
}) {
  const createdAt = new Date(post.created_at);
  const timestamp = Number.isNaN(createdAt.getTime())
    ? "--:--"
    : createdAt.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

  return (
    <article className="chat-message">
      <span className="chat-message__time">[{timestamp}]</span>
      <div className="chat-message__body">
        <p>
          <strong className={`chat-name chat-name--${isCurrentUser ? "blue" : "green"}`}>
            {isCurrentUser ? "You" : "Peer"}:
          </strong>{" "}
          {post.content}
        </p>
      </div>
    </article>
  );
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
      .limit(1)
      .maybeSingle();

    if (roomError) {
      throw roomError;
    }

    if (existingRoom) {
      return existingRoom;
    }

    const { data: createdRoom, error: createRoomError } = await supabase
      .from("rooms")
      .insert({ page_id: page.id })
      .select("*")
      .single();

    if (createRoomError) {
      throw createRoomError;
    }

    return createdRoom;
  },
  async listPosts(roomId: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("posts")
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
    const payload: TablesInsert<"posts"> = {
      room_id: roomId,
      content,
      type: "chat",
      user_id: null,
    };
    const { data, error } = await supabase
      .from("posts")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return data;
  },
  subscribeToPosts(roomId: string, onPost: (post: Post) => void) {
    const supabase = createClient();
    const channel = supabase
      .channel(`home-chat:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "posts",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => onPost(payload.new as Post),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  },
};

async function ensureHomePage(): Promise<Page> {
  const supabase = createClient();
  const { data: existingPage, error: pageError } = await supabase
    .from("pages")
    .select("*")
    .eq("normalized_url", HOME_CHAT_URL)
    .maybeSingle();

  if (pageError) {
    throw pageError;
  }

  if (existingPage) {
    return existingPage;
  }

  const { data: createdPage, error: createPageError } = await supabase
    .from("pages")
    .insert({ normalized_url: HOME_CHAT_URL })
    .select("*")
    .single();

  if (createPageError) {
    const { data: racedPage, error: racedPageError } = await supabase
      .from("pages")
      .select("*")
      .eq("normalized_url", HOME_CHAT_URL)
      .single();

    if (racedPageError) {
      throw createPageError;
    }

    return racedPage;
  }

  return createdPage;
}

function mergePosts(existing: Post[], incoming: Post[]) {
  const byId = new Map(existing.map((post) => [post.id, post]));
  for (const post of incoming) {
    byId.set(post.id, post);
  }
  return [...byId.values()].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
}
