import { cookies } from "next/headers";
import {
  createClient as createSupabaseClient,
} from "@supabase/supabase-js";
import {
  DuplicateUsernameError,
  InvalidUsernameError,
  ensureUserProfile,
  toProfileResponse,
  updateUserProfile,
} from "@/lib/server/profile";
import { jsonError, jsonSuccess } from "@/lib/server/http";
import type { Database } from "@/utils/database.types";
import { getSupabasePublicConfig } from "@/utils/supabase/config";
import { createClient } from "@/utils/supabase/server";

export async function GET(): Promise<Response> {
  try {
    const { supabase, user } = await createAuthenticatedRouteClient();

    if (!user) {
      return jsonError("You must be signed in to view your profile.", 401);
    }

    const profile = await ensureUserProfile(supabase, user);
    return jsonSuccess(toProfileResponse(profile));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load profile.";
    return jsonError(message, 500);
  }
}

type PatchProfileRequestBody = {
  username?: unknown;
  displayName?: unknown;
  avatarUrl?: unknown;
};

export async function PATCH(request: Request): Promise<Response> {
  let body: PatchProfileRequestBody;

  try {
    body = (await request.json()) as PatchProfileRequestBody;
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  try {
    const { supabase, user } = await createAuthenticatedRouteClient(request);

    if (!user) {
      return jsonError("You must be signed in to update your profile.", 401);
    }

    const profile = await updateUserProfile(supabase, user, {
      username: readNullableString(body.username),
      displayName: readNullableString(body.displayName),
      avatarUrl: readNullableString(body.avatarUrl),
    });

    return jsonSuccess(toProfileResponse(profile));
  } catch (error) {
    if (error instanceof InvalidUsernameError) {
      return jsonError(error.message, 400);
    }

    if (error instanceof DuplicateUsernameError) {
      return jsonError(error.message, 409);
    }

    const message =
      error instanceof Error ? error.message : "Failed to update profile.";
    return jsonError(message, 500);
  }
}

export async function POST(): Promise<Response> {
  return jsonError("Profile setup is no longer required.", 410);
}

async function createAuthenticatedRouteClient(request?: Request) {
  const bearerToken = readBearerToken(request?.headers.get("authorization") ?? null);

  if (bearerToken) {
    const { url, key } = getSupabasePublicConfig("app/api/profile/route.ts");
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

function readNullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function readBearerToken(authorization: string | null) {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}
