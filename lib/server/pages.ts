import 'server-only'

import { normalizeUrl } from '@/lib/server/helpers/normalizeUrl'
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

  const [pageResult, roomResult, postsResult] = await Promise.all([
    supabase.from('pages').select('*').eq('id', pageId).single<PageRow>(),
    supabase.from('rooms').select('*').eq('id', roomId).single<RoomRow>(),
    supabase.from('posts').select('*').eq('room_id', roomId).order('created_at', { ascending: true }).returns<PostRow[]>(),
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
    const { data: commentsData, error: commentsError } = await supabase
      .from('comments')
      .select('*')
      .in('post_id', postIds)
      .order('created_at', { ascending: true })
      .returns<Array<Omit<CommentRow, 'section_id'>>>()

    if (commentsError) {
      throw new Error(`Failed to load comments: ${commentsError.message}`)
    }

    comments =
      commentsData?.map((comment) => ({
        ...comment,
        section_id: `post:${comment.post_id}`,
      })) ?? []
  }

  return {
    page: pageResult.data,
    room: roomResult.data,
    posts,
    comments,
  }
}
