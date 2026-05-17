"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import type { Json, TablesInsert } from "@/utils/database.types";

const GLOBAL_ROOM_URL = "https://global.pairpod.local/";
const FALLBACK_URL = GLOBAL_ROOM_URL;
const LOCAL_POST_VOTES_KEY = "pairpod.postVotes";
const LOCAL_COMMENT_VOTES_KEY = "pairpod.commentVotes";
const REALTIME_REFRESH_DEBOUNCE_MS = 150;
const ACTIVE_POLL_INTERVAL_MS = 2500;
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

export type PageRouteRecord = {
  id: string;
  page_id: string;
  path: string;
  label: string | null;
  source: string;
  created_at: string;
  updated_at: string;
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

export type ChatRecord = {
  chat_id: string;
  room_id: string;
  body: string | null;
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
  auth_user_id?: string | null;
  email: string | null;
  username: string | null;
  configurations: Json;
  display_name?: string | null;
  avatar_url: string | null;
  clothing_url?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

export type PostVoteRecord = {
  post_id: string;
  user_id: string;
  value: 1 | -1;
};

export type CommentVoteRecord = {
  comment_id: string;
  user_id: string;
  value: 1 | -1;
};

export type PageBundle = {
  page: PageRecord;
  room: RoomRecord;
  routes: PageRouteRecord[];
  chats: ChatRecord[];
  posts: PostRecord[];
  comments: CommentRecord[];
  users: UserProfileRecord[];
  postVotes: PostVoteRecord[];
  commentVotes: CommentVoteRecord[];
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
  currentPostVotesById: Record<string, 1 | -1>;
  currentCommentVotesById: Record<string, 1 | -1>;
  usersById: Record<string, UserProfileRecord>;
  currentUrl: string;
  domainUrl: string;
  currentTitle: string;
  roomScope: "global" | "domain";
  loading: boolean;
  error: string | null;
  refresh: (options?: { silent?: boolean }) => Promise<PageBundle | null>;
  buildScopedHref: (pathname: string) => string;
  buildRoomHref: (pathname: string, scope: "global" | "domain") => string;
  buildDomainHref: (pathname: string, url: string) => string;
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

type VoteSelectTable<TVote> = {
  select(columns: string): {
    eq(column: string, value: string): {
      in(column: string, value: string[]): Promise<{
        data: TVote[] | null;
        error: Error | null;
      }>;
    };
  };
};

type VoteSelectClient = {
  from(table: "post_votes"): VoteSelectTable<PostVoteRecord>;
  from(table: "comment_votes"): VoteSelectTable<CommentVoteRecord>;
};

type VoteRow = {
  id: string;
  likes: number;
};

type VoteRpcClient = {
  rpc(
    fn: "increment_post_likes",
    args: { p_post_id: string; p_delta: number },
  ): Promise<{ data: VoteRow[] | null; error: Error | null }>;
  rpc(
    fn: "increment_comment_likes",
    args: { p_comment_id: string; p_delta: number },
  ): Promise<{ data: VoteRow[] | null; error: Error | null }>;
};

const USER_PROFILE_COLUMNS =
  "id,auth_user_id,email,username,configurations,display_name,avatar_url,clothing_url,updated_at";
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
  const displayName =
    normalizeOptionalText(profile?.display_name) ?? configuration.displayName?.trim();

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
  const userId = await getCurrentAuthUserId();
  if (userId && getLocalVote(LOCAL_POST_VOTES_KEY, userId, post.id) === delta) {
    throw new Error(
      delta === 1
        ? "You already upvoted this post."
        : "You already downvoted this post.",
    );
  }

  try {
    await updatePostLikesDirect(post, delta);
    if (userId) {
      setLocalVote(LOCAL_POST_VOTES_KEY, userId, post.id, delta);
    }
  } catch (error) {
    await updateVoteThroughApi("post", post.id, delta, error);
    if (userId) {
      setLocalVote(LOCAL_POST_VOTES_KEY, userId, post.id, delta);
    }
  }
}

async function updatePostLikesDirect(post: PostRecord, delta: 1 | -1) {
  const supabase = createClient();
  try {
    await updatePostLikesViaRpc(
      supabase as unknown as VoteRpcClient,
      post.id,
      delta,
    );
  } catch (rpcError) {
    if (!isExtensionRuntime()) {
      throw rpcError;
    }

    await updatePostLikesViaTables(post, delta, rpcError);
  }
}

async function updatePostLikesViaRpc(
  supabase: VoteRpcClient,
  postId: string,
  delta: 1 | -1,
) {
  const { data, error } = await supabase.rpc("increment_post_likes", {
    p_post_id: postId,
    p_delta: delta,
  });

  if (error) {
    throw error;
  }

  if (!data?.[0]) {
    throw new Error("Could not update post vote.");
  }
}

export async function updateCommentLikes(comment: CommentRecord, delta: 1 | -1) {
  const userId = await getCurrentAuthUserId();
  if (
    userId &&
    getLocalVote(LOCAL_COMMENT_VOTES_KEY, userId, comment.id) === delta
  ) {
    throw new Error(
      delta === 1
        ? "You already liked this reply."
        : "You already disliked this reply.",
    );
  }

  try {
    await updateCommentLikesDirect(comment, delta);
    if (userId) {
      setLocalVote(LOCAL_COMMENT_VOTES_KEY, userId, comment.id, delta);
    }
  } catch (error) {
    await updateVoteThroughApi("comment", comment.id, delta, error);
    if (userId) {
      setLocalVote(LOCAL_COMMENT_VOTES_KEY, userId, comment.id, delta);
    }
  }
}

async function updateCommentLikesDirect(comment: CommentRecord, delta: 1 | -1) {
  const supabase = createClient();
  try {
    await updateCommentLikesViaRpc(
      supabase as unknown as VoteRpcClient,
      comment.id,
      delta,
    );
  } catch (rpcError) {
    if (!isExtensionRuntime()) {
      throw rpcError;
    }

    await updateCommentLikesViaTables(comment, delta, rpcError);
  }
}

async function updateCommentLikesViaRpc(
  supabase: VoteRpcClient,
  commentId: string,
  delta: 1 | -1,
) {
  const { data, error } = await supabase.rpc("increment_comment_likes", {
    p_comment_id: commentId,
    p_delta: delta,
  });

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
  const votesUrl = isExtensionRuntime() ? getRemoteApiUrl("/api/votes") : "/api/votes";
  if (!votesUrl) {
    const directMessage =
      directError instanceof Error ? ` Supabase said: ${directError.message}` : "";
    throw new Error(
      `Could not update vote from the extension. Apply the increment_post_likes and increment_comment_likes functions from supabase/schema.sql to Supabase, or set NEXT_PUBLIC_SITE_URL to your running web app before building the extension.${directMessage}`,
    );
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

  const response = await fetch(votesUrl, {
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

async function updatePostLikesViaTables(
  post: PostRecord,
  delta: 1 | -1,
  rpcError?: unknown,
) {
  const authUserId = await getCurrentAuthUserId();
  if (!authUserId) {
    throw new Error("You must be signed in to vote.");
  }

  const supabase = createClient() as any;
  const previousValue = await loadExistingVoteValue(
    supabase,
    "post_votes",
    "post_id",
    post.id,
    authUserId,
  );
  if (previousValue === delta) {
    throw new Error(
      delta === 1
        ? "You already upvoted this post."
        : "You already downvoted this post.",
    );
  }

  const scoreDelta = previousValue === null ? delta : delta - previousValue;
  const voteError = await upsertVoteValue(
    supabase,
    "post_votes",
    { post_id: post.id, user_id: authUserId, value: delta },
    "post_id,user_id",
  );
  if (voteError) {
    console.warn("Could not persist post vote row from extension.", voteError);
  }

  const nextLikes = Math.max(0, post.likes + scoreDelta);
  const { error: updateError } = await supabase
    .from("posts")
    .update({ likes: nextLikes })
    .eq("id", post.id);

  if (updateError) {
    const directMessage =
      rpcError instanceof Error ? ` Supabase RPC said: ${rpcError.message}` : "";
    throw new Error(`Could not update post vote.${directMessage} Table update said: ${updateError.message}`);
  }
}

async function updateCommentLikesViaTables(
  comment: CommentRecord,
  delta: 1 | -1,
  rpcError?: unknown,
) {
  const authUserId = await getCurrentAuthUserId();
  if (!authUserId) {
    throw new Error("You must be signed in to vote.");
  }

  const supabase = createClient() as any;
  const previousValue = await loadExistingVoteValue(
    supabase,
    "comment_votes",
    "comment_id",
    comment.id,
    authUserId,
  );
  if (previousValue === delta) {
    throw new Error(
      delta === 1
        ? "You already liked this reply."
        : "You already disliked this reply.",
    );
  }

  const scoreDelta = previousValue === null ? delta : delta - previousValue;
  const voteError = await upsertVoteValue(
    supabase,
    "comment_votes",
    { comment_id: comment.id, user_id: authUserId, value: delta },
    "comment_id,user_id",
  );
  if (voteError) {
    console.warn("Could not persist comment vote row from extension.", voteError);
  }

  const nextLikes = Math.max(0, comment.likes + scoreDelta);
  const { error: updateError } = await supabase
    .from("comments")
    .update({ likes: nextLikes })
    .eq("id", comment.id);

  if (updateError) {
    const directMessage =
      rpcError instanceof Error ? ` Supabase RPC said: ${rpcError.message}` : "";
    throw new Error(`Could not update reply vote.${directMessage} Table update said: ${updateError.message}`);
  }
}

async function loadExistingVoteValue(
  supabase: any,
  table: "post_votes" | "comment_votes",
  targetColumn: "post_id" | "comment_id",
  targetId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from(table)
    .select("value")
    .eq(targetColumn, targetId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.warn(`Could not load ${table} row from extension.`, error);
    return null;
  }

  return data?.value === 1 || data?.value === -1 ? data.value : null;
}

async function upsertVoteValue(
  supabase: any,
  table: "post_votes" | "comment_votes",
  row: Record<string, string | number>,
  onConflict: string,
) {
  const { error } = await supabase
    .from(table)
    .upsert(
      {
        ...row,
        updated_at: new Date().toISOString(),
      },
      { onConflict },
    );

  return error;
}

function getRemoteApiUrl(pathname: string) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (!siteUrl) {
    return null;
  }

  const url = new URL(pathname, siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`);
  return url.toString();
}

function hasConfiguredRemoteApiUrl() {
  return Boolean(process.env.NEXT_PUBLIC_SITE_URL?.trim());
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
  const bundleRef = useRef<PageBundle | null>(null);

  const refresh = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }
    setError(null);

    try {
      const params = new URLSearchParams({ url: currentUrl });
      params.set("room", roomScope);
      if (currentTitle) {
        params.set("title", currentTitle);
      }

      if (isExtensionRuntime()) {
        const data = await withCurrentUserVotes(
          await loadOrCreatePageBundle(currentUrl),
        );
        bundleRef.current = data;
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

      const data = await withCurrentUserVotes(payload.data);
      bundleRef.current = data;
      setBundle(data);
      return data;
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : "Failed to load page data";
      if (options?.silent && bundleRef.current) {
        console.warn("Silent page data refresh failed.", loadError);
        return bundleRef.current;
      }

      setError(message);
      bundleRef.current = null;
      setBundle(null);
      return null;
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, [currentTitle, currentUrl, roomScope]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const roomId = bundle?.room.id;
    if (!roomId) {
      return;
    }

    const supabase = createClient();
    let refreshTimeout: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }

      refreshTimeout = setTimeout(() => {
        void refresh({ silent: true });
      }, REALTIME_REFRESH_DEBOUNCE_MS);
    };

    const channel = supabase
      .channel(`page-bundle:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "posts",
          filter: `room_id=eq.${roomId}`,
        },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat",
          filter: `room_id=eq.${bundle.page.id}`,
        },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "page_routes",
          filter: `page_id=eq.${bundle.page.id}`,
        },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "comments",
        },
        scheduleRefresh,
      )
      .subscribe();

    const refreshIfVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }

      void refresh({ silent: true });
    };

    const pollInterval = setInterval(
      refreshIfVisible,
      ACTIVE_POLL_INTERVAL_MS,
    );
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refresh({ silent: true });
      }
    };
    const handleFocus = () => {
      void refresh({ silent: true });
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }
      clearInterval(pollInterval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      void supabase.removeChannel(channel);
    };
  }, [bundle?.room.id, refresh]);

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

  const currentPostVotesById = useMemo(() => {
    const next: Record<string, 1 | -1> = {};

    for (const vote of bundle?.postVotes ?? []) {
      next[vote.post_id] = vote.value;
    }

    return next;
  }, [bundle?.postVotes]);

  const currentCommentVotesById = useMemo(() => {
    const next: Record<string, 1 | -1> = {};

    for (const vote of bundle?.commentVotes ?? []) {
      next[vote.comment_id] = vote.value;
    }

    return next;
  }, [bundle?.commentVotes]);

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

  const buildDomainHref = useCallback(
    (pathname: string, url: string) => {
      const normalizedUrl = normalizePageUrl(url);
      const params = new URLSearchParams({
        room: "domain",
        url: normalizedUrl,
      });
      if (currentTitle) {
        params.set("title", currentTitle);
      }

      if (isExtensionRuntime()) {
        return `#${pathname}?${params.toString()}`;
      }

      return `${pathname}?${params.toString()}`;
    },
    [currentTitle],
  );

  return {
    bundle,
    commentsByPost,
    currentPostVotesById,
    currentCommentVotesById,
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
    buildDomainHref,
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
    return (await createChatDirect({
      pageId: readString(body.pageId),
      body: readString(body.message),
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
  await seedPageRoutesDirect(page.id, url, []);
  const supabase = createClient();

  const [routesResult, chatsResult, postsResult] = await Promise.all([
    supabase
      .from("page_routes")
      .select("*")
      .eq("page_id", page.id)
      .order("created_at", { ascending: true })
      .returns<PageRouteRecord[]>(),
    supabase
      .from("chat")
      .select("*")
      .eq("room_id", page.id)
      .order("created_at", { ascending: true })
      .returns<ChatRecord[]>(),
    supabase
      .from("posts")
      .select("*")
      .eq("room_id", room.id)
      .order("created_at", { ascending: true }),
  ]);

  if (chatsResult.error) {
    throw chatsResult.error;
  }

  if (routesResult.error) {
    throw routesResult.error;
  }

  if (postsResult.error) {
    throw postsResult.error;
  }

  const chats = chatsResult.data ?? [];
  const posts = postsResult.data ?? [];
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

  const users = await loadProfilesForRecords(posts, comments, chats);

  return {
    page,
    room,
    routes: routesResult.data ?? [],
    chats,
    posts,
    comments,
    users,
    postVotes: [],
    commentVotes: [],
  };
}

async function withCurrentUserVotes(bundle: PageBundle): Promise<PageBundle> {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      ...bundle,
      postVotes: [],
      commentVotes: [],
    };
  }

  const postIds = bundle.posts.map((post) => post.id);
  const commentIds = bundle.comments.map((comment) => comment.id);
  let postVotes: PostVoteRecord[] = [];
  let commentVotes: CommentVoteRecord[] = [];

  try {
    [postVotes, commentVotes] = await Promise.all([
      loadPostVotesForUser(user.id, postIds),
      loadCommentVotesForUser(user.id, commentIds),
    ]);
  } catch (voteLoadError) {
    console.warn("Could not load current user votes.", voteLoadError);
  }

  postVotes = mergeLocalPostVotes(user.id, postIds, postVotes);
  commentVotes = mergeLocalCommentVotes(user.id, commentIds, commentVotes);

  return {
    ...bundle,
    postVotes,
    commentVotes,
  };
}

async function getCurrentAuthUserId() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id ?? null;
}

