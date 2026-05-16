import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "../database.types";
import { getSupabasePublicConfig } from "./config";

type AppDatabase = Omit<Database, "__InternalSupabase">;

export const createClient = (
  cookieStore: Awaited<ReturnType<typeof cookies>>,
) => {
  const { url, key } = getSupabasePublicConfig(
    "utils/supabase/server.ts createClient()",
  );

  return createServerClient<AppDatabase, "public">(url, key, {
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
  });
};
