import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "../database.types";
import { getSupabasePublicConfig } from "./config";

export const createClient = (
  cookieStore: Awaited<ReturnType<typeof cookies>>,
): SupabaseClient<Database> => {
  const { url, key } = getSupabasePublicConfig(
    "utils/supabase/server.ts createClient()",
  );

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // The `setAll` method was called from a Server Component.
            // This can be ignored if you have proxy refreshing
          // user sessions.
        }
      },
    },
  }) as unknown as SupabaseClient<Database>;
};
