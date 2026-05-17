import 'server-only'

import { cookies } from 'next/headers'
import type { User } from '@supabase/supabase-js'
import type { Tables, TablesInsert, TablesUpdate } from '@/utils/database.types'
import { createClient } from '@/utils/supabase/server'

const USERNAME_PATTERN = /^[a-z0-9_-]{3,24}$/

export type UserProfileRow = Tables<'users'>

export type PublicUserProfile = {
  id: string
  authUserId: string | null
  username: string | null
  displayName: string | null
  avatarUrl: string | null
  createdAt: string
  updatedAt: string
  email: string | null
}

export class ProfileError extends Error {
  status: number
  code: string

  constructor(message: string, status: number, code: string) {
    super(message)
    this.name = 'ProfileError'
    this.status = status
    this.code = code
  }
}

export function validateUsername(username: string) {
  const normalized = username.trim().toLowerCase()

  if (!USERNAME_PATTERN.test(normalized)) {
    return {
      ok: false as const,
      error:
        'Username must be 3 to 24 characters and use only letters, numbers, underscores, or hyphens.',
    }
  }

  return {
    ok: true as const,
    normalized,
  }
}

export async function getAuthUserFromRequest(): Promise<User> {
  const supabase = createClient(await cookies())
  const { data, error } = await supabase.auth.getUser()

  if (error || !data.user) {
    throw new ProfileError('You must be signed in to access this profile.', 401, 'UNAUTHORIZED')
  }

  return data.user
}

export async function getCurrentUserProfile(): Promise<UserProfileRow | null> {
  const authUser = await getAuthUserFromRequest()
  return getProfileByAuthUserId(authUser.id)
}

export async function createUserProfileIfMissing(): Promise<UserProfileRow> {
  const authUser = await getAuthUserFromRequest()
  const existingProfile = await getProfileByAuthUserId(authUser.id)

  if (existingProfile) {
    return existingProfile
  }

  const supabase = createClient(await cookies())
  const username = await getAvailableSeedUsername(authUser)
  const payload: TablesInsert<'users'> = {
    auth_user_id: authUser.id,
    username,
    display_name: readDisplayNameFromMetadata(authUser),
    avatar_url: readAvatarUrlFromMetadata(authUser),
    email: authUser.email ?? null,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('users')
    .insert(payload)
    .select('*')
    .single<UserProfileRow>()

  if (!error && data) {
    return data
  }

  const racedProfile = await getProfileByAuthUserId(authUser.id)
  if (racedProfile) {
    return racedProfile
  }

  throw new Error(`Failed to create user profile: ${error?.message ?? 'Unknown error'}`)
}

export async function updateUserProfile(input: {
  username?: unknown
  displayName?: unknown
  avatarUrl?: unknown
}): Promise<UserProfileRow> {
  const profile = await createUserProfileIfMissing()
  const updates: TablesUpdate<'users'> = {
    updated_at: new Date().toISOString(),
  }

  if ('username' in input) {
    const rawUsername = typeof input.username === 'string' ? input.username : ''
    const validation = validateUsername(rawUsername)

    if (!validation.ok) {
      throw new ProfileError(validation.error, 400, 'INVALID_USERNAME')
    }

    const isTaken = await isUsernameTaken(validation.normalized, profile.id)
    if (isTaken) {
      throw new ProfileError('That username is already taken.', 409, 'USERNAME_TAKEN')
    }

    updates.username = validation.normalized
  }

  if ('displayName' in input) {
    updates.display_name = normalizeOptionalText(input.displayName)
  }

  if ('avatarUrl' in input) {
    updates.avatar_url = normalizeAvatarUrl(input.avatarUrl)
  }

  if (Object.keys(updates).length === 1) {
    throw new ProfileError(
      'At least one of username, displayName, or avatarUrl must be provided.',
      400,
      'NO_UPDATES',
    )
  }

  const supabase = createClient(await cookies())
  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', profile.id)
    .select('*')
    .single<UserProfileRow>()

  if (error) {
    if (isUniqueConstraintError(error.message, 'users_username_key')) {
      throw new ProfileError('That username is already taken.', 409, 'USERNAME_TAKEN')
    }

    throw new Error(`Failed to update user profile: ${error.message}`)
  }

  return data
}

export async function resolveAuthenticatedProfileIdOrFallback(
  fallbackUserId?: string | null,
): Promise<string | null> {
  try {
    const profile = await createUserProfileIfMissing()
    return profile.id
  } catch (error) {
    if (error instanceof ProfileError && error.status === 401) {
      const trimmedFallback = fallbackUserId?.trim()
      return trimmedFallback || null
    }

    throw error
  }
}

export function serializeProfile(profile: UserProfileRow): PublicUserProfile {
  return {
    id: profile.id,
    authUserId: profile.auth_user_id,
    username: profile.username,
    displayName: profile.display_name,
    avatarUrl: profile.avatar_url,
    createdAt: profile.created_at,
    updatedAt: profile.updated_at,
    email: profile.email,
  }
}

async function getProfileByAuthUserId(authUserId: string): Promise<UserProfileRow | null> {
  const supabase = createClient(await cookies())
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('auth_user_id', authUserId)
    .maybeSingle<UserProfileRow>()

  if (error) {
    throw new Error(`Failed to load user profile: ${error.message}`)
  }

  return data
}

async function getAvailableSeedUsername(authUser: User): Promise<string | null> {
  const candidates = [
    authUser.user_metadata?.username,
    authUser.user_metadata?.user_name,
    authUser.email?.split('@')[0] ?? null,
  ]

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') {
      continue
    }

    const validation = validateUsername(candidate)
    if (!validation.ok) {
      continue
    }

    const isTaken = await isUsernameTaken(validation.normalized)
    if (!isTaken) {
      return validation.normalized
    }
  }

  return null
}

async function isUsernameTaken(username: string, currentProfileId?: string): Promise<boolean> {
  const supabase = createClient(await cookies())
  let query = supabase.from('users').select('id').eq('username', username).limit(1)

  if (currentProfileId) {
    query = query.neq('id', currentProfileId)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to validate username uniqueness: ${error.message}`)
  }

  return Boolean(data?.length)
}

function readDisplayNameFromMetadata(authUser: User): string | null {
  const candidate =
    typeof authUser.user_metadata?.full_name === 'string'
      ? authUser.user_metadata.full_name
      : typeof authUser.user_metadata?.display_name === 'string'
        ? authUser.user_metadata.display_name
        : typeof authUser.user_metadata?.username === 'string'
          ? authUser.user_metadata.username
          : null

  return normalizeOptionalText(candidate)
}

function readAvatarUrlFromMetadata(authUser: User): string | null {
  const candidate =
    typeof authUser.user_metadata?.avatar_url === 'string'
      ? authUser.user_metadata.avatar_url
      : typeof authUser.user_metadata?.picture === 'string'
        ? authUser.user_metadata.picture
        : null

  return normalizeAvatarUrl(candidate, false)
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed || null
}

function normalizeAvatarUrl(value: unknown, enforce = true): string | null {
  const text = normalizeOptionalText(value)
  if (!text) {
    return null
  }

  try {
    const parsed = new URL(text)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Unsupported protocol')
    }

    return parsed.toString()
  } catch {
    if (!enforce) {
      return null
    }

    throw new ProfileError(
      'avatarUrl must be a valid http or https URL.',
      400,
      'INVALID_AVATAR_URL',
    )
  }
}

function isUniqueConstraintError(message: string, constraintName: string) {
  return message.includes(constraintName) || message.toLowerCase().includes('duplicate key')
}
