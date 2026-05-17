import "server-only";

import { cookies } from "next/headers";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { ensureUserProfile, loadUserProfiles, type UserProfileRow } from "@/lib/server/profile";
import type { Database, Tables, TablesInsert, TablesUpdate } from "@/utils/database.types";
import { getSupabasePublicConfig } from "@/utils/supabase/config";
import { createClient } from "@/utils/supabase/server";

type DmThreadRow = Tables<"dm_threads">;
type DmThreadMemberRow = Tables<"dm_thread_members">;
type DmMessageRow = Tables<"dm_messages">;

export type DmMemberProfile = Pick<
  UserProfileRow,
  "id" | "username" | "display_name" | "avatar_url"
>;

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

export type DmMessageResponse = {
  id: string;
  threadId: string;
  content: string;
  createdAt: string;
  sender: DmMemberProfile | null;
};

export class AuthRequiredError extends Error {
  constructor(message = "You must be signed in.") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "You do not have access to this thread.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "Not found.") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export async function listCurrentUserDmThreads(request?: Request) {
  const { supabase, profile } = await requireDmContext(request);
  const { data: memberships, error: membershipsError } = await supabase
    .from("dm_thread_members")
    .select("thread_id")
    .eq("user_id", profile.id)
    .returns<Array<Pick<DmThreadMemberRow, "thread_id">>>();

  if (membershipsError) {
    throw new Error(`Failed to load DM memberships: ${membershipsError.message}`);
  }

  const threadIds = [...new Set((memberships ?? []).map((row) => row.thread_id))];
  if (threadIds.length === 0) {
    return [];
  }

  return loadThreadSummariesByIds(supabase, threadIds);
}

export async function createOrGetDirectThread(
  request: Request | undefined,
  recipientUserId: string,
) {
  const { supabase, profile } = await requireDmContext(request);
  const normalizedRecipientUserId = recipientUserId.trim();

  if (!normalizedRecipientUserId) {
    throw new ValidationError("recipientUserId is required.");
  }

  if (normalizedRecipientUserId === profile.id) {
    throw new ValidationError("You cannot start a DM with yourself.");
  }

  const { data: recipient, error: recipientError } = await supabase
    .from("users")
    .select("id")
    .eq("id", normalizedRecipientUserId)
    .maybeSingle<Pick<UserProfileRow, "id">>();

  if (recipientError) {
    throw new Error(`Failed to load recipient: ${recipientError.message}`);
  }

  if (!recipient) {
    throw new NotFoundError("Recipient user not found.");
  }

  const existingThreadId = await findExistingOneOnOneThreadId(
    supabase,
    profile.id,
    normalizedRecipientUserId,
  );

  if (existingThreadId) {
    return await loadThreadSummaryById(supabase, existingThreadId);
  }

  const now = new Date().toISOString();
  const threadPayload: TablesInsert<"dm_threads"> = {
    created_by: profile.id,
    updated_at: now,
  };

  const { data: thread, error: threadError } = await supabase
    .from("dm_threads")
    .insert(threadPayload)
    .select("*")
    .single<DmThreadRow>();

  if (threadError) {
    throw new Error(`Failed to create DM thread: ${threadError.message}`);
  }

  const memberPayload: TablesInsert<"dm_thread_members">[] = [
    { thread_id: thread.id, user_id: profile.id },
    { thread_id: thread.id, user_id: normalizedRecipientUserId },
  ];
  const { error: membersError } = await supabase
    .from("dm_thread_members")
    .insert(memberPayload);

  if (membersError) {
    throw new Error(`Failed to create DM members: ${membersError.message}`);
  }

  return await loadThreadSummaryById(supabase, thread.id);
}

