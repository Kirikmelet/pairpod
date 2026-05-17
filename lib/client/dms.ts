"use client";

import { createClient } from "@/utils/supabase/client";
import type { Json, Tables, TablesInsert, TablesUpdate } from "@/utils/database.types";

export type DmMemberProfile = {
  id: string;
  auth_user_id?: string | null;
  email?: string | null;
  username: string | null;
  configurations?: Json;
  display_name: string | null;
  avatar_url: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

type DmThreadRow = Tables<"dm_threads">;
type DmThreadMemberRow = Tables<"dm_thread_members">;
type DmMessageRow = Tables<"dm_messages">;
type UserProfileRow = Tables<"users">;

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

export async function listDmThreads() {
  return await listDmThreadsDirect();
}

export async function startDirectMessage(recipientUserId: string) {
  return await startDirectMessageDirect(recipientUserId);
}

export async function listDmMessages(threadId: string) {
  return await listDmMessagesDirect(threadId);
}

export async function sendDmMessage(threadId: string, content: string) {
  return await sendDmMessageDirect(threadId, content);
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

function isExtensionRuntime() {
  const globalWithExtensionApis = globalThis as typeof globalThis & {
    browser?: { runtime?: { id?: string } };
    chrome?: { runtime?: { id?: string } };
  };
  const runtime = globalWithExtensionApis.browser ?? globalWithExtensionApis.chrome;

  return Boolean(runtime?.runtime?.id);
}

async function listDmThreadsDirect() {
  const supabase = createClient();
  const profile = await getCurrentDmProfile();
  const { data, error } = await supabase
    .from("dm_thread_members")
    .select("thread_id")
    .eq("user_id", profile.id)
    .returns<Array<Pick<DmThreadMemberRow, "thread_id">>>();

  if (error) {
    throw new Error(`Could not load DMs: ${error.message}`);
  }

  const threadIds = [...new Set((data ?? []).map((row) => row.thread_id))];
  return await loadThreadSummariesDirect(threadIds);
}

async function startDirectMessageDirect(recipientUserId: string) {
  const normalizedRecipientUserId = recipientUserId.trim();
  if (!normalizedRecipientUserId) {
    throw new Error("recipientUserId is required.");
  }

  const supabase = createClient();
  const profile = await getCurrentDmProfile();

  if (normalizedRecipientUserId === profile.id) {
    throw new Error("You cannot start a DM with yourself.");
  }

  const { data: recipient, error: recipientError } = await supabase
    .from("users")
    .select(USER_PROFILE_COLUMNS)
    .eq("id", normalizedRecipientUserId)
    .maybeSingle<UserProfileRow>();

  if (recipientError) {
    throw new Error(`Could not load recipient: ${recipientError.message}`);
  }

  if (!recipient) {
    throw new Error("Recipient user not found.");
  }

  const existingThreadId = await findExistingOneOnOneThreadDirect(
    profile.id,
    normalizedRecipientUserId,
  );
  if (existingThreadId) {
    return await loadThreadSummaryDirect(existingThreadId);
  }

  const now = new Date().toISOString();
  const threadId = crypto.randomUUID();
  const { error: threadError } = await supabase
    .from("dm_threads")
    .insert({
      id: threadId,
      created_by: profile.id,
      updated_at: now,
    } satisfies TablesInsert<"dm_threads">);

  if (threadError) {
    throw new Error(`Could not create DM thread: ${threadError.message}`);
  }

  const { error: membersError } = await supabase
    .from("dm_thread_members")
    .insert([
      { thread_id: threadId, user_id: profile.id },
      { thread_id: threadId, user_id: normalizedRecipientUserId },
    ] satisfies TablesInsert<"dm_thread_members">[]);

  if (membersError) {
    throw new Error(`Could not create DM members: ${membersError.message}`);
  }

  return await loadThreadSummaryDirect(threadId);
}

async function listDmMessagesDirect(threadId: string) {
  const normalizedThreadId = threadId.trim();
  if (!normalizedThreadId) {
    throw new Error("threadId is required.");
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("dm_messages")
    .select("*")
    .eq("thread_id", normalizedThreadId)
    .order("created_at", { ascending: true })
    .returns<DmMessageRow[]>();

  if (error) {
    throw new Error(`Could not load messages: ${error.message}`);
  }

  const profiles = await loadDmProfilesDirect(
    (data ?? [])
      .map((message) => message.sender_id)
      .filter((senderId): senderId is string => Boolean(senderId)),
  );
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));

  return (data ?? []).map((message) => ({
    id: message.id,
    threadId: message.thread_id,
    content: message.content,
    createdAt: message.created_at,
    sender: message.sender_id
      ? toMemberProfile(profilesById.get(message.sender_id) ?? null)
      : null,
  })) satisfies DmMessage[];
}

async function sendDmMessageDirect(threadId: string, content: string) {
  const normalizedThreadId = threadId.trim();
  const trimmedContent = content.trim();
  if (!normalizedThreadId) {
    throw new Error("threadId is required.");
  }

  if (!trimmedContent) {
    throw new Error("content is required.");
  }

  const supabase = createClient();
  const profile = await getCurrentDmProfile();
  const { data, error } = await supabase
    .from("dm_messages")
    .insert({
      content: trimmedContent,
      sender_id: profile.id,
      thread_id: normalizedThreadId,
    } satisfies TablesInsert<"dm_messages">)
    .select("*")
    .single<DmMessageRow>();

  if (error) {
    throw new Error(`Could not send message: ${error.message}`);
  }

  const { error: threadUpdateError } = await supabase
    .from("dm_threads")
    .update({
      updated_at: new Date().toISOString(),
    } satisfies TablesUpdate<"dm_threads">)
    .eq("id", normalizedThreadId);

  if (threadUpdateError) {
    throw new Error(`Could not update DM thread: ${threadUpdateError.message}`);
  }

  return {
    id: data.id,
    threadId: data.thread_id,
    content: data.content,
    createdAt: data.created_at,
    sender: toMemberProfile(profile),
  } satisfies DmMessage;
}

async function findExistingOneOnOneThreadDirect(
  currentUserId: string,
  recipientUserId: string,
) {
  const supabase = createClient();
  const { data: candidateMemberships, error } = await supabase
    .from("dm_thread_members")
    .select("thread_id,user_id")
    .in("user_id", [currentUserId, recipientUserId])
    .returns<Array<Pick<DmThreadMemberRow, "thread_id" | "user_id">>>();

  if (error) {
    throw new Error(`Could not load existing DMs: ${error.message}`);
  }

  const memberIdsByThreadId = new Map<string, Set<string>>();
  for (const membership of candidateMemberships ?? []) {
    const memberIds = memberIdsByThreadId.get(membership.thread_id) ?? new Set<string>();
    memberIds.add(membership.user_id);
    memberIdsByThreadId.set(membership.thread_id, memberIds);
  }

  const matchingThreadIds = [...memberIdsByThreadId.entries()]
    .filter(([, memberIds]) => memberIds.has(currentUserId) && memberIds.has(recipientUserId))
    .map(([threadId]) => threadId);

  if (matchingThreadIds.length === 0) {
    return null;
  }

  const { data: threads, error: threadsError } = await supabase
    .from("dm_threads")
    .select("id,updated_at")
    .in("id", matchingThreadIds)
    .order("updated_at", { ascending: false })
    .returns<Array<Pick<DmThreadRow, "id" | "updated_at">>>();

  if (threadsError) {
    throw new Error(`Could not load existing DM thread: ${threadsError.message}`);
  }

  return threads?.[0]?.id ?? null;
}

async function loadThreadSummaryDirect(threadId: string) {
  const summaries = await loadThreadSummariesDirect([threadId]);
  const summary = summaries[0];
  if (!summary) {
    throw new Error("DM thread not found.");
  }

  return summary;
}

async function loadThreadSummariesDirect(threadIds: string[]) {
  const uniqueThreadIds = [...new Set(threadIds.filter(Boolean))];
  if (uniqueThreadIds.length === 0) {
    return [] satisfies DmThreadSummary[];
  }

  const supabase = createClient();
  const [threadsResult, membersResult, messagesResult] = await Promise.all([
    supabase
      .from("dm_threads")
      .select("*")
      .in("id", uniqueThreadIds)
      .order("updated_at", { ascending: false })
      .returns<DmThreadRow[]>(),
    supabase
      .from("dm_thread_members")
      .select("*")
      .in("thread_id", uniqueThreadIds)
      .returns<DmThreadMemberRow[]>(),
    supabase
      .from("dm_messages")
      .select("*")
      .in("thread_id", uniqueThreadIds)
      .order("created_at", { ascending: false })
      .returns<DmMessageRow[]>(),
  ]);

  if (threadsResult.error) {
    throw new Error(`Could not load DM threads: ${threadsResult.error.message}`);
  }

  if (membersResult.error) {
    throw new Error(`Could not load DM members: ${membersResult.error.message}`);
  }

  if (messagesResult.error) {
    throw new Error(`Could not load DM messages: ${messagesResult.error.message}`);
  }

  const members = membersResult.data ?? [];
  const messages = messagesResult.data ?? [];
  const profiles = await loadDmProfilesDirect(members.map((member) => member.user_id));
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  const membersByThreadId = new Map<string, DmThreadMemberRow[]>();

  for (const member of members) {
    const threadMembers = membersByThreadId.get(member.thread_id) ?? [];
    threadMembers.push(member);
    membersByThreadId.set(member.thread_id, threadMembers);
  }

  const latestMessageByThreadId = new Map<string, DmMessageRow>();
  for (const message of messages) {
    if (!latestMessageByThreadId.has(message.thread_id)) {
      latestMessageByThreadId.set(message.thread_id, message);
    }
  }

  return (threadsResult.data ?? []).map((thread) => ({
    id: thread.id,
    createdAt: thread.created_at,
    updatedAt: thread.updated_at,
    members: (membersByThreadId.get(thread.id) ?? [])
      .map((member) => toMemberProfile(profilesById.get(member.user_id) ?? null))
      .filter((member): member is DmMemberProfile => Boolean(member)),
    latestMessage: toLatestMessagePreview(latestMessageByThreadId.get(thread.id) ?? null),
  })) satisfies DmThreadSummary[];
}

async function loadDmProfilesDirect(userIds: string[]) {
  const uniqueUserIds = [...new Set(userIds.map((userId) => userId.trim()).filter(Boolean))];
  if (uniqueUserIds.length === 0) {
    return [] as UserProfileRow[];
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("users")
    .select(USER_PROFILE_COLUMNS)
    .in("id", uniqueUserIds)
    .returns<UserProfileRow[]>();

  if (error) {
    throw new Error(`Could not load DM profiles: ${error.message}`);
  }

  return data ?? [];
}

async function getCurrentDmProfile() {
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  if (!user) {
    throw new Error("You must be signed in to use DMs.");
  }

  const users = supabase.from("users");
  const { data: existingByAuth, error: existingByAuthError } = await users
    .select(USER_PROFILE_COLUMNS)
    .eq("auth_user_id", user.id)
    .maybeSingle<UserProfileRow>();

  if (existingByAuthError) {
    throw existingByAuthError;
  }

  if (existingByAuth) {
    return existingByAuth;
  }

  const { data: legacyById, error: legacyByIdError } = await users
    .select(USER_PROFILE_COLUMNS)
    .eq("id", user.id)
    .maybeSingle<UserProfileRow>();

  if (legacyByIdError) {
    throw legacyByIdError;
  }

  if (legacyById) {
    const { data: updatedLegacy, error: updateError } = await users
      .update({
        auth_user_id: user.id,
        email: user.email ?? legacyById.email,
        updated_at: new Date().toISOString(),
      } satisfies TablesUpdate<"users">)
      .eq("id", legacyById.id)
      .select(USER_PROFILE_COLUMNS)
      .maybeSingle<UserProfileRow>();

    if (updateError) {
      throw updateError;
    }

    if (updatedLegacy) {
      return updatedLegacy;
    }
  }

  const { data: created, error: createError } = await users
    .insert({
      auth_user_id: user.id,
      email: user.email ?? null,
      avatar_url: DEFAULT_AVATAR_URL,
      configurations: {},
      display_name: readMetadataString(user.user_metadata.full_name) ??
        readMetadataString(user.user_metadata.name),
      username: normalizeUsername(readMetadataString(user.user_metadata.username)),
      updated_at: new Date().toISOString(),
    } satisfies TablesInsert<"users">)
    .select(USER_PROFILE_COLUMNS)
    .maybeSingle<UserProfileRow>();

  if (createError) {
    throw createError;
  }

  if (!created) {
    throw new Error("Could not create your DM profile.");
  }

  return created;
}

function toMemberProfile(profile: UserProfileRow | null): DmMemberProfile | null {
  if (!profile) {
    return null;
  }

  return {
    id: profile.id,
    auth_user_id: profile.auth_user_id,
    email: profile.email,
    username: profile.username,
    configurations: profile.configurations,
    display_name: profile.display_name,
    avatar_url: profile.avatar_url,
    updated_at: profile.updated_at,
    created_at: profile.created_at,
  };
}

function toLatestMessagePreview(message: DmMessageRow | null) {
  if (!message) {
    return null;
  }

  return {
    id: message.id,
    content: message.content,
    createdAt: message.created_at,
    senderId: message.sender_id,
  };
}

const USER_PROFILE_COLUMNS =
  "id,auth_user_id,email,username,configurations,display_name,avatar_url,updated_at,created_at";
const DEFAULT_AVATAR_URL =
  "https://xgfgqzveuyeceupfaebh.supabase.co/storage/v1/object/public/profile_pictures/default_user.png";

function readMetadataString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeUsername(value: string | null) {
  const normalized = value?.trim().toLowerCase() ?? null;
  if (!normalized || !/^[a-z0-9_-]{3,24}$/.test(normalized)) {
    return null;
  }

  return normalized;
}