function mergeLocalPostVotes(
  userId: string,
  postIds: string[],
  votes: PostVoteRecord[],
) {
  const next = new Map(votes.map((vote) => [vote.post_id, vote]));

  for (const postId of postIds) {
    const value = getLocalVote(LOCAL_POST_VOTES_KEY, userId, postId);
    if (value) {
      next.set(postId, { post_id: postId, user_id: userId, value });
    }
  }

  return [...next.values()];
}

function mergeLocalCommentVotes(
  userId: string,
  commentIds: string[],
  votes: CommentVoteRecord[],
) {
  const next = new Map(votes.map((vote) => [vote.comment_id, vote]));

  for (const commentId of commentIds) {
    const value = getLocalVote(LOCAL_COMMENT_VOTES_KEY, userId, commentId);
    if (value) {
      next.set(commentId, { comment_id: commentId, user_id: userId, value });
    }
  }

  return [...next.values()];
}

function getLocalVote(
  storageKey: string,
  userId: string,
  targetId: string,
): 1 | -1 | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const stored = JSON.parse(
      window.localStorage.getItem(storageKey) ?? "{}",
    ) as Record<string, Record<string, number>>;
    const value = stored[userId]?.[targetId];
    return value === 1 || value === -1 ? value : null;
  } catch {
    return null;
  }
}

