import { jsonError } from '@/lib/server/http'

export async function POST(): Promise<Response> {
  return jsonError('The notes endpoint has been removed from the simplified backend schema', 410)
}
