import { cookies } from 'next/headers'
import { logEvent } from '@/lib/server/helpers/logEvent'
import { jsonError, jsonSuccess } from '@/lib/server/http'
import { createComment } from '@/lib/server/discussions'
import { getCurrentUserProfile } from '@/lib/server/profile'
import { createClient } from '@/utils/supabase/server'

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
  const requestUserId = typeof body.userId === 'string' ? body.userId.trim() : null

  if (!content) {
    return jsonError('content is required', 400)
  }

  if (!replyId && !postId && !sectionId) {
    return jsonError('replyId, postId, or sectionId is required', 400)
  }

  try {
    let resolvedPostId = postId || sectionId?.replace(/^post:/, '') || ''
    const profile = await getCurrentUserProfile()
    const userId = profile?.id ?? requestUserId

    if (!resolvedPostId && replyId) {
      const supabase = createClient(await cookies())
      const { data: parentComment, error: parentError } = await supabase
        .from('comments')
        .select('post_id')
        .eq('id', replyId)
        .single<{ post_id: string }>()

      if (parentError) {
        throw new Error(`Failed to load parent comment: ${parentError.message}`)
      }

      resolvedPostId = parentComment.post_id
    }

    if (!resolvedPostId) {
      return jsonError('Could not resolve sectionId for comment', 400)
    }

    const data = await createComment({
      postId: resolvedPostId,
      userId,
      content,
      replyId,
    })

    await logEvent({
      eventType: 'answer.created',
      userId,
      postId: resolvedPostId,
      commentId: data.id,
      payload: {
        replyId,
        sectionId: data.section_id,
      },
    })

    return jsonSuccess(data, 201)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create answer'
    return jsonError(message, 500)
  }
}
