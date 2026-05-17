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
type VoteDelta = 1 | -1 | 0;

type VoteRow = {
  id: string;
  likes: number;
};

type VoteRpcClient = {
  rpc(
    fn: "increment_post_likes",
    args: { p_post_id: string; p_delta: number },
  ): Promise<{ data: VoteRow[] | null; error: Error | null }>;
  rpc(
    fn: "increment_comment_likes",
    args: { p_comment_id: string; p_delta: number },
  ): Promise<{ data: VoteRow[] | null; error: Error | null }>;
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
  const delta = readDelta(body.delta);

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
  delta: VoteDelta,
) {
  const { data, error } = await (
    supabase as unknown as VoteRpcClient
  ).rpc("increment_post_likes", {
    p_post_id: id,
    p_delta: delta,
  });

  if (error) {
    throw new Error(`Failed to update post vote: ${error.message}`);
  }

  const row = data?.[0];
  if (!row) {
    throw new Error("Could not update post vote.");
  }

  return row;
}

async function updateCommentVote(
  supabase: SupabaseClient<Database>,
  id: string,
  delta: VoteDelta,
) {
  const { data, error } = await (
    supabase as unknown as VoteRpcClient
  ).rpc("increment_comment_likes", {
    p_comment_id: id,
    p_delta: delta,
  });

  if (error) {
    throw new Error(`Failed to update comment vote: ${error.message}`);
  }

  const row = data?.[0];
  if (!row) {
    throw new Error("Could not update comment vote.");
  }

  return row;
}

function readTarget(value: unknown): VoteTarget | null {
  return value === "post" || value === "comment" ? value : null;
}

function readDelta(value: unknown): VoteDelta | null {
  return value === 1 || value === -1 || value === 0 ? value : null;
}

function readBearerToken(authorization: string | null) {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}
