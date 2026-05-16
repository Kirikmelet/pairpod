import { logEvent } from '@/lib/server/helpers/logEvent'
import { jsonError, jsonSuccess } from '@/lib/server/http'
import { findOrCreateDefaultRoom } from '@/lib/server/pages'
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin'

type ChatRequestBody = {
  roomId?: unknown
  pageId?: unknown
  message?: unknown
  sectionId?: unknown
  userId?: unknown
}

export async function POST(request: Request): Promise<Response> {
  let body: ChatRequestBody

  try {
    body = (await request.json()) as ChatRequestBody
  } catch {
    return jsonError('Request body must be valid JSON', 400)
  }

  const pageId = typeof body.pageId === 'string' ? body.pageId.trim() : ''
  const roomId = typeof body.roomId === 'string' ? body.roomId.trim() : ''
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  const sectionId = typeof body.sectionId === 'string' ? body.sectionId.trim() : null
  const userId = typeof body.userId === 'string' ? body.userId.trim() : null

  if ((!roomId && !pageId) || !message) {
    return jsonError('roomId or pageId, and message are required', 400)
  }

  try {
    const supabase = getSupabaseAdmin()
    const resolvedRoomId = roomId || (await findOrCreateDefaultRoom(pageId)).id

    const { data, error } = await supabase
      .from('posts')
      .insert({
        room_id: resolvedRoomId,
        type: 'chat',
        section_id: sectionId,
        header: null,
        content: message,
        user_id: userId,
      })
      .select('*')
      .single()

    if (error) {
      throw new Error(error.message)
    }

    await logEvent({
      eventType: 'chat.message.created',
      pageId: pageId || null,
      roomId: resolvedRoomId,
      postId: data.id,
      userId,
      payload: {
        type: data.type,
        sectionId: data.section_id,
      },
    })

    return jsonSuccess(data, 201)
  } catch (error) {
    const messageText = error instanceof Error ? error.message : 'Failed to create chat message'
    return jsonError(messageText, 500)
  }
}
