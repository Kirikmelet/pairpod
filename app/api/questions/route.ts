import { logEvent } from '@/lib/server/helpers/logEvent'
import { jsonError, jsonSuccess } from '@/lib/server/http'
import { findOrCreateDefaultRoom } from '@/lib/server/pages'
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin'

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
  const userId = typeof body.userId === 'string' ? body.userId.trim() : null

  if (!roomId && !pageId) {
    return jsonError('roomId or pageId is required', 400)
  }

  if (!header) {
    return jsonError('header is required', 400)
  }

  if (!content) {
    return jsonError('content is required', 400)
  }

  try {
    const supabase = getSupabaseAdmin()
    const resolvedRoomId = roomId || (await findOrCreateDefaultRoom(pageId)).id

    const { data, error } = await supabase
      .from('posts')
      .insert({
        room_id: resolvedRoomId,
        type: 'question',
        section_id: sectionId,
        header,
        content,
        user_id: userId,
      })
      .select('*')
      .single()

    if (error) {
      throw new Error(error.message)
    }

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
      userId,
    })

    const message = error instanceof Error ? error.message : 'Failed to create question'
    return jsonError(message, 500)
  }
}
