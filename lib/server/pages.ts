import 'server-only'

import { normalizeUrl } from '@/lib/server/helpers/normalizeUrl'
import { supabaseAdmin } from '@/lib/server/supabaseAdmin'

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

export type AuthorProfile = {
  id: string
  username: string | null
  displayName: string | null
  avatarUrl: string | null
}

export type PageBundle = {
  page: PageRow
  room: RoomRow
  posts: PostRow[]
  comments: CommentRow[]
}

export async function loadOrCreatePageRoom(url: string): Promise<PageBundle> {
  const page = await findOrCreatePage(url)
  const room = await findOrCreateDefaultRoom(page.id)

  return getPageBundle(page.id, room.id)
}

export async function findOrCreatePage(url: string): Promise<PageRow> {
  const normalizedUrl = normalizeUrl(url)

  const { data: existingPage, error: existingPageError } = await supabaseAdmin
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

  const { data: createdPage, error: createError } = await supabaseAdmin
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
  const { data: rooms, error: roomsError } = await supabaseAdmin
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

  const { data: createdRoom, error: createError } = await supabaseAdmin
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
  const [pageResult, roomResult, postsResult] = await Promise.all([
    supabaseAdmin.from('pages').select('*').eq('id', pageId).single<PageRow>(),
    supabaseAdmin.from('rooms').select('*').eq('id', roomId).single<RoomRow>(),
    supabaseAdmin.from('posts').select('*').eq('room_id', roomId).order('created_at', { ascending: true }).returns<PostRecord[]>(),
  ])

  if (pageResult.error) {
    throw new Error(`Failed to load page: ${pageResult.error.message}`)
  }

  if (roomResult.error) {
    throw new Error(`Failed to load room: ${roomResult.error.message}`)
  }

  if (postsResult.error) {
    throw new Error(`Failed to load posts: ${postsResult.error.message}`)
  }

  const posts = postsResult.data ?? []
  const postIds = posts.map((post) => post.id)

  let comments: CommentRow[] = []

  if (postIds.length > 0) {
    const { data: commentsData, error: commentsError } = await supabaseAdmin
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

  const authorById = await getAuthorProfilesById(
    [...posts, ...comments].map((entry) => entry.user_id).filter(Boolean) as string[],
  )

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
    posts: enrichedPosts,
    comments: enrichedComments,
  }
}

async function getAuthorProfilesById(userIds: string[]): Promise<Map<string, AuthorProfile>> {
  const uniqueUserIds = [...new Set(userIds.map((userId) => userId.trim()).filter(Boolean))]
  if (uniqueUserIds.length === 0) {
    return new Map<string, AuthorProfile>()
  }

  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, username, display_name, avatar_url')
    .in('id', uniqueUserIds)
    .returns<Array<{ id: string; username: string | null; display_name: string | null; avatar_url: string | null }>>()

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
