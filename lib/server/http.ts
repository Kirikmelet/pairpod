export function jsonSuccess<T>(data: T, status = 200): Response {
  return Response.json({ ok: true, data }, { status })
}

export function jsonError(error: string, status = 400): Response {
  return Response.json({ ok: false, error }, { status })
}
