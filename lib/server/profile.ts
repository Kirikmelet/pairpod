import "server-only";

import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  Json,
  Tables,
  TablesInsert,
  TablesUpdate,
} from "@/utils/database.types";
import { createClient } from "@/utils/supabase/server";

export type UserProfileRow = Pick<
  Tables<"users">,
  | "id"
  | "auth_user_id"
  | "email"
  | "username"
  | "configurations"
  | "avatar_url"
  | "display_name"
  | "updated_at"
>;

export type ProfileResponse = {
  id: string;
  email: string | null;
  username: string | null;
  displayName: string | null;
  avatarUrl: string;
};

export type ProfileUpdateInput = {
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
};

const USER_PROFILE_COLUMNS =
  "id,auth_user_id,email,username,configurations,avatar_url,display_name,updated_at";

export const DEFAULT_AVATAR_URL =
  "https://xgfgqzveuyeceupfaebh.supabase.co/storage/v1/object/public/profile_pictures/default_user.png";

const USERNAME_PATTERN = /^[a-z0-9_-]{3,24}$/;

export async function getCurrentUserProfile() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw new Error(`Failed to verify session: ${error.message}`);
  }

  if (!user) {
    return null;
  }

  return ensureUserProfile(supabase, user);
}

export async function loadUserProfiles(userIds: string[]) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return [];
  }

  const supabase = createClient(await cookies());
  const { data, error } = await supabase
    .from("users")
    .select(USER_PROFILE_COLUMNS)
    .in("id", uniqueIds)
    .returns<UserProfileRow[]>();

  if (error) {
    throw new Error(`Failed to load profiles: ${error.message}`);
  }

  return data ?? [];
}

export async function ensureUserProfile(
  supabase: SupabaseClient<Database>,
  authUser: User,
) {
  const existingByAuth = await loadUserByAuthId(supabase, authUser.id);
  if (existingByAuth) {
    return await syncUserProfileDefaults(supabase, existingByAuth, authUser);
  }

  const legacyById = await loadUserById(supabase, authUser.id);
  if (legacyById) {
    return await syncUserProfileDefaults(supabase, legacyById, authUser, {
      auth_user_id: authUser.id,
    });
  }

  const seed = buildProfileSeed(authUser);
  const insertPayload: TablesInsert<"users"> = {
    auth_user_id: authUser.id,
    email: authUser.email ?? null,
    username: seed.username,
    display_name: seed.display_name,
    avatar_url: seed.avatar_url,
    configurations: seed.configurations,
  };

  const { data, error } = await supabase
    .from("users")
    .insert(insertPayload)
    .select(USER_PROFILE_COLUMNS)
    .single<UserProfileRow>();

  if (error) {
    throw new Error(`Failed to create profile: ${error.message}`);
  }

  return data;
}

export async function updateUserProfile(
  supabase: SupabaseClient<Database>,
  authUser: User,
  input: ProfileUpdateInput,
) {
  const currentProfile = await ensureUserProfile(supabase, authUser);
  const nextConfiguration = readConfiguration(currentProfile.configurations);
  const patch: TablesUpdate<"users"> = {
    updated_at: new Date().toISOString(),
  };

  if (Object.prototype.hasOwnProperty.call(input, "username")) {
    patch.username = normalizeUsername(input.username);
  }

  if (Object.prototype.hasOwnProperty.call(input, "displayName")) {
    patch.display_name = normalizeOptionalText(input.displayName);
    nextConfiguration.displayName = patch.display_name;
  }

  if (Object.prototype.hasOwnProperty.call(input, "avatarUrl")) {
    patch.avatar_url = normalizeOptionalText(input.avatarUrl);
  }

  patch.configurations = nextConfiguration;
  patch.email = authUser.email ?? currentProfile.email;
  patch.auth_user_id = currentProfile.auth_user_id ?? authUser.id;

  const { data, error } = await supabase
    .from("users")
    .update(patch)
    .eq("id", currentProfile.id)
    .select(USER_PROFILE_COLUMNS)
    .single<UserProfileRow>();

  if (error) {
    if (
      isUniqueViolation(error, [
        "users_username_key",
        "users_username_lower_unique_idx",
        "username",
      ])
    ) {
      throw new DuplicateUsernameError();
    }

    throw new Error(`Failed to update profile: ${error.message}`);
  }

  return data;
}

export function toProfileResponse(profile: UserProfileRow): ProfileResponse {
  const configuration = readConfiguration(profile.configurations);

  return {
    id: profile.id,
    email: profile.email ?? null,
    username: normalizeOptionalText(profile.username),
    displayName:
      normalizeOptionalText(profile.display_name) ?? configuration.displayName,
    avatarUrl: normalizeOptionalText(profile.avatar_url) ?? DEFAULT_AVATAR_URL,
  };
}

