import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/utils/database.types";
import { getSupabaseServiceRoleConfig } from "@/utils/supabase/config";

export function createAdminClient() {
  const { url, key } = getSupabaseServiceRoleConfig(
    "utils/supabase/admin.ts createAdminClient()",
  );

  return createClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
