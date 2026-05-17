"use client";

import { createClient } from "@/utils/supabase/client";
import {
  DEFAULT_AVATAR_URL,
  getDisplayName,
  type UserProfileRecord,
} from "@/lib/client/page-api";

const USER_PROFILE_COLUMNS =
  "id,auth_user_id,email,username,configurations,display_name,avatar_url,updated_at,created_at";

export async function loadPublicUserProfile(userId: string) {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    throw new Error("User id is required.");
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("users")
    .select(USER_PROFILE_COLUMNS)
    .eq("id", normalizedUserId)
    .maybeSingle<UserProfileRecord>();

  if (error) {
    throw new Error(`Could not load user profile: ${error.message}`);
  }

  if (!data) {
    throw new Error("User profile was not found.");
  }

  return data;
}

export function getUserProfilePath(userId: string | null | undefined) {
  if (!userId) {
    return null;
  }

  const pathname = `/users/${encodeURIComponent(userId)}`;
  if (isExtensionRuntime()) {
    return `#${pathname}`;
  }

  return pathname;
}

export function getPublicProfileDisplayName(profile: UserProfileRecord | null) {
  if (!profile) {
    return "Unknown user";
  }

  return getDisplayName(profile.id, { [profile.id]: profile });
}

export function getPublicProfileAvatar(profile: UserProfileRecord | null) {
  return profile?.avatar_url || DEFAULT_AVATAR_URL;
}

function isExtensionRuntime() {
  const globalWithExtensionApis = globalThis as typeof globalThis & {
    browser?: { runtime?: { id?: string } };
    chrome?: { runtime?: { id?: string } };
  };
  const runtime = globalWithExtensionApis.browser ?? globalWithExtensionApis.chrome;

  return Boolean(runtime?.runtime?.id);
}