export function normalizeUsername(value: string | null | undefined) {
  const normalized = normalizeOptionalText(value)?.toLowerCase() ?? null;
  if (!normalized) {
    return null;
  }

  if (!USERNAME_PATTERN.test(normalized)) {
    throw new InvalidUsernameError();
  }

  return normalized;
}

export class InvalidUsernameError extends Error {
  constructor() {
    super(
      "Username must be 3-24 characters and use only lowercase letters, numbers, underscores, or hyphens.",
    );
    this.name = "InvalidUsernameError";
  }
}

export class DuplicateUsernameError extends Error {
  constructor() {
    super("That username is already in use.");
    this.name = "DuplicateUsernameError";
  }
}

async function loadUserByAuthId(
  supabase: SupabaseClient<Database>,
  authUserId: string,
) {
  const { data, error } = await supabase
    .from("users")
    .select(USER_PROFILE_COLUMNS)
    .eq("auth_user_id", authUserId)
    .maybeSingle<UserProfileRow>();

  if (error) {
    throw new Error(`Failed to load profile: ${error.message}`);
  }

  return data;
}

async function loadUserById(supabase: SupabaseClient<Database>, id: string) {
  const { data, error } = await supabase
    .from("users")
    .select(USER_PROFILE_COLUMNS)
    .eq("id", id)
    .maybeSingle<UserProfileRow>();

  if (error) {
    throw new Error(`Failed to load profile: ${error.message}`);
  }

  return data;
}

async function syncUserProfileDefaults(
  supabase: SupabaseClient<Database>,
  profile: UserProfileRow,
  authUser: User,
  extraPatch: TablesUpdate<"users"> = {},
) {
  const seed = buildProfileSeed(authUser);
  const configuration = readConfiguration(profile.configurations);
  let shouldUpdate = false;
  const patch: TablesUpdate<"users"> = {
    ...extraPatch,
  };

  if ((patch.auth_user_id ?? profile.auth_user_id) !== authUser.id) {
    patch.auth_user_id = authUser.id;
    shouldUpdate = true;
  }

  if ((profile.email ?? null) !== (authUser.email ?? null)) {
    patch.email = authUser.email ?? null;
    shouldUpdate = true;
  }

  if (!normalizeOptionalText(profile.display_name) && seed.display_name) {
    patch.display_name = seed.display_name;
    shouldUpdate = true;
  }

  if (!normalizeOptionalText(profile.avatar_url) && seed.avatar_url) {
    patch.avatar_url = seed.avatar_url;
    shouldUpdate = true;
  }

  if (!configuration.displayName && seed.display_name) {
    configuration.displayName = seed.display_name;
    patch.configurations = configuration;
    shouldUpdate = true;
  }

  if (!shouldUpdate) {
    return profile;
  }

  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("users")
    .update(patch)
    .eq("id", profile.id)
    .select(USER_PROFILE_COLUMNS)
    .single<UserProfileRow>();

  if (error) {
    throw new Error(`Failed to sync profile: ${error.message}`);
  }

  return data;
}

function buildProfileSeed(authUser: User) {
  const displayName =
    normalizeOptionalText(authUser.user_metadata?.full_name) ??
    normalizeOptionalText(authUser.user_metadata?.name);

  return {
    username: safeMetadataUsername(authUser.user_metadata?.username),
    display_name: displayName,
    avatar_url:
      normalizeOptionalText(authUser.user_metadata?.avatar_url) ?? DEFAULT_AVATAR_URL,
    configurations: {
      displayName,
    } as Json,
  };
}

function safeMetadataUsername(value: unknown) {
  try {
    return normalizeUsername(typeof value === "string" ? value : null);
  } catch {
    return null;
  }
}

function readConfiguration(configurations: Json) {
  if (configurations && typeof configurations === "object" && !Array.isArray(configurations)) {
    const displayName = configurations.displayName;
    return {
      ...configurations,
      displayName: typeof displayName === "string" ? displayName.trim() || null : null,
    };
  }

  return { displayName: null as string | null };
}

function normalizeOptionalText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

function isUniqueViolation(error: unknown, matchers: string[]) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { code?: string; message?: string; details?: string };
  const haystack = `${candidate.message ?? ""} ${candidate.details ?? ""}`.toLowerCase();
  return (
    candidate.code === "23505" &&
    matchers.some((matcher) => haystack.includes(matcher.toLowerCase()))
  );
}