export async function listThreadMessages(request: Request | undefined, threadId: string) {
  const { supabase, profile } = await requireDmContext(request);
  const normalizedThreadId = threadId.trim();

  if (!normalizedThreadId) {
    throw new ValidationError("threadId is required.");
  }

  await assertThreadAccess(supabase, normalizedThreadId, profile.id);

  const { data: messages, error: messagesError } = await supabase
    .from("dm_messages")
    .select("*")
    .eq("thread_id", normalizedThreadId)
    .order("created_at", { ascending: true })
    .returns<DmMessageRow[]>();

  if (messagesError) {
    throw new Error(`Failed to load DM messages: ${messagesError.message}`);
  }

  const senderProfiles = await loadUserProfiles(
    (messages ?? [])
      .map((message) => message.sender_id)
      .filter((senderId): senderId is string => Boolean(senderId)),
  );
  const senderProfilesById = new Map(
    senderProfiles.map((senderProfile) => [senderProfile.id, senderProfile]),
  );

  return (messages ?? []).map((message) => ({
    id: message.id,
    threadId: message.thread_id,
    content: message.content,
    createdAt: message.created_at,
    sender: message.sender_id
      ? toMemberProfile(senderProfilesById.get(message.sender_id) ?? null)
      : null,
  })) satisfies DmMessageResponse[];
}

export async function createThreadMessage(
  request: Request | undefined,
  threadId: string,
  content: string,
) {
  const { supabase, profile } = await requireDmContext(request);
  const normalizedThreadId = threadId.trim();
  const trimmedContent = content.trim();

  if (!normalizedThreadId) {
    throw new ValidationError("threadId is required.");
  }

  if (!trimmedContent) {
    throw new ValidationError("content is required.");
  }

  await assertThreadAccess(supabase, normalizedThreadId, profile.id);

  const { data: message, error: messageError } = await supabase
    .from("dm_messages")
    .insert({
      thread_id: normalizedThreadId,
      sender_id: profile.id,
      content: trimmedContent,
    } satisfies TablesInsert<"dm_messages">)
    .select("*")
    .single<DmMessageRow>();

  if (messageError) {
    throw new Error(`Failed to create DM message: ${messageError.message}`);
  }

  const { error: threadUpdateError } = await supabase
    .from("dm_threads")
    .update({
      updated_at: new Date().toISOString(),
    } satisfies TablesUpdate<"dm_threads">)
    .eq("id", normalizedThreadId);

  if (threadUpdateError) {
    throw new Error(`Failed to update DM thread activity: ${threadUpdateError.message}`);
  }

  return {
    id: message.id,
    threadId: message.thread_id,
    content: message.content,
    createdAt: message.created_at,
    sender: toMemberProfile(profile),
  } satisfies DmMessageResponse;
}

async function requireDmContext(request?: Request) {
  const { supabase, user } = await createAuthenticatedRouteClient(request);
  if (!user) {
    throw new AuthRequiredError();
  }

  const profile = await ensureUserProfile(supabase, user);
  return { supabase, user, profile };
}

