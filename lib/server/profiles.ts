import "server-only";

import { cookies } from "next/headers";
import type { Json } from "@/utils/database.types";
import { createClient } from "@/utils/supabase/server";

export type UserProfileRow = {
  id: string;
  email: string | null;
  username: string | null;
  configurations: Json;
  avatar_url: string | null;
};

type MutableUsersTable = {
  select(columns: string): {
    eq(column: string, value: string): {
      limit(count: number): Promise<{ data: UserProfileRow[] | null; error: Error | null }>;
    };
    in(column: string, value: string[]): Promise<{
      data: UserProfileRow[] | null;
      error: Error | null;
    }>;
  };
  upsert(
    value: Partial<UserProfileRow> & { id: string },
    options?: { onConflict?: string },
  ): Promise<{ data: unknown; error: Error | null }>;
};

const USER_PROFILE_COLUMNS = "id,email,username,configurations,avatar_url";
const DEFAULT_AVATAR_URL =
  "https://xgfgqzveuyeceupfaebh.supabase.co/storage/v1/object/public/profile_pictures/default_user.png";

export async function getCurrentUserProfile() {
  const supabase = createClient(await cookies());
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
    throw new Error(`Failed to load profile: ${error.message}`);
  }

  if (data?.[0]) {
    return data[0];
  }

  const profile: UserProfileRow = {
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
    throw new Error(`Failed to create profile: ${upsertError.message}`);
  }

  return profile;
}

export async function loadUserProfiles(userIds: string[]) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return [];
  }

  const supabase = createClient(await cookies());
  const users = supabase.from("users") as unknown as MutableUsersTable;
  const { data, error } = await users.select(USER_PROFILE_COLUMNS).in("id", uniqueIds);

  if (error) {
    throw new Error(`Failed to load profiles: ${error.message}`);
  }

  return data ?? [];
}

function readMetadataString(value: unknown) {
  return typeof value === "string" ? value.trim() : null;
}