function setLocalVote(
  storageKey: string,
  userId: string,
  targetId: string,
  value: 1 | -1,
) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const stored = JSON.parse(
      window.localStorage.getItem(storageKey) ?? "{}",
    ) as Record<string, Record<string, number>>;
    stored[userId] = {
      ...(stored[userId] ?? {}),
      [targetId]: value,
    };
    window.localStorage.setItem(storageKey, JSON.stringify(stored));
  } catch {
    // Local vote memory is a UI guard only; the database remains authoritative.
  }
}

async function loadPostVotesForUser(userId: string, postIds: string[]) {
  if (postIds.length === 0) {
    return [];
  }

  const supabase = createClient();
  const postVotes = (supabase as unknown as VoteSelectClient).from("post_votes");
  const { data, error } = await postVotes
    .select("post_id,user_id,value")
    .eq("user_id", userId)
    .in("post_id", postIds);

  if (error) {
    throw error;
  }

  return (data ?? []).filter(isVoteValue);
}

async function loadCommentVotesForUser(userId: string, commentIds: string[]) {
  if (commentIds.length === 0) {
    return [];
  }

  const supabase = createClient();
  const commentVotes = (supabase as unknown as VoteSelectClient).from("comment_votes");
  const { data, error } = await commentVotes
    .select("comment_id,user_id,value")
    .eq("user_id", userId)
    .in("comment_id", commentIds);

  if (error) {
    throw error;
  }

  return (data ?? []).filter(isVoteValue);
}

