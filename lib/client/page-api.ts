"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import type { Json, TablesInsert } from "@/utils/database.types";

const GLOBAL_ROOM_URL = "https://global.pairpod.local/";
const FALLBACK_URL = GLOBAL_ROOM_URL;
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

export type UserProfileRecord = {
  id: string;
  email: string | null;
  username: string | null;
  configurations: Json;
  avatar_url: string | null;
};

export type PageBundle = {
  page: PageRecord;
  room: RoomRecord;
  posts: PostRecord[];
  comments: CommentRecord[];
  users: UserProfileRecord[];
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
  usersById: Record<string, UserProfileRecord>;
  currentUrl: string;
  domainUrl: string;
  currentTitle: string;
  roomScope: "global" | "domain";
  loading: boolean;
  error: string | null;
  refresh: () => Promise<PageBundle | null>;
  buildScopedHref: (pathname: string) => string;
  buildRoomHref: (pathname: string, scope: "global" | "domain") => string;
};

type MutableUsersTable = {
  select(columns: string): {
    eq(column: string, value: string): {
      limit(count: number): Promise<{ data: UserProfileRecord[] | null; error: Error | null }>;
    };
    in(column: string, value: string[]): Promise<{
      data: UserProfileRecord[] | null;
      error: Error | null;
    }>;
  };
  upsert(
    value: Partial<UserProfileRecord> & { id: string },
    options?: { onConflict?: string },
  ): Promise<{ data: unknown; error: Error | null }>;
};

const USER_PROFILE_COLUMNS = "id,email,username,configurations,avatar_url";
export const DEFAULT_AVATAR_URL =
  "https://xgfgqzveuyeceupfaebh.supabase.co/storage/v1/object/public/profile_pictures/default_user.png";

export function getDisplayName(
  userId: string | null,
  usersById: Record<string, UserProfileRecord> = {},
) {
  if (!userId) {
    return "Anonymous";
  }

  const profile = usersById[userId];
  const configuration = readProfileConfiguration(profile?.configurations);
  const displayName = configuration.displayName?.trim();

  if (displayName) {
    return displayName;
  }

  if (profile?.username?.trim()) {
    return profile.username.trim();
  }

  return `user_${userId.slice(0, 8)}`;
}

export function getProfileAvatarUrl(
  userId: string | null,
  usersById: Record<string, UserProfileRecord> = {},
) {
  if (!userId) {
    return DEFAULT_AVATAR_URL;
  }

  return usersById[userId]?.avatar_url || DEFAULT_AVATAR_URL;
}

export function getRoomDisplayName(url: string) {
  if (url === GLOBAL_ROOM_URL) {
    return "Global";
  }

  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
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
  if (
    isExtensionRuntime() &&
    typeof input === "string" &&
    input.startsWith("/api/")
  ) {
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
  if (!isExtensionRuntime()) {
    await updateVoteThroughApi("post", post.id, delta);
    return;
  }

  try {
    await updatePostLikesDirect(post, delta);
  } catch (error) {
    await updateVoteThroughApi("post", post.id, delta, error);
  }
}

async function updatePostLikesDirect(post: PostRecord, delta: 1 | -1) {
  const supabase = createClient();
  const nextLikes = Math.max(0, post.likes + delta);
  const { data, error } = await supabase
    .from("posts")
    .update({ likes: nextLikes })
    .eq("id", post.id)
    .select("id")
    .limit(1);

  if (error) {
    throw error;
  }

  if (!data?.[0]) {
    throw new Error("Could not update post vote.");
  }
}

export async function updateCommentLikes(comment: CommentRecord, delta: 1 | -1) {
  if (!isExtensionRuntime()) {
    await updateVoteThroughApi("comment", comment.id, delta);
    return;
  }

  try {
    await updateCommentLikesDirect(comment, delta);
  } catch (error) {
    await updateVoteThroughApi("comment", comment.id, delta, error);
  }
}

async function updateCommentLikesDirect(comment: CommentRecord, delta: 1 | -1) {
  const supabase = createClient();
  const nextLikes = Math.max(0, comment.likes + delta);
  const { data, error } = await supabase
    .from("comments")
    .update({ likes: nextLikes })
    .eq("id", comment.id)
    .select("id")
    .limit(1);

  if (error) {
    throw error;
  }

  if (!data?.[0]) {
    throw new Error("Could not update comment vote.");
  }
}

async function updateVoteThroughApi(
  target: "post" | "comment",
  id: string,
  delta: 1 | -1,
  directError?: unknown,
) {
  if (!isExtensionRuntime()) {
    await postJson("/api/votes", {
      target,
      id,
      delta,
    });
    return;
  }

  const remoteVotesUrl = getRemoteApiUrl("/api/votes");
  if (!remoteVotesUrl) {
    throw directError instanceof Error
      ? directError
      : new Error("Could not update vote.");
  }

  const supabase = createClient();
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  if (!session?.access_token) {
    throw new Error("You must be signed in to vote.");
  }

  const response = await fetch(remoteVotesUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      target,
      id,
      delta,
    }),
  });

  const payload = (await response.json()) as ApiResponse<unknown>;

  if (!response.ok || !payload.ok) {
    throw new Error(payload.ok ? "Failed to update vote" : payload.error);
  }
}

