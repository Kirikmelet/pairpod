import { logEvent } from '@/lib/server/helpers/logEvent'
import { jsonError, jsonSuccess } from '@/lib/server/http'
import { createPost } from '@/lib/server/discussions'
import { findOrCreateDefaultRoom } from '@/lib/server/pages'

type GuideRequestBody = {
  roomId?: unknown
  pageId?: unknown
  sectionId?: unknown
  header?: unknown
  content?: unknown
  userId?: unknown
}

export async function POST(request: Request): Promise<Response> {
  let body: GuideRequestBody

  try {
    body = (await request.json()) as GuideRequestBody
  } catch {
    return jsonError('Request body must be valid JSON', 400)
  }

  const pageId = typeof body.pageId === 'string' ? body.pageId.trim() : ''
  const roomId = typeof body.roomId === 'string' ? body.roomId.trim() : ''
  const sectionId = typeof body.sectionId === 'string' ? body.sectionId.trim() : null
  const header = typeof body.header === 'string' ? body.header.trim() : ''
  const content = typeof body.content === 'string' ? body.content.trim() : ''
  const userId = typeof body.userId === 'string' ? body.userId.trim() : null

  if ((!roomId && !pageId) || !content) {
    return jsonError('roomId or pageId, and content are required', 400)
  }

  try {
    const resolvedRoomId = roomId || (await findOrCreateDefaultRoom(pageId)).id

    const data = await createPost({
      roomId: resolvedRoomId,
      userId,
      type: 'guide',
      content,
      title: header || null,
      sectionId,
    })

    await logEvent({
      eventType: 'guide.created',
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
    const message = error instanceof Error ? error.message : 'Failed to create guide'
    return jsonError(message, 500)
  }
}
