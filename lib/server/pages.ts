import 'server-only'

import { normalizeUrl } from '@/lib/server/helpers/normalizeUrl'
import type { UserProfileRow } from '@/lib/server/profile'
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin'

export type PageRow = {
  id: string
  normalized_url: string
  created_at: string
}

export type RoomRow = {
  id: string
  page_id: string
  max_users: number
  configurations: Record<string, unknown>
  created_at: string
}

export type PageRouteRow = {
  id: string
  page_id: string
  path: string
  label: string | null
  source: string
  created_at: string
  updated_at: string
}

export type AuthorProfile = {
  id: string
  username: string | null
  displayName: string | null
  avatarUrl: string | null
}

export type PostRow = {
  id: string
  room_id: string
  type: string
  section_id: string | null
  header: string | null
  content: string
  likes: number
  user_id: string | null
  created_at: string
  author: AuthorProfile | null
}

type PostRecord = Omit<PostRow, 'author'>

export type ChatRow = {
  chat_id: string
  room_id: string
  body: string | null
  user_id: string | null
  created_at: string
}

export type CommentRow = {
  id: string
  post_id: string
  reply_id: string | null
  content: string
  likes: number
  user_id: string | null
  created_at: string
  section_id: string | null
  author: AuthorProfile | null
}

type CommentRecord = Omit<CommentRow, 'author' | 'section_id'>

export type PageBundle = {
  page: PageRow
  room: RoomRow
  routes: PageRouteRow[]
  chats: ChatRow[]
  posts: PostRow[]
  comments: CommentRow[]
  users: UserProfileRow[]
}

const USER_PROFILE_COLUMNS =
  'id,auth_user_id,email,username,configurations,avatar_url,clothing_url,display_name,updated_at,created_at,url'

export async function loadOrCreatePageRoom(url: string): Promise<PageBundle> {
  const page = await findOrCreatePage(url)
  const room = await findOrCreateDefaultRoom(page.id)
  try {
    await seedPageRoutes(page.id, url, [])
  } catch (error) {
    console.warn('Skipping page route seed.', error)
  }

  return getPageBundle(page.id, room.id)
}

export async function findOrCreatePage(url: string): Promise<PageRow> {
  const normalizedUrl = normalizeUrl(url)
  const supabase = getSupabaseAdmin()

  const { data: existingPage, error: existingPageError } = await supabase
    .from('pages')
    .select('*')
    .eq('normalized_url', normalizedUrl)
    .maybeSingle<PageRow>()

  if (existingPageError) {
    throw new Error(`Failed to load page: ${existingPageError.message}`)
  }

  if (existingPage) {
    return existingPage
  }

  const { data: createdPage, error: createError } = await supabase
    .from('pages')
    .insert({
      normalized_url: normalizedUrl,
    })
    .select('*')
    .single<PageRow>()

  if (createError) {
    throw new Error(`Failed to create page: ${createError.message}`)
  }

  return createdPage
}

export async function findOrCreateDefaultRoom(pageId: string): Promise<RoomRow> {
  const supabase = getSupabaseAdmin()

  const { data: rooms, error: roomsError } = await supabase
    .from('rooms')
    .select('*')
    .eq('page_id', pageId)
    .order('created_at', { ascending: true })
    .limit(1)
    .returns<RoomRow[]>()

  if (roomsError) {
    throw new Error(`Failed to load room: ${roomsError.message}`)
  }

  const existingRoom = rooms?.[0]
  if (existingRoom) {
    return existingRoom
  }

  const { data: createdRoom, error: createError } = await supabase
    .from('rooms')
    .insert({
      page_id: pageId,
    })
    .select('*')
    .single<RoomRow>()

  if (createError) {
    throw new Error(`Failed to create room: ${createError.message}`)
  }

  return createdRoom
}

export async function getPageBundle(pageId: string, roomId: string): Promise<PageBundle> {
  const supabase = getSupabaseAdmin()

  const [pageResult, roomResult, routesResult, chatsResult, postsResult] = await Promise.all([
    supabase.from('pages').select('*').eq('id', pageId).single<PageRow>(),
    supabase.from('rooms').select('*').eq('id', roomId).single<RoomRow>(),
    supabase
      .from('page_routes')
      .select('*')
      .eq('page_id', pageId)
      .order('created_at', { ascending: true })
      .returns<PageRouteRow[]>(),
    supabase
      .from('chat')
      .select('*')
      .eq('room_id', pageId)
      .order('created_at', { ascending: true })
      .returns<ChatRow[]>(),
    supabase
      .from('posts')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })
      .returns<PostRecord[]>(),
  ])

  if (pageResult.error) {
    throw new Error(`Failed to load page: ${pageResult.error.message}`)
  }

  if (roomResult.error) {
    throw new Error(`Failed to load room: ${roomResult.error.message}`)
  }

  if (routesResult.error && !isMissingOptionalRouteTable(routesResult.error)) {
    throw new Error(`Failed to load routes: ${routesResult.error.message}`)
  }

  if (postsResult.error) {
    throw new Error(`Failed to load posts: ${postsResult.error.message}`)
  }

  if (chatsResult.error) {
    throw new Error(`Failed to load chat: ${chatsResult.error.message}`)
  }

  const chats = chatsResult.data ?? []
  const posts = postsResult.data ?? []
  const postIds = posts.map((post) => post.id)

  let comments: CommentRow[] = []

  if (postIds.length > 0) {
    const { data: commentsData, error: commentsError } = await supabase
      .from('comments')
      .select('*')
      .in('post_id', postIds)
      .order('created_at', { ascending: true })
      .returns<CommentRecord[]>()

    if (commentsError) {
      throw new Error(`Failed to load comments: ${commentsError.message}`)
    }

    comments =
      commentsData?.map((comment) => ({
        ...comment,
        section_id: `post:${comment.post_id}`,
        author: null,
      })) ?? []
  }

  const userIds = [...chats, ...posts, ...comments]
    .map((entry) => entry.user_id)
    .filter((userId): userId is string => Boolean(userId))
  const [authorById, users] = await Promise.all([
    getAuthorProfilesById(userIds),
    loadProfilesById(userIds),
  ])

  const enrichedPosts = posts.map((post) => ({
    ...post,
    author: post.user_id ? authorById.get(post.user_id) ?? null : null,
  }))

  const enrichedComments = comments.map((comment) => ({
    ...comment,
    author: comment.user_id ? authorById.get(comment.user_id) ?? null : null,
  }))

  return {
    page: pageResult.data,
    room: roomResult.data,
    routes: routesResult.error ? [] : routesResult.data ?? [],
    chats,
    posts: enrichedPosts,
    comments: enrichedComments,
    users,
  }
}

