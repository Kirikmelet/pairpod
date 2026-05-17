import { cookies } from "next/headers";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { jsonError, jsonSuccess } from "@/lib/server/http";
import { toProfileResponse, updateUserProfile } from "@/lib/server/profile";
import { createAdminClient } from "@/utils/supabase/admin";
import type { Database } from "@/utils/database.types";
import { getSupabasePublicConfig } from "@/utils/supabase/config";
import { createClient } from "@/utils/supabase/server";

const AVATAR_BUCKET = "avatars";
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export async function POST(request: Request): Promise<Response> {
  try {
    const { supabase, user } = await createAuthenticatedRouteClient(request);

    if (!user) {
      return jsonError("You must be signed in to update your avatar.", 401);
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return jsonError("Avatar file is required.", 400);
    }

    if (file.type !== "image/png") {
      return jsonError("Avatar must be a PNG image.", 400);
    }

    if (file.size <= 0 || file.size > AVATAR_MAX_BYTES) {
      return jsonError("Avatar must be a non-empty PNG under 2 MB.", 400);
    }

    const storagePath = `${user.id}/avatar.png`;
    const admin = createAdminClient();
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await admin.storage
      .from(AVATAR_BUCKET)
      .upload(storagePath, fileBuffer, {
        upsert: true,
        contentType: "image/png",
        cacheControl: "3600",
      });

    if (uploadError) {
      throw new Error(`Failed to upload avatar: ${uploadError.message}`);
    }

    const { data } = admin.storage.from(AVATAR_BUCKET).getPublicUrl(storagePath);
    const avatarUrl = `${data.publicUrl}?v=${Date.now()}`;
    const profile = await updateUserProfile(supabase, user, { avatarUrl });

    return jsonSuccess(toProfileResponse(profile));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to upload avatar.";
    return jsonError(message, 500);
  }
}

async function createAuthenticatedRouteClient(request: Request) {
  const bearerToken = readBearerToken(request.headers.get("authorization"));

  if (bearerToken) {
    const { url, key } = getSupabasePublicConfig("app/api/profile/avatar/route.ts");
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

function readBearerToken(authorization: string | null) {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}
