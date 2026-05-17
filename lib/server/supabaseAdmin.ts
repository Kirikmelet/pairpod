import 'server-only'

import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/utils/database.types'

function getSupabaseAdminConfig() {
  const url =
    process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || ''
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || ''

  if (!url || !serviceRoleKey) {
    throw new Error(
      'lib/server/supabaseAdmin.ts requires SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.',
    )
  }

  return {
    url,
    serviceRoleKey,
  }
}

const { url, serviceRoleKey } = getSupabaseAdminConfig()

export const supabaseAdmin: SupabaseClient<Database> = createClient<Database>(url, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})