function isMissingOptionalRouteTable(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() ?? ''
  return error.code === '42P01' || message.includes('page_routes')
}

async function seedPageRoutes(pageId: string, url: string, paths: string[]) {
  const routes = buildRouteSeedRows(pageId, url, paths)
  if (routes.length === 0) {
    return
  }

  const supabase = getSupabaseAdmin()
  const { error } = await supabase
    .from('page_routes')
    .upsert(routes, { onConflict: 'page_id,path' })

  if (error) {
    throw new Error(`Failed to seed page routes: ${error.message}`)
  }
}

function buildRouteSeedRows(pageId: string, url: string, paths: string[]) {
  const baseUrl = parseRouteUrl(url)
  if (!baseUrl || baseUrl.hostname === 'global.pairpod.local') {
    return []
  }

  const routes = new Map<string, { path: string; label: string; source: string }>()
  const addRoute = (path: string, source: string) => {
    const normalized = normalizeRoutePath(path)
    if (!normalized || routes.has(normalized)) {
      return
    }

    routes.set(normalized, {
      path: normalized,
      label: normalized === '/' ? '/' : normalized.replace(/^\//, ''),
      source,
    })
  }

  addRoute('/', 'site-root')
  addRoute(`${baseUrl.pathname}${baseUrl.search}`, 'current-page')

  const segments = baseUrl.pathname.split('/').filter(Boolean)
  for (let index = 0; index < segments.length - 1; index += 1) {
    addRoute(`/${segments.slice(0, index + 1).join('/')}`, 'parent-route')
  }

  for (const path of paths) {
    addRoute(path, 'post-section')
  }

  const now = new Date().toISOString()
  return [...routes.values()].slice(0, 12).map((route) => ({
    page_id: pageId,
    path: route.path,
    label: route.label,
    source: route.source,
    updated_at: now,
  }))
}

function parseRouteUrl(value: string) {
  try {
    return new URL(/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(value) ? value : `https://${value}`)
  } catch {
    return null
  }
}

function normalizeRoutePath(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const parsed = parseRouteUrl(trimmed)
  const routeText = parsed ? `${parsed.pathname}${parsed.search}` : trimmed
  const [pathPart, searchPart = ''] = routeText.split('?')
  const path = `/${pathPart.replace(/^\/+/, '').replace(/\/+$/, '')}`
  const normalizedPath = path === '/' ? '/' : path
  return `${normalizedPath}${searchPart ? `?${searchPart}` : ''}`
}

async function getAuthorProfilesById(userIds: string[]): Promise<Map<string, AuthorProfile>> {
  const uniqueUserIds = [...new Set(userIds.map((userId) => userId.trim()).filter(Boolean))]
  if (uniqueUserIds.length === 0) {
    return new Map<string, AuthorProfile>()
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url')
    .in('id', uniqueUserIds)
    .returns<
      Array<{
        id: string
        username: string | null
        display_name: string | null
        avatar_url: string | null
      }>
    >()

  if (error) {
    throw new Error(`Failed to load author profiles: ${error.message}`)
  }

  return new Map(
    (data ?? []).map((profile) => [
      profile.id,
      {
        id: profile.id,
        username: profile.username,
        displayName: profile.display_name,
        avatarUrl: profile.avatar_url,
      },
    ]),
  )
}

async function loadProfilesById(userIds: string[]): Promise<UserProfileRow[]> {
  const uniqueUserIds = [...new Set(userIds.map((userId) => userId.trim()).filter(Boolean))]
  if (uniqueUserIds.length === 0) {
    return []
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('users')
    .select(USER_PROFILE_COLUMNS)
    .in('id', uniqueUserIds)
    .returns<UserProfileRow[]>()

  if (error) {
    throw new Error(`Failed to load user profiles: ${error.message}`)
  }

  return data ?? []
}