function getRemoteApiUrl(pathname: string) {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";

  if (!siteUrl) {
    return null;
  }

  const url = new URL(pathname, siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`);
  return url.toString();
}

export function usePageBundle(): UsePageBundleResult {
  const searchParams = useSearchParams();
  const searchString = searchParams.toString();
  const roomScope = useMemo(
    () => (searchParams.get("room") === "domain" ? "domain" : "global"),
    [searchParams, searchString],
  );
  const domainUrl = useMemo(
    () => normalizePageUrl(resolveDomainUrl(searchParams)),
    [searchParams, searchString],
  );

  const currentUrl = useMemo(
    () => (roomScope === "domain" ? domainUrl : GLOBAL_ROOM_URL),
    [domainUrl, roomScope],
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
      params.set("room", roomScope);
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
  }, [currentTitle, currentUrl, roomScope]);

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

  const usersById = useMemo(() => {
    const next: Record<string, UserProfileRecord> = {};

    for (const user of bundle?.users ?? []) {
      next[user.id] = user;
    }

    return next;
  }, [bundle?.users]);

  const buildScopedHref = useCallback(
    (pathname: string) => {
      const params = new URLSearchParams({
        room: roomScope,
        url: domainUrl,
      });
      if (currentTitle) {
        params.set("title", currentTitle);
      }

      if (isExtensionRuntime()) {
        return `#${pathname}?${params.toString()}`;
      }

      return `${pathname}?${params.toString()}`;
    },
    [currentTitle, domainUrl, roomScope],
  );

  const buildRoomHref = useCallback(
    (pathname: string, scope: "global" | "domain") => {
      const params = new URLSearchParams({
        room: scope,
        url: domainUrl,
      });
      if (currentTitle) {
        params.set("title", currentTitle);
      }

      if (isExtensionRuntime()) {
        return `#${pathname}?${params.toString()}`;
      }

      return `${pathname}?${params.toString()}`;
    },
    [currentTitle, domainUrl],
  );

  return {
    bundle,
    commentsByPost,
    usersById,
    currentUrl,
    domainUrl,
    currentTitle,
    roomScope,
    loading,
    error,
    refresh,
    buildScopedHref,
    buildRoomHref,
  };
}

export function useCurrentUserProfile() {
  const [profile, setProfile] = useState<UserProfileRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadProfile() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          if (isMounted) {
            setProfile(null);
          }
          return;
        }

        const nextProfile = await ensureCurrentUserProfile();
        if (isMounted) {
          setProfile(nextProfile);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      isMounted = false;
    };
  }, []);

  return { profile, loading };
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

  const users = await loadProfilesForRecords(posts, comments);

  return {
    page,
    room,
    posts,
    comments,
    users,
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
  const currentUser = await ensureCurrentUserProfile();
  const payload: TablesInsert<"posts"> = {
    room_id: resolvedRoomId,
    type,
    content: trimmedContent,
    header: header?.trim() || null,
    user_id: currentUser?.id ?? null,
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
  const currentUser = await ensureCurrentUserProfile();
  const payload: TablesInsert<"comments"> = {
    post_id: postId,
    content: trimmedContent,
    reply_id: replyId,
    user_id: currentUser?.id ?? null,
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

async function loadProfilesForRecords(
  posts: PostRecord[],
  comments: CommentRecord[],
) {
  const userIds = new Set<string>();

  for (const post of posts) {
    if (post.user_id) {
      userIds.add(post.user_id);
    }
  }

  for (const comment of comments) {
    if (comment.user_id) {
      userIds.add(comment.user_id);
    }
  }

  if (userIds.size === 0) {
    return [];
  }

  const supabase = createClient();
  const users = supabase.from("users") as unknown as MutableUsersTable;
  const { data, error } = await users
    .select(USER_PROFILE_COLUMNS)
    .in("id", [...userIds]);

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function ensureCurrentUserProfile() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const users = supabase.from("users") as unknown as MutableUsersTable;
  const { data, error } = await users
    .select(USER_PROFILE_COLUMNS)
    .eq("id", user.id)
    .limit(1);

  if (error) {
    throw error;
  }

  if (data?.[0]) {
    return data[0];
  }

  const profile: UserProfileRecord = {
    id: user.id,
    email: user.email ?? null,
    username: readMetadataString(user.user_metadata.username),
    configurations: {
      displayName:
        readMetadataString(user.user_metadata.full_name) ||
        readMetadataString(user.user_metadata.name),
    },
    avatar_url:
      readMetadataString(user.user_metadata.avatar_url) || DEFAULT_AVATAR_URL,
  };

  const { error: upsertError } = await users.upsert(profile, { onConflict: "id" });
  if (upsertError) {
    throw upsertError;
  }

  return profile;
}

function readProfileConfiguration(configurations: Json | undefined) {
  if (
    configurations &&
    typeof configurations === "object" &&
    !Array.isArray(configurations)
  ) {
    const displayName = configurations.displayName;
    return {
      displayName: typeof displayName === "string" ? displayName : "",
    };
  }

  return { displayName: "" };
}

function readMetadataString(value: unknown) {
  return typeof value === "string" ? value.trim() : null;
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

    url.pathname = "/";
    url.search = "";

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

function resolveDomainUrl(searchParams: ReturnType<typeof useSearchParams>) {
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
    return "PairPod";
  }

  return document.title.trim() || "PairPod";
}
