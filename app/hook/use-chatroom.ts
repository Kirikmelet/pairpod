"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import type { Tables, TablesInsert } from "@/utils/database.types";

export type Room = Tables<"rooms">;

type UseChatroomResult = {
  room: Room | null;
  loading: boolean;
  error: string | null;
  ensureRoom: () => Promise<Room>;
  refresh: () => Promise<Room | null>;
};

export function useChatroom(pageId: string | null): UseChatroomResult {
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(Boolean(pageId));
  const [error, setError] = useState<string | null>(null);

  const loadRoom = useCallback(async () => {
    if (!pageId) {
      return null;
    }

    const supabase = createClient();
    const { data, error: loadError } = await supabase
      .from("rooms")
      .select("*")
      .eq("page_id", pageId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (loadError) {
      throw loadError;
    }

    return data;
  }, [pageId]);

  const refresh = useCallback(async () => {
    const data = await loadRoom();
    setRoom(data);
    return data;
  }, [loadRoom]);

  const ensureRoom = useCallback(async () => {
    if (!pageId) {
      throw new Error("pageId is required");
    }

    const existing = await loadRoom();
    if (existing) {
      setRoom(existing);
      return existing;
    }

    const supabase = createClient();
    const payload: TablesInsert<"rooms"> = { page_id: pageId };
    const { data, error: createError } = await supabase
      .from("rooms")
      .insert(payload)
      .select()
      .single();

    if (createError) {
      throw createError;
    }

    setRoom(data);
    return data;
  }, [loadRoom, pageId]);

  useEffect(() => {
    if (!pageId) {
      setRoom(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await loadRoom();
        if (!cancelled) {
          setRoom(data);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error ? loadError.message : "Failed to load room",
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
  }, [loadRoom, pageId]);

  return { room, loading, error, ensureRoom, refresh };
}
