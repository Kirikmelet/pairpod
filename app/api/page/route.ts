import { NextResponse } from 'next/server'
import { findOrCreateDefaultRoom, findOrCreatePage, getPageBundle } from '@/lib/server/pages'

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')
  const title = searchParams.get('title')

  if (!url) {
    return NextResponse.json(
      { ok: false, error: 'Missing required query parameter: url' },
      { status: 400 }
    )
  }

  try {
    const page = await findOrCreatePage(url)
    const room = await findOrCreateDefaultRoom(page.id)
    const bundle = await getPageBundle(page.id, room.id)

    return NextResponse.json(
      {
        ok: true,
        data: bundle,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('GET /api/page failed', {
      error,
      url,
      title,
    })

    const message = error instanceof Error ? error.message : 'Failed to load page data'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
