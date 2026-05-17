"use client";

import { createClient } from "@/utils/supabase/client";

export type DmMemberProfile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export type DmThreadSummary = {
  id: string;
  createdAt: string;
  updatedAt: string;
  members: DmMemberProfile[];
  latestMessage: {
    id: string;
    content: string;
    createdAt: string;
    senderId: string | null;
  } | null;
};

export type DmMessage = {
  id: string;
  threadId: string;
  content: string;
  createdAt: string;
  sender: DmMemberProfile | null;
};

type ApiResponse<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: string;
    };

export async function listDmThreads() {
  return await dmApi<DmThreadSummary[]>("/api/dms/threads");
}

export async function startDirectMessage(recipientUserId: string) {
  return await dmApi<DmThreadSummary>("/api/dms/threads", {
    body: JSON.stringify({ recipientUserId }),
    method: "POST",
  });
}

export async function listDmMessages(threadId: string) {
  return await dmApi<DmMessage[]>(`/api/dms/threads/${threadId}/messages`);
}

export async function sendDmMessage(threadId: string, content: string) {
  return await dmApi<DmMessage>(`/api/dms/threads/${threadId}/messages`, {
    body: JSON.stringify({ content }),
    method: "POST",
  });
}

export function getMemberDisplayName(member: DmMemberProfile | null) {
  if (!member) {
    return "Unknown user";
  }

  return member.display_name?.trim() || member.username?.trim() || `user_${member.id.slice(0, 8)}`;
}

export function getDmPath(pathname: string) {
  if (isExtensionRuntime()) {
    return `#${pathname}`;
  }

  return pathname;
}

async function dmApi<T>(pathname: string, init: RequestInit = {}) {
  const supabase = createClient();
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  const target = getApiTarget(pathname);
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");

  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  const response = await fetch(target, {
    ...init,
    headers,
  });
  const payload = (await response.json()) as ApiResponse<T>;

  if (!response.ok || !payload.ok) {
    throw new Error(payload.ok ? "DM request failed." : payload.error);
  }

  return payload.data;
}

function getApiTarget(pathname: string) {
  if (!isExtensionRuntime()) {
    return pathname;
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";
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
