import { jsonError, jsonSuccess } from '@/lib/server/http'
import {
  ProfileError,
  createUserProfileIfMissing,
  serializeProfile,
  updateUserProfile,
} from '@/lib/server/profile'

type ProfilePatchBody = {
  username?: unknown
  displayName?: unknown
  avatarUrl?: unknown
}

export async function GET(): Promise<Response> {
  try {
    const profile = await createUserProfileIfMissing()
    return jsonSuccess(serializeProfile(profile))
  } catch (error) {
    return handleProfileRouteError(error, 'Failed to load profile')
  }
}

export async function PATCH(request: Request): Promise<Response> {
  let body: ProfilePatchBody

  try {
    body = (await request.json()) as ProfilePatchBody
  } catch {
    return jsonError('Request body must be valid JSON', 400)
  }

  try {
    const profile = await updateUserProfile(body)
    return jsonSuccess(serializeProfile(profile))
  } catch (error) {
    return handleProfileRouteError(error, 'Failed to update profile')
  }
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
