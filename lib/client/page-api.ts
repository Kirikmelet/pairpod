"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import type { Json, TablesInsert } from "@/utils/database.types";

const FALLBACK_URL = "https://example.com";
const DEFAULT_PORTS = new Map([
  ["http:", "80"],
  ["https:", "443"],
]);

export type PageRecord = {
  id: string;
  normalized_url: string;
  created_at: string;
};

export type RoomRecord = {
  id: string;
  page_id: string;
  max_users: number;
  configurations: Json;
  created_at: string;
};

export type PostRecord = {
  id: string;
  room_id: string;
  type: string;
  section_id: string | null;
  header: string | null;
  content: string;
  likes: number;
  user_id: string | null;
  created_at: string;
};

export type CommentRecord = {
  id: string;
  post_id: string | null;
  reply_id: string | null;
  content: string;
  likes: number;
  user_id: string | null;
  created_at: string;
};

export type PageBundle = {
  page: PageRecord;
  room: RoomRecord;
  posts: PostRecord[];
  comments: CommentRecord[];
};

type ApiSuccess<T> = {
  ok: true;
  data: T;
};

type ApiError = {
  ok: false;
  error: string;
};

type ApiResponse<T> = ApiSuccess<T> | ApiError;

type UsePageBundleResult = {
  bundle: PageBundle | null;
  commentsByPost: Record<string, CommentRecord[]>;
  currentUrl: string;
  currentTitle: string;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<PageBundle | null>;
  buildScopedHref: (pathname: string) => string;
};

export function getDisplayName(userId: string | null) {
  if (!userId) {
    return "Anonymous";
  }

  return `user_${userId.slice(0, 8)}`;
}

export function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function splitContentLines(content: string) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function postJson<TResponse>(
  input: RequestInfo | URL,
  body: Record<string, unknown>,
) {
  if (isExtensionRuntime() && typeof input === "string") {
    return postDirectToSupabase<TResponse>(input, body);
  }

  const response = await fetch(input, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as ApiResponse<TResponse>;

  if (!response.ok || !payload.ok) {
    throw new Error(payload.ok ? "Request failed" : payload.error);
  }

  return payload.data;
}

export async function updatePostLikes(post: PostRecord, delta: 1 | -1) {
  const supabase = createClient();
  const nextLikes = Math.max(0, post.likes + delta);
  const { error } = await supabase
    .from("posts")
    .update({ likes: nextLikes })
    .eq("id", post.id);

  if (error) {
    throw error;
  }
}

export async function updateCommentLikes(comment: CommentRecord, delta: 1 | -1) {
  const supabase = createClient();
  const nextLikes = Math.max(0, comment.likes + delta);
  const { error } = await supabase
    .from("comments")
    .update({ likes: nextLikes })
    .eq("id", comment.id);

  if (error) {
    throw error;
  }
}

export function usePageBundle(): UsePageBundleResult {
  const searchParams = useSearchParams();
  const searchString = searchParams.toString();

  const currentUrl = useMemo(
    () => normalizePageUrl(resolveCurrentUrl(searchParams)),
    [searchParams, searchString],
  );
  const currentTitle = useMemo(
    () => searchParams.get("title")?.trim() || getDocumentTitle(),
    [searchParams, searchString],
  );

  const [bundle, setBundle] = useState<PageBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ url: currentUrl });
      if (currentTitle) {
        params.set("title", currentTitle);
      }

      if (isExtensionRuntime()) {
        const data = await loadOrCreatePageBundle(currentUrl);
        setBundle(data);
        return data;
      }

      const response = await fetch(`/api/page?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as ApiResponse<PageBundle>;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? "Failed to load page data" : payload.error);
      }

      setBundle(payload.data);
      return payload.data;
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : "Failed to load page data";
      setError(message);
      setBundle(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [currentTitle, currentUrl]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const commentsByPost = useMemo(() => {
    const next: Record<string, CommentRecord[]> = {};

    for (const comment of bundle?.comments ?? []) {
      const postId = comment.post_id;
      if (!postId) {
        continue;
      }

      next[postId] ??= [];
      next[postId].push(comment);
    }

    return next;
  }, [bundle?.comments]);

  const buildScopedHref = useCallback(
    (pathname: string) => {
      const params = new URLSearchParams({ url: currentUrl });
      if (currentTitle) {
        params.set("title", currentTitle);
      }

      if (isExtensionRuntime()) {
        return `#${pathname}?${params.toString()}`;
      }

      return `${pathname}?${params.toString()}`;
    },
    [currentTitle, currentUrl],
  );

  return {
    bundle,
    commentsByPost,
    currentUrl,
    currentTitle,
    loading,
    error,
    refresh,
    buildScopedHref,
  };
}

