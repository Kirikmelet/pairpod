import { cookies } from 'next/headers'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import {
  ProfileError,
  createUserProfileIfMissing,
  ensureUserProfile,
  toProfileResponse,
  updateUserProfile,
} from '@/lib/server/profile'
import { jsonError, jsonSuccess } from '@/lib/server/http'
import type { Database } from '@/utils/database.types'
import { getSupabasePublicConfig } from '@/utils/supabase/config'
import { createClient } from '@/utils/supabase/server'

type ProfilePatchBody = {
  username?: unknown
  displayName?: unknown
  avatarUrl?: unknown
}

export async function GET(request: Request): Promise<Response> {
  try {
    const bearerToken = readBearerToken(request.headers.get('authorization'))

    if (bearerToken) {
      const { supabase, user } = await createAuthenticatedRouteClient(request)
      if (!user) {
        throw new ProfileError('You must be signed in to view your profile.', 401, 'UNAUTHORIZED')
      }

      const profile = await ensureUserProfile(supabase, user)
      return jsonSuccess(toProfileResponse(profile))
    }

    const profile = await createUserProfileIfMissing()
    return jsonSuccess(toProfileResponse(profile))
  } catch (error) {
    return handleProfileRouteError(error, 'Failed to load profile')
  }
}

export async function PATCH(request: Request): Promise<Response> {
  let body: ProfilePatchBody

  try {
    body = (await request.json()) as ProfilePatchBody
  } catch {
    return jsonError('Request body must be valid JSON.', 400)
  }

  try {
    const bearerToken = readBearerToken(request.headers.get('authorization'))

    if (bearerToken) {
      const { supabase, user } = await createAuthenticatedRouteClient(request)
      if (!user) {
        throw new ProfileError(
          'You must be signed in to update your profile.',
          401,
          'UNAUTHORIZED',
        )
      }

      const profile = await updateUserProfile(supabase, user, {
        username: readNullableString(body.username),
        displayName: readNullableString(body.displayName),
        avatarUrl: readNullableString(body.avatarUrl),
      })

      return jsonSuccess(toProfileResponse(profile))
    }

    const profile = await updateUserProfile({
      username: readNullableString(body.username),
      displayName: readNullableString(body.displayName),
      avatarUrl: readNullableString(body.avatarUrl),
    })
    return jsonSuccess(toProfileResponse(profile))
  } catch (error) {
    return handleProfileRouteError(error, 'Failed to update profile')
  }
}

export async function POST(): Promise<Response> {
  return jsonError('Profile setup is no longer required.', 410)
}

function handleProfileRouteError(error: unknown, fallbackMessage: string): Response {
  if (error instanceof ProfileError) {
    return Response.json(
      {
        ok: false,
        error: error.message,
        code: error.code,
      },
      { status: error.status },
    )
  }

  const message = error instanceof Error ? error.message : fallbackMessage
  return jsonError(message, 500)
}

async function createAuthenticatedRouteClient(request: Request) {
  const bearerToken = readBearerToken(request.headers.get('authorization'))
  const { url, key } = getSupabasePublicConfig('app/api/profile/route.ts')
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
  })
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(bearerToken ?? undefined)

  if (error) {
    throw new Error(`Failed to verify session: ${error.message}`)
  }

  return { supabase, user }
}

function readNullableString(value: unknown) {
  return typeof value === 'string' ? value : null
}

function readBearerToken(authorization: string | null) {
  const match = authorization?.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}
