import { logEvent } from '@/lib/server/helpers/logEvent'
import { jsonError, jsonSuccess } from '@/lib/server/http'
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin'

type AnswerRequestBody = {
  content?: unknown
  replyId?: unknown
  postId?: unknown
  sectionId?: unknown
  userId?: unknown
}

export async function POST(request: Request): Promise<Response> {
  let body: AnswerRequestBody

  try {
    body = (await request.json()) as AnswerRequestBody
  } catch {
    return jsonError('Request body must be valid JSON', 400)
  }

  const content = typeof body.content === 'string' ? body.content.trim() : ''
  const replyId = typeof body.replyId === 'string' ? body.replyId.trim() : null
  const postId = typeof body.postId === 'string' ? body.postId.trim() : null
  const sectionId = typeof body.sectionId === 'string' ? body.sectionId.trim() : null
  const userId = typeof body.userId === 'string' ? body.userId.trim() : null

  if (!content) {
    return jsonError('content is required', 400)
  }

  if (!replyId && !postId && !sectionId) {
    return jsonError('replyId, postId, or sectionId is required', 400)
  }

  try {
    const supabase = getSupabaseAdmin()
    let resolvedSectionId = sectionId

    if (!resolvedSectionId && replyId) {
      const { data: parentComment, error: parentError } = await supabase
        .from('comments')
        .select('section_id')
        .eq('id', replyId)
        .single<{ section_id: string | null }>()

      if (parentError) {
        throw new Error(`Failed to load parent comment: ${parentError.message}`)
      }

      resolvedSectionId = parentComment.section_id
    }

    if (!resolvedSectionId && postId) {
      resolvedSectionId = `post:${postId}`
    }

    if (!resolvedSectionId) {
      return jsonError('Could not resolve sectionId for comment', 400)
    }

    const { data, error } = await supabase
      .from('comments')
      .insert({
        section_id: resolvedSectionId,
        reply_id: replyId,
        content,
        user_id: userId,
      })
      .select('*')
      .single()

    if (error) {
      throw new Error(error.message)
    }

    await logEvent({
      eventType: 'answer.created',
      userId,
      postId,
      commentId: data.id,
      payload: {
        replyId,
        sectionId: resolvedSectionId,
      },
    })

    return jsonSuccess(data, 201)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create answer'
    return jsonError(message, 500)
  }
}
