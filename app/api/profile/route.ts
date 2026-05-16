import { jsonError, jsonSuccess } from "@/lib/server/http";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

type ProfileRow = {
  id: string;
  auth_user_id: string | null;
  username: string | null;
  email: string | null;
  url: string | null;
  created_at: string;
};

type ProfileResponse = {
  id: string;
  username: string | null;
  email: string | null;
  needsUsername: boolean;
};

type ProfileRequestBody = {
  username?: unknown;
};

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,24}$/;

export async function GET(request: Request): Promise<Response> {
  try {
    const { userId, email } = await requireAuthUser(request);
    const profile = await ensureProfile(userId, email);

    return jsonSuccess(toProfileResponse(profile));
  } catch (error) {
    return handleProfileError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  let body: ProfileRequestBody;

  try {
    body = (await request.json()) as ProfileRequestBody;
  } catch {
    return jsonError("Request body must be valid JSON", 400);
  }

  const rawUsername = typeof body.username === "string" ? body.username : "";
  const username = normalizeUsername(rawUsername);

  if (!USERNAME_PATTERN.test(username)) {
    return jsonError(
      "Username must be 3-24 characters and use only letters, numbers, or underscores.",
      400,
    );
  }

  try {
    const { userId, email } = await requireAuthUser(request);
    const supabase = getSupabaseAdmin();
    await ensureProfile(userId, email);

    const { data: existingUsername, error: usernameError } = await supabase
      .from("users")
      .select("id")
      .eq("username", username)
      .neq("auth_user_id", userId)
      .maybeSingle<{ id: string }>();

    if (usernameError) {
      throw new Error(usernameError.message);
    }

    if (existingUsername) {
      return jsonError("That username is already taken.", 409);
    }

    const { data, error } = await supabase
      .from("users")
      .update({ username, email })
      .eq("auth_user_id", userId)
      .select("id, auth_user_id, username, email, url, created_at")
      .single<ProfileRow>();

    if (error) {
      throw new Error(error.message);
    }

    return jsonSuccess(toProfileResponse(data));
  } catch (error) {
    return handleProfileError(error);
  }
}

async function requireAuthUser(request: Request) {
  const token = getBearerToken(request);

  if (!token) {
    throw new ProfileAuthError();
  }

  const { data, error } = await getSupabaseAdmin().auth.getUser(token);

  if (error || !data.user) {
    throw new ProfileAuthError();
  }

  return {
    userId: data.user.id,
    email: data.user.email ?? null,
  };
}

async function ensureProfile(authUserId: string, email: string | null) {
  const supabase = getSupabaseAdmin();
  const { data: existingProfile, error: loadError } = await supabase
    .from("users")
    .select("id, auth_user_id, username, email, url, created_at")
    .eq("auth_user_id", authUserId)
    .maybeSingle<ProfileRow>();

  if (loadError) {
    throw new Error(loadError.message);
  }

  if (existingProfile) {
    if (email && existingProfile.email !== email) {
      const { data, error } = await supabase
        .from("users")
        .update({ email })
        .eq("id", existingProfile.id)
        .select("id, auth_user_id, username, email, url, created_at")
        .single<ProfileRow>();

      if (error) {
        throw new Error(error.message);
      }

      return data;
    }

    return existingProfile;
  }

  const { data, error } = await supabase
    .from("users")
    .insert({ auth_user_id: authUserId, email })
    .select("id, auth_user_id, username, email, url, created_at")
    .single<ProfileRow>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  const [scheme, token] = authorization?.split(" ") ?? [];

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}

function normalizeUsername(username: string) {
  return username.trim().replace(/^@+/, "").toLowerCase();
}

function toProfileResponse(profile: ProfileRow): ProfileResponse {
  return {
    id: profile.id,
    username: profile.username,
    email: profile.email,
    needsUsername: !profile.username,
  };
}

function handleProfileError(error: unknown) {
  if (error instanceof ProfileAuthError) {
    return jsonError("You must be signed in to manage your profile.", 401);
  }

  const message =
    error instanceof Error ? error.message : "Failed to manage profile";
  return jsonError(message, 500);
}

class ProfileAuthError extends Error {}
