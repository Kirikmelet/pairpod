"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

const FALLBACK_URL = "https://example.com";

export type PageRecord = {
  id: string;
  normalized_url: string;
  created_at: string;
};

export type RoomRecord = {
  id: string;
  page_id: string;
  max_users: number;
  configurations: Record<string, unknown>;
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

export function usePageBundle(): UsePageBundleResult {
  const searchParams = useSearchParams();
  const searchString = searchParams.toString();

  const currentUrl = useMemo(() => resolveCurrentUrl(searchParams), [searchParams, searchString]);
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
