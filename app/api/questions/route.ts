import { logEvent } from '@/lib/server/helpers/logEvent'
import { jsonError, jsonSuccess } from '@/lib/server/http'
import { createPost } from '@/lib/server/discussions'
import { findOrCreateDefaultRoom } from '@/lib/server/pages'
import { getCurrentUserProfile } from '@/lib/server/profile'

type QuestionRequestBody = {
  roomId?: unknown
  pageId?: unknown
  header?: unknown
  content?: unknown
  sectionId?: unknown
  userId?: unknown
}

export async function POST(request: Request): Promise<Response> {
  let body: QuestionRequestBody

  try {
    body = (await request.json()) as QuestionRequestBody
  } catch {
    return jsonError('Request body must be valid JSON', 400)
  }

  const pageId = typeof body.pageId === 'string' ? body.pageId.trim() : ''
  const roomId = typeof body.roomId === 'string' ? body.roomId.trim() : ''
  const header = typeof body.header === 'string' ? body.header.trim() : ''
  const content = typeof body.content === 'string' ? body.content.trim() : ''
  const sectionId = typeof body.sectionId === 'string' ? body.sectionId.trim() : null
  const requestUserId = typeof body.userId === 'string' ? body.userId.trim() : null

  if (!roomId && !pageId) {
    return jsonError('roomId or pageId is required', 400)
  }

  if (!content) {
    return jsonError('content is required', 400)
  }

  try {
    const resolvedRoomId = roomId || (await findOrCreateDefaultRoom(pageId)).id
    const profile = await getCurrentUserProfile()
    const userId = profile?.id ?? requestUserId

    const data = await createPost({
      roomId: resolvedRoomId,
      userId,
      type: 'question',
      content,
      title: header || null,
      sectionId,
    })

    await logEvent({
      eventType: 'question.created',
      pageId: pageId || null,
      roomId: resolvedRoomId,
      postId: data.id,
      userId,
      payload: {
        type: data.type,
        header: data.header,
        sectionId: data.section_id,
      },
    })

    return jsonSuccess(data, 201)
  } catch (error) {
    console.error('POST /api/questions failed', {
      error,
      pageId,
      roomId,
      header,
      sectionId,
      userId: requestUserId,
    })

    const message = error instanceof Error ? error.message : 'Failed to create question'
    return jsonError(message, 500)
  }
}
