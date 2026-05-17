import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/utils/database.types'

function getAdminConfig() {
  const url =
    process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || ''
  const key = (
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )?.trim() || ''

  if (!url || !key) {
    throw new Error(
      'lib/server/supabaseAdmin.ts requires SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY).',
    )
  }

  return { url, key }
}

function createAdminClient(): SupabaseClient<Database> {
  const { url, key } = getAdminConfig()
  return createClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  })
}

let adminClient: SupabaseClient<Database> | null = null

export function getSupabaseAdmin(): SupabaseClient<Database> {
  adminClient ??= createAdminClient()
  return adminClient
}

export const supabaseAdmin = new Proxy({} as SupabaseClient<Database>, {
  get(_target, property, receiver) {
    return Reflect.get(getSupabaseAdmin(), property, receiver)
  },
}) as SupabaseClient<Database>
