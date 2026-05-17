import { createAuthenticatedRouteClient } from '@/lib/server/auth'
import {
  ProfileError,
  ensureUserProfile,
  toProfileResponse,
  updateUserProfile,
} from '@/lib/server/profile'
import { jsonError, jsonSuccess } from '@/lib/server/http'
import { createAdminClient } from '@/utils/supabase/admin'

type ProfilePatchBody = {
  username?: unknown
  displayName?: unknown
  avatarUrl?: unknown
}

export async function GET(request: Request): Promise<Response> {
  try {
    const { user } = await createAuthenticatedRouteClient(
      request,
      'app/api/profile/route.ts',
    )

    if (!user) {
      throw new ProfileError(
        'You must be signed in to view your profile.',
        401,
        'UNAUTHORIZED',
      )
    }

    const profile = await ensureUserProfile(createAdminClient(), user)
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
    const { user } = await createAuthenticatedRouteClient(
      request,
      'app/api/profile/route.ts',
    )

    if (!user) {
      throw new ProfileError(
        'You must be signed in to update your profile.',
        401,
        'UNAUTHORIZED',
      )
    }

    const profile = await updateUserProfile(createAdminClient(), user, {
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

function handleProfileRouteError(
  error: unknown,
  fallbackMessage: string,
): Response {
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

function readNullableString(value: unknown) {
  return typeof value === 'string' ? value : null
}
