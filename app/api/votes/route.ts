import { cookies } from "next/headers";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { jsonError, jsonSuccess } from "@/lib/server/http";
import type { Database } from "@/utils/database.types";
import { getSupabasePublicConfig } from "@/utils/supabase/config";
import { createClient } from "@/utils/supabase/server";

type VoteRequestBody = {
  target?: unknown;
  id?: unknown;
  delta?: unknown;
};

type VoteTarget = "post" | "comment";

type VoteRow = {
  id: string;
  likes: number;
};

export async function POST(request: Request): Promise<Response> {
  let body: VoteRequestBody;

  try {
    body = (await request.json()) as VoteRequestBody;
  } catch {
    return jsonError("Request body must be valid JSON", 400);
  }

  const target = readTarget(body.target);
  const id = typeof body.id === "string" ? body.id.trim() : "";
  const delta = body.delta === 1 || body.delta === -1 ? body.delta : null;

  if (!target || !id || delta === null) {
    return jsonError("target, id, and delta are required", 400);
  }

  try {
    const { supabase, user } = await createAuthenticatedRouteClient(request);

    if (!user) {
      return jsonError("You must be signed in to vote", 401);
    }

    const data =
      target === "post"
        ? await updatePostVote(supabase, id, delta)
        : await updateCommentVote(supabase, id, delta);

    return jsonSuccess(data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update vote";
    return jsonError(message, 500);
  }
}

async function createAuthenticatedRouteClient(request: Request) {
  const bearerToken = readBearerToken(request.headers.get("authorization"));

  if (bearerToken) {
    const { url, key } = getSupabasePublicConfig("app/api/votes/route.ts");
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
      error: userError,
    } = await supabase.auth.getUser(bearerToken);

    if (userError) {
      throw new Error(`Failed to verify session: ${userError.message}`);
    }

    return { supabase, user };
  }

  const supabase = createClient(await cookies());
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(`Failed to verify session: ${userError.message}`);
  }

  return { supabase, user };
}

async function updatePostVote(
  supabase: SupabaseClient<Database>,
  id: string,
  delta: 1 | -1,
) {
  const { data: existing, error: loadError } = await supabase
    .from("posts")
    .select("id,likes")
    .eq("id", id)
    .single<VoteRow>();

  if (loadError) {
    throw new Error(`Failed to load post: ${loadError.message}`);
  }

  const nextLikes = Math.max(0, existing.likes + delta);
  const { data, error } = await supabase
    .from("posts")
    .update({ likes: nextLikes })
    .eq("id", id)
    .select("id,likes")
    .single<VoteRow>();

  if (error) {
    throw new Error(`Failed to update post vote: ${error.message}`);
  }

  return data;
}

async function updateCommentVote(
  supabase: SupabaseClient<Database>,
  id: string,
  delta: 1 | -1,
) {
  const { data: existing, error: loadError } = await supabase
    .from("comments")
    .select("id,likes")
    .eq("id", id)
    .single<VoteRow>();

  if (loadError) {
    throw new Error(`Failed to load comment: ${loadError.message}`);
  }

  const nextLikes = Math.max(0, existing.likes + delta);
  const { data, error } = await supabase
    .from("comments")
    .update({ likes: nextLikes })
    .eq("id", id)
    .select("id,likes")
    .single<VoteRow>();

  if (error) {
    throw new Error(`Failed to update comment vote: ${error.message}`);
  }

  return data;
}

function readTarget(value: unknown): VoteTarget | null {
  return value === "post" || value === "comment" ? value : null;
}

function readBearerToken(authorization: string | null) {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}
