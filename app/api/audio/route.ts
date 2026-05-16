import { logEvent } from '@/lib/server/helpers/logEvent'
import { jsonError } from '@/lib/server/http'

type AudioRequestBody = {
  text?: unknown
  userId?: unknown
  pageId?: unknown
  roomId?: unknown
}

function getRequiredEnv(name: 'ELEVENLABS_API_KEY' | 'ELEVENLABS_VOICE_ID'): string {
  const value = process.env[name]

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

export async function POST(request: Request): Promise<Response> {
  let body: AudioRequestBody

  try {
    body = (await request.json()) as AudioRequestBody
  } catch {
    return jsonError('Request body must be valid JSON', 400)
  }

  const text = typeof body.text === 'string' ? body.text.trim() : ''
  const userId = typeof body.userId === 'string' ? body.userId.trim() : null
  const pageId = typeof body.pageId === 'string' ? body.pageId.trim() : null
  const roomId = typeof body.roomId === 'string' ? body.roomId.trim() : null

  if (!text) {
    return jsonError('text is required', 400)
  }

  try {
    const apiKey = getRequiredEnv('ELEVENLABS_API_KEY')
    const voiceId = getRequiredEnv('ELEVENLABS_VOICE_ID')

    const elevenLabsResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
        }),
      }
    )

    if (!elevenLabsResponse.ok) {
      const errorText = await elevenLabsResponse.text()
      throw new Error(`ElevenLabs request failed: ${errorText || elevenLabsResponse.statusText}`)
    }

    const audioBuffer = await elevenLabsResponse.arrayBuffer()

    await logEvent({
      eventType: 'audio.generated',
      userId,
      pageId,
      roomId,
      payload: {
        voiceId,
        textLength: text.length,
      },
    })

    return new Response(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate audio'
    return jsonError(message, 500)
  }
}
