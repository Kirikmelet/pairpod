import "server-only";

import { cookies } from "next/headers";
import {
  createClient as createSupabaseClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import type { Database } from "@/utils/database.types";
import { getSupabasePublicConfig } from "@/utils/supabase/config";
import { createClient } from "@/utils/supabase/server";

export type AuthenticatedRouteClient = {
  supabase: SupabaseClient<Database>;
  user: User | null;
};

export async function createAuthenticatedRouteClient(
  request?: Request,
  caller = "createAuthenticatedRouteClient",
): Promise<AuthenticatedRouteClient> {
  const bearerToken = readBearerToken(
    request?.headers.get("authorization") ?? null,
  );

  if (bearerToken) {
    const { url, key } = getSupabasePublicConfig(caller);
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
