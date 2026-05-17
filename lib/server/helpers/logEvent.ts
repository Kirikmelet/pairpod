import 'server-only'

import { supabaseAdmin } from '@/lib/server/supabaseAdmin'
import type { Json } from '@/utils/database.types'

export type LogEventInput = {
  eventType: string
  payload?: Record<string, unknown>
  userId?: string | null
  pageId?: string | null
  roomId?: string | null
  postId?: string | null
  commentId?: string | null
}

export async function logEvent({
  eventType,
  payload = {},
  userId = null,
  pageId = null,
  roomId = null,
  postId = null,
  commentId = null,
}: LogEventInput): Promise<boolean> {
  try {
    if (!eventType.trim()) {
      throw new Error('eventType is required')
    }

    const { error } = await supabaseAdmin.from('events').insert({
      user_id: userId,
      page_id: pageId,
      room_id: roomId,
      post_id: postId,
      comment_id: commentId,
      event_type: eventType,
      payload: payload as Json,
    })

    if (error) {
      throw new Error(`Failed to log event: ${error.message}`)
    }

    return true
  } catch (error) {
    console.error('logEvent failed', {
      error,
      eventType,
      userId,
      pageId,
      roomId,
      postId,
      commentId,
    })
    return false
  }
}
