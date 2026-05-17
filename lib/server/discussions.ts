import 'server-only'

import { cookies } from 'next/headers'
import { createClient } from '@/utils/supabase/server'

const ALLOWED_POST_TYPES = ['chat', 'question', 'guide'] as const

export type AllowedPostType = (typeof ALLOWED_POST_TYPES)[number]

export type CreatePostInput = {
  roomId: string
  userId?: string | null
  type: AllowedPostType
  content: string
  title?: string | null
  sectionId?: string | null
}

export type CreateCommentInput = {
  postId: string
  userId?: string | null
  content: string
  replyId?: string | null
}

export type CreatedPost = {
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

export type CreatedComment = {
  id: string
  post_id: string
  reply_id: string | null
  content: string
  likes: number
  user_id: string | null
  created_at: string
  section_id: string | null
}

export async function createPost({
  roomId,
  userId = null,
  type,
  content,
  title = null,
  sectionId = null,
}: CreatePostInput): Promise<CreatedPost> {
  const trimmedRoomId = roomId.trim()
  const trimmedContent = content.trim()
  const trimmedTitle = title?.trim() || null
  const trimmedSectionId = sectionId?.trim() || null
  const trimmedUserId = userId?.trim() || null

  if (!trimmedRoomId) {
    throw new Error('roomId is required')
  }

  if (!ALLOWED_POST_TYPES.includes(type)) {
    throw new Error(`type must be one of: ${ALLOWED_POST_TYPES.join(', ')}`)
  }

  if (!trimmedContent) {
    throw new Error('content is required')
  }

  const supabase = createClient(await cookies())

  const { data, error } = await supabase
    .from('posts')
    .insert({
      room_id: trimmedRoomId,
      user_id: trimmedUserId,
      type,
      content: trimmedContent,
      header: trimmedTitle,
      section_id: trimmedSectionId,
    })
    .select('*')
    .single<CreatedPost>()

  if (error) {
    throw new Error(`Failed to create post: ${error.message}`)
  }

  return data
}

export async function createComment({
  postId,
  userId = null,
  content,
  replyId = null,
}: CreateCommentInput): Promise<CreatedComment> {
  const trimmedPostId = postId.trim()
  const trimmedContent = content.trim()
  const trimmedUserId = userId?.trim() || null
  const trimmedReplyId = replyId?.trim() || null

  if (!trimmedPostId) {
    throw new Error('postId is required')
  }

  if (!trimmedContent) {
    throw new Error('content is required')
  }

  const supabase = createClient(await cookies())

  if (trimmedReplyId) {
    const { data: parentComment, error: parentError } = await supabase
      .from('comments')
      .select('post_id')
      .eq('id', trimmedReplyId)
      .single<{ post_id: string }>()

    if (parentError) {
      throw new Error(`Failed to load parent comment: ${parentError.message}`)
    }

    if (parentComment.post_id !== trimmedPostId) {
      throw new Error('replyId does not belong to the provided postId')
    }
  }

  const { data, error } = await supabase
    .from('comments')
    .insert({
      post_id: trimmedPostId,
      reply_id: trimmedReplyId,
      content: trimmedContent,
      user_id: trimmedUserId,
    })
    .select('*')
    .single<Omit<CreatedComment, 'section_id'>>()

  if (error) {
    throw new Error(`Failed to create comment: ${error.message}`)
  }

  return {
    ...data,
    section_id: `post:${data.post_id}`,
  }
}
