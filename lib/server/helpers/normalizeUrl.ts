const DEFAULT_PORTS = new Map([
  ['http:', '80'],
  ['https:', '443'],
])

export function normalizeUrl(input: string): string {
  const trimmed = input.trim()

  if (!trimmed) {
    throw new Error('URL is required')
  }

  const withProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`

  const url = new URL(withProtocol)

  url.hash = ''
  url.hostname = url.hostname.toLowerCase()

  const defaultPort = DEFAULT_PORTS.get(url.protocol)
  if (defaultPort && url.port === defaultPort) {
    url.port = ''
  }

  url.pathname = '/'
  url.search = ''

  return url.toString()
}