async function postDirectToSupabase<TResponse>(
  input: string,
  body: Record<string, unknown>,
) {
  if (input === "/api/chat") {
    return (await createPostDirect({
      roomId: readString(body.roomId),
      pageId: readString(body.pageId),
      type: "chat",
      content: readString(body.message),
      header: null,
    })) as TResponse;
  }

  if (input === "/api/questions" || input === "/api/guides") {
    const type = input === "/api/questions" ? "question" : "guide";
    return (await createPostDirect({
      roomId: readString(body.roomId),
      pageId: readString(body.pageId),
      type,
      content: readString(body.content),
      header: readNullableString(body.header),
    })) as TResponse;
  }

  if (input === "/api/answers") {
    return (await createCommentDirect({
      postId: readString(body.postId),
      content: readString(body.content),
      replyId: readNullableString(body.replyId),
    })) as TResponse;
  }

  throw new Error(`${input} is not available in the extension bundle.`);
}

async function loadOrCreatePageBundle(url: string): Promise<PageBundle> {
  const page = await findOrCreatePage(normalizePageUrl(url));
  const room = await findOrCreateRoom(page.id);
  const supabase = createClient();

  const { data: postsData, error: postsError } = await supabase
    .from("posts")
    .select("*")
    .eq("room_id", room.id)
    .order("created_at", { ascending: true });

  if (postsError) {
    throw postsError;
  }

  const posts = postsData ?? [];
  const postIds = posts.map((post) => post.id);
  let comments: CommentRecord[] = [];

  if (postIds.length > 0) {
    const { data: commentsData, error: commentsError } = await supabase
      .from("comments")
      .select("*")
      .in("post_id", postIds)
      .order("created_at", { ascending: true });

    if (commentsError) {
      throw commentsError;
    }

    comments = commentsData ?? [];
  }

  return {
    page,
    room,
    posts,
    comments,
  };
}

async function findOrCreatePage(url: string): Promise<PageRecord> {
  const normalizedUrl = normalizePageUrl(url);
  const supabase = createClient();
  const { data: existingPages, error: loadError } = await supabase
    .from("pages")
    .select("*")
    .eq("normalized_url", normalizedUrl)
    .limit(1);

  if (loadError) {
    throw loadError;
  }

  if (existingPages?.[0]) {
    return existingPages[0];
  }

  const { data: createdPages, error: createError } = await supabase
    .from("pages")
    .insert({ normalized_url: normalizedUrl })
    .select("*")
    .limit(1);

  if (createError) {
    const { data: racedPages, error: racedError } = await supabase
      .from("pages")
      .select("*")
      .eq("normalized_url", normalizedUrl)
      .limit(1);

    if (racedError || !racedPages?.[0]) {
      throw createError;
    }

    return racedPages[0];
  }

  if (!createdPages?.[0]) {
    throw new Error("Could not create the page record.");
  }

  return createdPages[0];
}

