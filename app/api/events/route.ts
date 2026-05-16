import { logEvent } from '@/lib/server/helpers/logEvent'
import { jsonError, jsonSuccess } from '@/lib/server/http'

type EventsRequestBody = {
  eventType?: unknown
  payload?: unknown
  userId?: unknown
  pageId?: unknown
  roomId?: unknown
  postId?: unknown
  commentId?: unknown
}

export async function POST(request: Request): Promise<Response> {
  let body: EventsRequestBody

  try {
    body = (await request.json()) as EventsRequestBody
  } catch {
    return jsonError('Request body must be valid JSON', 400)
  }

  const eventType = typeof body.eventType === 'string' ? body.eventType.trim() : ''
  const userId = typeof body.userId === 'string' ? body.userId.trim() : null
  const pageId = typeof body.pageId === 'string' ? body.pageId.trim() : null
  const roomId = typeof body.roomId === 'string' ? body.roomId.trim() : null
  const postId = typeof body.postId === 'string' ? body.postId.trim() : null
  const commentId = typeof body.commentId === 'string' ? body.commentId.trim() : null
  const payload =
    body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
      ? (body.payload as Record<string, unknown>)
      : {}

  if (!eventType) {
    return jsonError('eventType is required', 400)
  }

  try {
    await logEvent({
      eventType,
      payload,
      userId,
      pageId,
      roomId,
      postId,
      commentId,
    })

    return jsonSuccess({
      eventType,
      userId,
      pageId,
      roomId,
      postId,
      commentId,
    }, 201)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to log event'
    return jsonError(message, 500)
  }
}
