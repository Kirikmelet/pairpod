"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import type { Tables, TablesInsert } from "@/utils/database.types";

export type Post = Tables<"posts">;

type UsePostsOptions = {
  /** Fallback polling interval when realtime is unavailable. */
  pollIntervalMs?: number;
};

type SendPostInput = Pick<TablesInsert<"posts">, "content" | "user_id" | "type" | "header" | "section_id">;

type UsePostsResult = {
  posts: Post[];
  loading: boolean;
  error: string | null;
  sendPost: (input: SendPostInput) => Promise<Post>;
  refresh: () => Promise<void>;
  fetchNewPosts: () => Promise<Post[]>;
};

function sortPosts(posts: Post[]) {
  return [...posts].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

function mergePosts(existing: Post[], incoming: Post[]) {
  const byId = new Map(existing.map((post) => [post.id, post]));
  for (const post of incoming) {
    byId.set(post.id, post);
  }
  return sortPosts([...byId.values()]);
}

export function usePosts(
  roomId: string | null,
  options?: UsePostsOptions,
): UsePostsResult {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(Boolean(roomId));
  const [error, setError] = useState<string | null>(null);
  const latestCreatedAtRef = useRef<string | null>(null);

  const syncLatestTimestamp = useCallback((nextPosts: Post[]) => {
    latestCreatedAtRef.current = nextPosts.at(-1)?.created_at ?? null;
  }, []);

  const queryPosts = useCallback(
    async (since?: string | null) => {
      if (!roomId) {
        return [];
      }

      const supabase = createClient();
      let query = supabase
        .from("posts")
        .select("*")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true });

      if (since) {
        query = query.gt("created_at", since);
      }

      const { data, error: queryError } = await query;
      if (queryError) {
        throw queryError;
      }

      return data ?? [];
    },
    [roomId],
  );

  const fetchNewPosts = useCallback(async () => {
    const since = latestCreatedAtRef.current;
    if (!since) {
      const allPosts = await queryPosts();
      setPosts(allPosts);
      syncLatestTimestamp(allPosts);
      return allPosts;
    }

    const newPosts = await queryPosts(since);
    if (newPosts.length > 0) {
      setPosts((current) => {
        const merged = mergePosts(current, newPosts);
        syncLatestTimestamp(merged);
        return merged;
      });
    }

    return newPosts;
  }, [queryPosts, syncLatestTimestamp]);

  const refresh = useCallback(async () => {
    const data = await queryPosts();
    setPosts(data);
    syncLatestTimestamp(data);
  }, [queryPosts, syncLatestTimestamp]);

  const sendPost = useCallback(
    async (input: SendPostInput) => {
      if (!roomId) {
        throw new Error("roomId is required");
      }

      const supabase = createClient();
      const payload: TablesInsert<"posts"> = {
        room_id: roomId,
        content: input.content,
        type: input.type ?? "message",
        user_id: input.user_id ?? null,
        header: input.header ?? null,
        section_id: input.section_id ?? null,
      };
      const { data, error: insertError } = await supabase
        .from("posts")
        .insert(payload)
        .select()
        .single();

      if (insertError) {
        throw insertError;
      }

      setPosts((current) => {
        const merged = mergePosts(current, [data]);
        syncLatestTimestamp(merged);
        return merged;
      });

      return data;
    },
    [roomId, syncLatestTimestamp],
  );

  useEffect(() => {
    if (!roomId) {
      setPosts([]);
      setLoading(false);
      latestCreatedAtRef.current = null;
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await queryPosts();
        if (!cancelled) {
          setPosts(data);
          syncLatestTimestamp(data);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error ? loadError.message : "Failed to load posts",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [queryPosts, roomId, syncLatestTimestamp]);

  useEffect(() => {
    if (!roomId) {
      return;
    }

    const supabase = createClient();
    const channel = supabase
      .channel(`room-posts:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "posts",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const post = payload.new as Post;
          setPosts((current) => {
            const merged = mergePosts(current, [post]);
            syncLatestTimestamp(merged);
            return merged;
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [roomId, syncLatestTimestamp]);

  useEffect(() => {
    if (!roomId || !options?.pollIntervalMs) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void fetchNewPosts().catch(() => undefined);
    }, options.pollIntervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [fetchNewPosts, options?.pollIntervalMs, roomId]);

  return { posts, loading, error, sendPost, refresh, fetchNewPosts };
}
