import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

export type AppDatabase = Omit<Database, "__InternalSupabase">;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const createClient = () =>
  createSupabaseClient<AppDatabase>(supabaseUrl!, supabaseKey!);
