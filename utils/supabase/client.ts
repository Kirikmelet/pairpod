import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { getSupabasePublicConfig } from "./config";

export type AppDatabase = Omit<Database, "__InternalSupabase">;

export const createClient = () => {
  const { url, key } = getSupabasePublicConfig(
    "utils/supabase/client.ts createClient()",
  );

  return createSupabaseClient<AppDatabase>(url, key);
};