async function createAuthenticatedRouteClient(request?: Request) {
  const bearerToken = readBearerToken(request?.headers.get("authorization") ?? null);

  if (bearerToken) {
    const { url, key } = getSupabasePublicConfig("lib/server/dms.ts");
    const supabase = createSupabaseClient<Database>(url, key, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${bearerToken}`,
        },
      },
    });
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(bearerToken);

    if (error) {
      throw new Error(`Failed to verify session: ${error.message}`);
    }

    return { supabase, user };
  }

  const supabase = createClient(await cookies());
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw new Error(`Failed to verify session: ${error.message}`);
  }

  return { supabase, user };
}

async function findExistingOneOnOneThreadId(
  supabase: SupabaseClient<Database>,
  currentUserId: string,
  recipientUserId: string,
) {
  const { data: candidateMemberships, error: candidateMembershipsError } = await supabase
    .from("dm_thread_members")
    .select("thread_id,user_id")
    .in("user_id", [currentUserId, recipientUserId])
    .returns<Array<Pick<DmThreadMemberRow, "thread_id" | "user_id">>>();

  if (candidateMembershipsError) {
    throw new Error(
      `Failed to load existing DM memberships: ${candidateMembershipsError.message}`,
    );
  }

  const memberIdsByThreadId = new Map<string, Set<string>>();
  for (const membership of candidateMemberships ?? []) {
    const threadMembers = memberIdsByThreadId.get(membership.thread_id) ?? new Set<string>();
    threadMembers.add(membership.user_id);
    memberIdsByThreadId.set(membership.thread_id, threadMembers);
  }

  const matchingThreadIds = [...memberIdsByThreadId.entries()]
    .filter(([, memberIds]) => memberIds.has(currentUserId) && memberIds.has(recipientUserId))
    .map(([threadId]) => threadId);

  if (matchingThreadIds.length === 0) {
    return null;
  }

  const { data: allMembers, error: allMembersError } = await supabase
    .from("dm_thread_members")
    .select("thread_id,user_id")
    .in("thread_id", matchingThreadIds)
    .returns<Array<Pick<DmThreadMemberRow, "thread_id" | "user_id">>>();

  if (allMembersError) {
    throw new Error(`Failed to verify existing DM thread: ${allMembersError.message}`);
  }

  const fullMembersByThreadId = new Map<string, Set<string>>();
  for (const membership of allMembers ?? []) {
    const threadMembers = fullMembersByThreadId.get(membership.thread_id) ?? new Set<string>();
    threadMembers.add(membership.user_id);
    fullMembersByThreadId.set(membership.thread_id, threadMembers);
  }

  const exactMatchingThreadIds = [...fullMembersByThreadId.entries()]
    .filter(([, memberIds]) => {
      return (
        memberIds.size === 2 &&
        memberIds.has(currentUserId) &&
        memberIds.has(recipientUserId)
      );
    })
    .map(([threadId]) => threadId);

  if (exactMatchingThreadIds.length === 0) {
    return null;
  }

  const { data: threads, error: threadsError } = await supabase
    .from("dm_threads")
    .select("id,updated_at")
    .in("id", exactMatchingThreadIds)
    .order("updated_at", { ascending: false })
    .returns<Array<Pick<DmThreadRow, "id" | "updated_at">>>();

  if (threadsError) {
    throw new Error(`Failed to load existing DM thread: ${threadsError.message}`);
  }

  return threads?.[0]?.id ?? null;
}

async function assertThreadAccess(
  supabase: SupabaseClient<Database>,
  threadId: string,
  userId: string,
) {
  const { data: thread, error: threadError } = await supabase
    .from("dm_threads")
    .select("id")
    .eq("id", threadId)
    .maybeSingle<Pick<DmThreadRow, "id">>();

  if (threadError) {
    throw new Error(`Failed to load DM thread: ${threadError.message}`);
  }

  if (!thread) {
    throw new NotFoundError("DM thread not found.");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("dm_thread_members")
    .select("thread_id")
    .eq("thread_id", threadId)
    .eq("user_id", userId)
    .maybeSingle<Pick<DmThreadMemberRow, "thread_id">>();

  if (membershipError) {
    throw new Error(`Failed to verify DM thread membership: ${membershipError.message}`);
  }

  if (!membership) {
    throw new ForbiddenError();
  }
}

async function loadThreadSummaryById(
  supabase: SupabaseClient<Database>,
  threadId: string,
) {
  const summaries = await loadThreadSummariesByIds(supabase, [threadId]);
  const summary = summaries[0];

  if (!summary) {
    throw new NotFoundError("DM thread not found.");
  }

  return summary;
}

async function loadThreadSummariesByIds(
  supabase: SupabaseClient<Database>,
  threadIds: string[],
) {
  const uniqueThreadIds = [...new Set(threadIds.filter(Boolean))];
  if (uniqueThreadIds.length === 0) {
    return [];
  }

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
    throw new Error(`Failed to load DM threads: ${threadsResult.error.message}`);
  }

  if (membersResult.error) {
    throw new Error(`Failed to load DM thread members: ${membersResult.error.message}`);
  }

  if (messagesResult.error) {
    throw new Error(`Failed to load DM messages: ${messagesResult.error.message}`);
  }

  const members = membersResult.data ?? [];
  const messages = messagesResult.data ?? [];
  const memberUserIds = [...new Set(members.map((member) => member.user_id))];
  const profiles = await loadUserProfiles(memberUserIds);
  const profilesById = new Map(profiles.map((loadedProfile) => [loadedProfile.id, loadedProfile]));

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

function toMemberProfile(profile: UserProfileRow | null): DmMemberProfile | null {
  if (!profile) {
    return null;
  }

  return {
    id: profile.id,
    username: profile.username ?? null,
    display_name: profile.display_name ?? null,
    avatar_url: profile.avatar_url ?? null,
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

function readBearerToken(authorization: string | null) {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}