function isVoteValue<TVote extends { value: number }>(
  vote: TVote,
): vote is TVote & { value: 1 | -1 } {
  return vote.value === 1 || vote.value === -1;
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

async function seedPageRoutesDirect(pageId: string, url: string, paths: string[]) {
  const routes = buildRouteSeedRows(pageId, url, paths);
  if (routes.length === 0) {
    return;
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("page_routes")
    .upsert(routes, { onConflict: "page_id,path" });

  if (error) {
    console.warn("Could not seed page route doors.", error);
  }
}

function buildRouteSeedRows(pageId: string, url: string, paths: string[]) {
  const baseUrl = parseRouteUrl(url);
  if (!baseUrl || baseUrl.hostname === "global.pairpod.local") {
    return [];
  }

  const routes = new Map<string, { path: string; label: string; source: string }>();
  const addRoute = (path: string, source: string) => {
    const normalized = normalizeRoutePath(path);
    if (!normalized || routes.has(normalized)) {
      return;
    }

    routes.set(normalized, {
      path: normalized,
      label: normalized === "/" ? "/" : normalized.replace(/^\//, ""),
      source,
    });
  };

  addRoute("/", "site-root");
  addRoute(`${baseUrl.pathname}${baseUrl.search}`, "current-page");

  const segments = baseUrl.pathname.split("/").filter(Boolean);
  for (let index = 0; index < segments.length - 1; index += 1) {
    addRoute(`/${segments.slice(0, index + 1).join("/")}`, "parent-route");
  }

  for (const path of paths) {
    addRoute(path, "post-section");
  }

  const now = new Date().toISOString();
  return [...routes.values()].slice(0, 12).map((route) => ({
    page_id: pageId,
    path: route.path,
    label: route.label,
    source: route.source,
    updated_at: now,
  }));
}

function parseRouteUrl(value: string) {
  try {
    return new URL(/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
}

function normalizeRoutePath(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = parseRouteUrl(trimmed);
  const routeText = parsed ? `${parsed.pathname}${parsed.search}` : trimmed;
  const [pathPart, searchPart = ""] = routeText.split("?");
  const path = `/${pathPart.replace(/^\/+/, "").replace(/\/+$/, "")}`;
  const normalizedPath = path === "/" ? "/" : path;
  return `${normalizedPath}${searchPart ? `?${searchPart}` : ""}`;
}

async function createChatDirect({
  pageId,
  body,
}: {
  pageId: string;
  body: string;
}) {
  const trimmedBody = body.trim();
  if (!pageId || !trimmedBody) {
    throw new Error("pageId and message are required");
  }

  const supabase = createClient();
  const currentUser = await ensureCurrentUserProfile();
  const payload: TablesInsert<"chat"> = {
    room_id: pageId,
    body: trimmedBody,
    user_id: currentUser?.id ?? null,
  };

  const { data, error } = await supabase
    .from("chat")
    .insert(payload)
    .select("*")
    .limit(1)
    .returns<ChatRecord[]>();

  if (error) {
    throw error;
  }

  if (!data?.[0]) {
    throw new Error("Could not create chat message.");
  }

  return data[0];
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
  type: "guide" | "question";
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
  chats: ChatRecord[] = [],
) {
  const userIds = new Set<string>();

  for (const chat of chats) {
    if (chat.user_id) {
      userIds.add(chat.user_id);
    }
  }

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

  const users = supabase.from("users");
  const { data: existingByAuth, error: existingByAuthError } = await users
    .select(USER_PROFILE_COLUMNS)
    .eq("auth_user_id", user.id)
    .maybeSingle<UserProfileRecord>();

  if (existingByAuthError) {
    throw existingByAuthError;
  }

  if (existingByAuth) {
    return existingByAuth;
  }

  const { data: legacyById, error: legacyByIdError } = await users
    .select(USER_PROFILE_COLUMNS)
    .eq("id", user.id)
    .maybeSingle<UserProfileRecord>();

  if (legacyByIdError) {
    throw legacyByIdError;
  }

  const nextDisplayName =
    readMetadataString(user.user_metadata.full_name) ||
    readMetadataString(user.user_metadata.display_name) ||
    readMetadataString(user.user_metadata.name);
  const nextAvatarUrl = DEFAULT_AVATAR_URL;

  if (legacyById) {
    const nextConfigurations = readProfileConfiguration(legacyById.configurations);

    if (!nextConfigurations.displayName && nextDisplayName) {
      nextConfigurations.displayName = nextDisplayName;
    }

    const { data: updatedLegacy, error: updateLegacyError } = await users
      .update({
        auth_user_id: user.id,
        email: user.email ?? legacyById.email,
        display_name: legacyById.display_name ?? nextDisplayName,
        avatar_url: legacyById.avatar_url ?? nextAvatarUrl,
        configurations: nextConfigurations,
        updated_at: new Date().toISOString(),
      })
      .eq("id", legacyById.id)
      .select(USER_PROFILE_COLUMNS)
      .maybeSingle<UserProfileRecord>();

    if (updateLegacyError) {
      throw updateLegacyError;
    }

    if (!updatedLegacy) {
      throw new Error("Could not update your profile.");
    }

    return updatedLegacy;
  }

  const { data: createdProfile, error: createProfileError } = await users
    .insert({
      auth_user_id: user.id,
      email: user.email ?? null,
      username: normalizeUsername(readMetadataString(user.user_metadata.username)),
      display_name: nextDisplayName,
      avatar_url: nextAvatarUrl,
      configurations: {
        displayName: nextDisplayName,
      },
    })
    .select(USER_PROFILE_COLUMNS)
    .maybeSingle<UserProfileRecord>();

  if (createProfileError) {
    throw createProfileError;
  }

  if (!createdProfile) {
    throw new Error("Could not create your profile.");
  }

  return createdProfile;
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

function normalizeOptionalText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizeUsername(value: string | null) {
  const normalized = normalizeOptionalText(value)?.toLowerCase() ?? null;
  if (!normalized) {
    return null;
  }

  return /^[a-z0-9_-]{3,24}$/.test(normalized) ? normalized : null;
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