async function findOrCreateRoom(pageId: string): Promise<RoomRecord> {
  const supabase = createClient();
  const { data: existingRooms, error: loadError } = await supabase
    .from("rooms")
    .select("*")
    .eq("page_id", pageId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (loadError) {
    throw loadError;
  }

  if (existingRooms?.[0]) {
    return existingRooms[0];
  }

  const { data: createdRooms, error: createError } = await supabase
    .from("rooms")
    .insert({ page_id: pageId })
    .select("*")
    .limit(1);

  if (createError) {
    throw createError;
  }

  if (!createdRooms?.[0]) {
    throw new Error("Could not create the room record.");
  }

  return createdRooms[0];
}

async function createPostDirect({
  roomId,
  pageId,
  type,
  content,
  header,
}: {
  roomId: string;
  pageId: string;
  type: "chat" | "guide" | "question";
  content: string;
  header: string | null;
}) {
  const trimmedContent = content.trim();
  if (!trimmedContent) {
    throw new Error("content is required");
  }

  const resolvedRoomId = roomId || (pageId ? (await findOrCreateRoom(pageId)).id : "");
  if (!resolvedRoomId) {
    throw new Error("roomId or pageId is required");
  }

  const supabase = createClient();
  const payload: TablesInsert<"posts"> = {
    room_id: resolvedRoomId,
    type,
    content: trimmedContent,
    header: header?.trim() || null,
    user_id: null,
  };

  const { data, error } = await supabase
    .from("posts")
    .insert(payload)
    .select("*")
    .limit(1);

  if (error) {
    throw error;
  }

  if (!data?.[0]) {
    throw new Error("Could not create post.");
  }

  return data[0];
}

async function createCommentDirect({
  postId,
  content,
  replyId,
}: {
  postId: string;
  content: string;
  replyId: string | null;
}) {
  const trimmedContent = content.trim();
  if (!postId || !trimmedContent) {
    throw new Error("postId and content are required");
  }

  const supabase = createClient();
  const payload: TablesInsert<"comments"> = {
    post_id: postId,
    content: trimmedContent,
    reply_id: replyId,
    user_id: null,
  };

  const { data, error } = await supabase
    .from("comments")
    .insert(payload)
    .select("*")
    .limit(1);

  if (error) {
    throw error;
  }

  if (!data?.[0]) {
    throw new Error("Could not create comment.");
  }

  return data[0];
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNullableString(value: unknown) {
  const text = readString(value);
  return text || null;
}

function normalizePageUrl(input: string) {
  const trimmed = input.trim();
  if (!trimmed) {
    return FALLBACK_URL;
  }

  try {
    const withProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const url = new URL(withProtocol);

    url.hash = "";
    url.hostname = url.hostname.toLowerCase();

    const defaultPort = DEFAULT_PORTS.get(url.protocol);
    if (defaultPort && url.port === defaultPort) {
      url.port = "";
    }

    if (url.pathname !== "/") {
      url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    }

    const sortedSearchParams = new URLSearchParams(url.searchParams);
    sortedSearchParams.sort();
    url.search = sortedSearchParams.toString();

    return url.toString();
  } catch {
    return FALLBACK_URL;
  }
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

function resolveCurrentUrl(searchParams: ReturnType<typeof useSearchParams>) {
  const explicitUrl = searchParams.get("url")?.trim();
  if (explicitUrl) {
    return explicitUrl;
  }

  if (typeof window === "undefined") {
    return FALLBACK_URL;
  }

  const referrer = document.referrer.trim();
  if (referrer.startsWith("http://") || referrer.startsWith("https://")) {
    return referrer;
  }

  const { protocol, hostname, href } = window.location;
  if (
    (protocol === "http:" || protocol === "https:") &&
    hostname !== "localhost" &&
    hostname !== "127.0.0.1"
  ) {
    return href;
  }

  return FALLBACK_URL;
}

function getDocumentTitle() {
  if (typeof document === "undefined") {
    return "Uncommon Hacks";
  }

  return document.title.trim() || "Uncommon Hacks";
}
