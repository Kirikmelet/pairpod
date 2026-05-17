import 'server-only'

import { cookies } from 'next/headers'
import { createClient } from '@/utils/supabase/server'

export type UserProfile = {
  id: string
  email: string | null
  display_name: string | null
}

export async function getCurrentUserProfile(): Promise<UserProfile | null> {
  try {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
      return null
    }

    return {
      id: user.id,
      email: user.email ?? null,
      display_name:
        typeof user.user_metadata?.full_name === 'string'
          ? user.user_metadata.full_name.trim() || null
          : null,
    }
  } catch {
    return null
  }
}
