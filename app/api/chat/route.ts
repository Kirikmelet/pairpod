import { logEvent } from '@/lib/server/helpers/logEvent'
import { jsonError, jsonSuccess } from '@/lib/server/http'
import { resolveAuthenticatedProfileIdOrFallback } from '@/lib/server/profile'
import { createChatMessage } from '@/lib/server/discussions'
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
  const requestUserId = typeof body.userId === 'string' ? body.userId.trim() : null

  if ((!roomId && !pageId) || !message) {
    return jsonError('roomId or pageId, and message are required', 400)
  }

  try {
    const resolvedRoomId = roomId || (await findOrCreateDefaultRoom(pageId)).id
    const resolvedPageId = pageId || (await findPageIdForRoom(resolvedRoomId))
    const resolvedUserId = await resolveOptionalChatUserId(requestUserId)

    if (!resolvedPageId) {
      return jsonError('Could not resolve pageId for chat messages', 400)
    }

    const data = await createChatMessage({
      pageId: resolvedPageId,
      userId: resolvedUserId,
      content: message,
    })

    await logEvent({
      eventType: 'chat.message.created',
      pageId: resolvedPageId,
      roomId: resolvedRoomId,
      userId: resolvedUserId,
      payload: {
        chatId: data.chat_id,
        sectionId,
      },
    })

    return jsonSuccess(data, 201)
  } catch (error) {
    const messageText = error instanceof Error ? error.message : 'Failed to create chat message'
    return jsonError(messageText, 500)
  }
}

async function findPageIdForRoom(roomId: string) {
  if (!roomId) {
    return ''
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('rooms')
    .select('page_id')
    .eq('id', roomId)
    .maybeSingle<{ page_id: string }>()

  if (error) {
    throw new Error(`Failed to resolve chat page: ${error.message}`)
  }

  return data?.page_id ?? ''
}

async function resolveOptionalChatUserId(requestUserId: string | null) {
  try {
    return await resolveAuthenticatedProfileIdOrFallback(requestUserId)
  } catch (error) {
    console.warn('Creating chat message without user attribution.', error)
    return null
  }
}
