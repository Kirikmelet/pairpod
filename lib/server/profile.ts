import 'server-only'

import { cookies } from 'next/headers'
import type { User, SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  Json,
  Tables,
  TablesInsert,
  TablesUpdate,
} from '@/utils/database.types'
import { createClient } from '@/utils/supabase/server'

const USERNAME_PATTERN = /^[a-z0-9_-]{3,24}$/
const USER_PROFILE_COLUMNS =
  'id,auth_user_id,email,username,configurations,avatar_url,display_name,updated_at,created_at,url'

export const DEFAULT_AVATAR_URL =
  'https://xgfgqzveuyeceupfaebh.supabase.co/storage/v1/object/public/profile_pictures/default_user.png'

export type UserProfileRow = Tables<'users'>

export type ProfileResponse = {
  id: string
  email: string | null
  username: string | null
  displayName: string | null
  avatarUrl: string
  character3d: Character3dConfig
}

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

export type ProfileUpdateInput = {
  username?: string | null
  displayName?: string | null
  avatarUrl?: string | null
  character3d?: Partial<Character3dConfig>
}

export type Character3dConfig = {
  body: string
  accent: string
  head: string
  style: 'pod' | 'runner' | 'bot'
}

const DEFAULT_CHARACTER_3D: Character3dConfig = {
  body: '#6ebe44',
  accent: '#2d90ff',
  head: '#f7ffe8',
  style: 'pod',
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

export class InvalidUsernameError extends ProfileError {
  constructor() {
    super(
      'Username must be 3 to 24 characters and use only letters, numbers, underscores, or hyphens.',
      400,
      'INVALID_USERNAME',
    )
    this.name = 'InvalidUsernameError'
  }
}

export class DuplicateUsernameError extends ProfileError {
  constructor() {
    super('That username is already taken.', 409, 'USERNAME_TAKEN')
    this.name = 'DuplicateUsernameError'
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

export function normalizeUsername(value: string | null | undefined) {
  const normalized = normalizeOptionalText(value)?.toLowerCase() ?? null
  if (!normalized) {
    return null
  }

  if (!USERNAME_PATTERN.test(normalized)) {
    throw new InvalidUsernameError()
  }

  return normalized
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
  const supabase = createClient(await cookies())
  return ensureUserProfile(supabase, authUser)
}

export async function createUserProfileIfMissing(): Promise<UserProfileRow> {
  const authUser = await getAuthUserFromRequest()
  const supabase = createClient(await cookies())
  return ensureUserProfile(supabase, authUser)
}

export async function loadUserProfiles(userIds: string[]) {
  const uniqueIds = [...new Set(userIds.map((userId) => userId.trim()).filter(Boolean))]
  if (uniqueIds.length === 0) {
    return [] as UserProfileRow[]
  }

  const supabase = createClient(await cookies())
  const { data, error } = await supabase
    .from('users')
    .select(USER_PROFILE_COLUMNS)
    .in('id', uniqueIds)
    .returns<UserProfileRow[]>()

  if (error) {
    throw new Error(`Failed to load profiles: ${error.message}`)
  }

  return data ?? []
}

export async function ensureUserProfile(
  supabase: SupabaseClient<Database>,
  authUser: User,
): Promise<UserProfileRow> {
  const existingByAuth = await loadUserByAuthId(supabase, authUser.id)
  if (existingByAuth) {
    return await syncUserProfileDefaults(supabase, existingByAuth, authUser)
  }

  const legacyById = await loadUserById(supabase, authUser.id)
  if (legacyById) {
    return await syncUserProfileDefaults(supabase, legacyById, authUser, {
      auth_user_id: authUser.id,
    })
  }

  const payload: TablesInsert<'users'> = {
    auth_user_id: authUser.id,
    username: await getAvailableSeedUsernameForSupabase(supabase, authUser),
    display_name: readDisplayNameFromMetadata(authUser),
    avatar_url: DEFAULT_AVATAR_URL,
    email: authUser.email ?? null,
    configurations: {
      displayName: readDisplayNameFromMetadata(authUser),
      character3d: DEFAULT_CHARACTER_3D,
    } as Json,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('users')
    .insert(payload)
    .select(USER_PROFILE_COLUMNS)
    .single<UserProfileRow>()

  if (!error && data) {
    return data
  }

  const racedProfile = await loadUserByAuthId(supabase, authUser.id)
  if (racedProfile) {
    return racedProfile
  }

  throw new Error(`Failed to create profile: ${error?.message ?? 'Unknown error'}`)
}

export async function updateUserProfile(
  input: ProfileUpdateInput,
): Promise<UserProfileRow>
export async function updateUserProfile(
  supabase: SupabaseClient<Database>,
  authUser: User,
  input: ProfileUpdateInput,
): Promise<UserProfileRow>
export async function updateUserProfile(
  arg1: ProfileUpdateInput | SupabaseClient<Database>,
  arg2?: User,
  arg3?: ProfileUpdateInput,
): Promise<UserProfileRow> {
  if (isSupabaseClient(arg1)) {
    const supabase = arg1
    const authUser = arg2
    const input = arg3

    if (!authUser || !input) {
      throw new Error('updateUserProfile requires auth user and input when called with Supabase.')
    }

    return updateUserProfileInternal(supabase, authUser, input)
  }

  const input = arg1
  const authUser = await getAuthUserFromRequest()
  const supabase = createClient(await cookies())
  return updateUserProfileInternal(supabase, authUser, input)
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

export function toProfileResponse(profile: UserProfileRow): ProfileResponse {
  const configuration = readConfiguration(profile.configurations)

  return {
    id: profile.id,
    email: profile.email ?? null,
    username: normalizeOptionalText(profile.username),
    displayName:
      normalizeOptionalText(profile.display_name) ?? configuration.displayName ?? null,
    avatarUrl: normalizeOptionalText(profile.avatar_url) ?? DEFAULT_AVATAR_URL,
    character3d: configuration.character3d,
  }
}

async function updateUserProfileInternal(
  supabase: SupabaseClient<Database>,
  authUser: User,
  input: ProfileUpdateInput,
) {
  const currentProfile = await ensureUserProfile(supabase, authUser)
  const nextConfiguration = readConfiguration(currentProfile.configurations)
  const updates: TablesUpdate<'users'> = {
    updated_at: new Date().toISOString(),
    email: authUser.email ?? currentProfile.email,
    auth_user_id: currentProfile.auth_user_id ?? authUser.id,
  }

  if (Object.prototype.hasOwnProperty.call(input, 'username')) {
    const rawUsername = typeof input.username === 'string' ? input.username : ''
    const validation = validateUsername(rawUsername)

    if (!validation.ok) {
      throw new InvalidUsernameError()
    }

    const isTaken = await isUsernameTaken(supabase, validation.normalized, currentProfile.id)
    if (isTaken) {
      throw new DuplicateUsernameError()
    }

    updates.username = validation.normalized
  }

  if (Object.prototype.hasOwnProperty.call(input, 'displayName')) {
    updates.display_name = normalizeOptionalText(input.displayName)
    nextConfiguration.displayName = updates.display_name
  }

  if (Object.prototype.hasOwnProperty.call(input, 'avatarUrl')) {
    updates.avatar_url = normalizeAvatarUrl(input.avatarUrl, true)
  }

  if (input.character3d) {
    nextConfiguration.character3d = normalizeCharacter3d(input.character3d)
  }

  updates.configurations = nextConfiguration

  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', currentProfile.id)
    .select(USER_PROFILE_COLUMNS)
    .single<UserProfileRow>()

  if (error) {
    if (
      isUniqueViolation(error, [
        'users_username_key',
        'users_username_lower_unique_idx',
        'username',
      ])
    ) {
      throw new DuplicateUsernameError()
    }

    throw new Error(`Failed to update profile: ${error.message}`)
  }

  return data
}

async function loadUserByAuthId(
  supabase: SupabaseClient<Database>,
  authUserId: string,
) {
  const { data, error } = await supabase
    .from('users')
    .select(USER_PROFILE_COLUMNS)
    .eq('auth_user_id', authUserId)
    .maybeSingle<UserProfileRow>()

  if (error) {
    throw new Error(`Failed to load profile: ${error.message}`)
  }

  return data
}

async function loadUserById(supabase: SupabaseClient<Database>, id: string) {
  const { data, error } = await supabase
    .from('users')
    .select(USER_PROFILE_COLUMNS)
    .eq('id', id)
    .maybeSingle<UserProfileRow>()

  if (error) {
    throw new Error(`Failed to load profile: ${error.message}`)
  }

  return data
}

async function syncUserProfileDefaults(
  supabase: SupabaseClient<Database>,
  profile: UserProfileRow,
  authUser: User,
  extraPatch: TablesUpdate<'users'> = {},
) {
  const seedDisplayName = readDisplayNameFromMetadata(authUser)
  const seedAvatarUrl = DEFAULT_AVATAR_URL
  const configuration = readConfiguration(profile.configurations)
  let shouldUpdate = false
  const patch: TablesUpdate<'users'> = {
    ...extraPatch,
  }

  if ((patch.auth_user_id ?? profile.auth_user_id) !== authUser.id) {
    patch.auth_user_id = authUser.id
    shouldUpdate = true
  }

  if ((profile.email ?? null) !== (authUser.email ?? null)) {
    patch.email = authUser.email ?? null
    shouldUpdate = true
  }

  if (!normalizeOptionalText(profile.display_name) && seedDisplayName) {
    patch.display_name = seedDisplayName
    shouldUpdate = true
  }

  if (!normalizeOptionalText(profile.avatar_url) && seedAvatarUrl) {
    patch.avatar_url = seedAvatarUrl
    shouldUpdate = true
  }

  if (!configuration.displayName && seedDisplayName) {
    configuration.displayName = seedDisplayName
    patch.configurations = configuration
    shouldUpdate = true
  }

  if (!shouldUpdate) {
    return profile
  }

  patch.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('users')
    .update(patch)
    .eq('id', profile.id)
    .select(USER_PROFILE_COLUMNS)
    .single<UserProfileRow>()

  if (error) {
    throw new Error(`Failed to sync profile: ${error.message}`)
  }

  return data
}

async function getAvailableSeedUsernameForSupabase(
  supabase: SupabaseClient<Database>,
  authUser: User,
) {
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

    const taken = await isUsernameTaken(supabase, validation.normalized)
    if (!taken) {
      return validation.normalized
    }
  }

  return null
}

async function isUsernameTaken(
  supabase: SupabaseClient<Database>,
  username: string,
  currentProfileId?: string,
) {
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
        : typeof authUser.user_metadata?.name === 'string'
          ? authUser.user_metadata.name
          : typeof authUser.user_metadata?.username === 'string'
            ? authUser.user_metadata.username
            : null

  return normalizeOptionalText(candidate)
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed || null
}

function normalizeAvatarUrl(value: unknown, enforce: boolean): string | null {
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

function readConfiguration(configurations: Json) {
  if (configurations && typeof configurations === 'object' && !Array.isArray(configurations)) {
    const displayName = configurations.displayName
    const character3d = normalizeCharacter3d(configurations.character3d)
    return {
      ...configurations,
      displayName: typeof displayName === 'string' ? displayName.trim() || null : null,
      character3d,
    }
  }

  return { displayName: null as string | null, character3d: DEFAULT_CHARACTER_3D }
}

function normalizeCharacter3d(value: unknown): Character3dConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return DEFAULT_CHARACTER_3D
  }

  const candidate = value as Partial<Character3dConfig>
  return {
    body: normalizeColor(candidate.body) ?? DEFAULT_CHARACTER_3D.body,
    accent: normalizeColor(candidate.accent) ?? DEFAULT_CHARACTER_3D.accent,
    head: normalizeColor(candidate.head) ?? DEFAULT_CHARACTER_3D.head,
    style: candidate.style === 'runner' || candidate.style === 'bot' ? candidate.style : 'pod',
  }
}

function normalizeColor(value: unknown) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : null
}

function isUniqueViolation(error: unknown, matchers: string[]) {
  if (!error || typeof error !== 'object') {
    return false
  }

  const candidate = error as { code?: string; message?: string; details?: string }
  const haystack = `${candidate.message ?? ''} ${candidate.details ?? ''}`.toLowerCase()
  return (
    candidate.code === '23505' &&
    matchers.some((matcher) => haystack.includes(matcher.toLowerCase()))
  )
}

function isSupabaseClient(
  value: ProfileUpdateInput | SupabaseClient<Database>,
): value is SupabaseClient<Database> {
  return typeof value === 'object' && value !== null && 'auth' in value && 'from' in value
}
