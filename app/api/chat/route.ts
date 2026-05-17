import { logEvent } from '@/lib/server/helpers/logEvent'
import { jsonError, jsonSuccess } from '@/lib/server/http'
import { createPost } from '@/lib/server/discussions'
import { findOrCreateDefaultRoom } from '@/lib/server/pages'
import { getCurrentUserProfile } from '@/lib/server/profile'

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
  const requestUserId = typeof body.userId === 'string' ? body.userId.trim() : null

  if ((!roomId && !pageId) || !message) {
    return jsonError('roomId or pageId, and message are required', 400)
  }

  try {
    const resolvedRoomId = roomId || (await findOrCreateDefaultRoom(pageId)).id
    const profile = await getCurrentUserProfile()
    const userId = profile?.id ?? requestUserId

    const data = await createPost({
      roomId: resolvedRoomId,
      userId,
      type: 'chat',
      content: message,
      sectionId,
    })

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
