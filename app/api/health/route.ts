import { jsonSuccess } from '@/lib/server/http'

export async function GET(): Promise<Response> {
  return jsonSuccess({
    status: 'ok',
    timestamp: new Date().toISOString(),
  })
}
