import type { NextRequest } from 'next/server'

import { jsonError, jsonSuccess } from '@/lib/server/http'
import { findOrCreateDefaultRoom, findOrCreatePage, getPageBundle } from '@/lib/server/pages'

export async function GET(request: NextRequest): Promise<Response> {
  const url = request.nextUrl.searchParams.get('url')

  if (!url) {
    return jsonError('Missing required query parameter: url', 400)
  }

  try {
    const page = await findOrCreatePage(url)
    const room = await findOrCreateDefaultRoom(page.id)
    const bundle = await getPageBundle(page.id, room.id)

    return jsonSuccess(bundle)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load page data'
    return jsonError(message, 500)
  }
}
