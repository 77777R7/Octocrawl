// Kept apart from preview.ts, which loads the reading engine: the server checks addresses (/api/capability) and the
// CLI checks the Amazon state at start-up without loading it (server.ts loads preview.ts on the first run).

export interface NormalizedPreviewUrl {
  url: string
  amazonAsin: string | null
}

const AMAZON_HOSTS = new Set(['amazon.sg', 'www.amazon.sg'])
const AMAZON_ASIN_PATH = /^\/dp\/([A-Z0-9]{10})\/?$/i

/** Normalize only supported public URL forms. Do not pass visitor options to the crawler. */
export function normalizePreviewUrl(input: unknown): NormalizedPreviewUrl {
  if (typeof input !== 'string' || input.length > 2048 || input.length === 0) throw new Error('Enter a public page URL with no more than 2,048 characters.')
  let parsed: URL
  try { parsed = new URL(input) } catch { throw new Error('Enter a valid HTTP or HTTPS page URL.') }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.port || !parsed.hostname) {
    throw new Error('Use a public HTTP or HTTPS URL without credentials or a custom port.')
  }
  parsed.hash = ''
  const asin = AMAZON_HOSTS.has(parsed.hostname) ? AMAZON_ASIN_PATH.exec(parsed.pathname)?.[1]?.toUpperCase() ?? null : null
  if (asin !== null) return { url: `https://www.amazon.sg/dp/${asin}`, amazonAsin: asin }
  return { url: parsed.href, amazonAsin: null }
}

export function validateAmazonPublicState(serialized: string): void {
  let state: unknown
  try { state = JSON.parse(serialized) } catch { throw new Error('Amazon public preference state is not valid JSON') }
  if (state === null || typeof state !== 'object' || Array.isArray(state)) throw new Error('Amazon public preference state is invalid')
  const { cookies, origins } = state as Record<string, unknown>
  if (!Array.isArray(cookies) || !Array.isArray(origins)) throw new Error('Amazon public preference state is invalid')
  const scoped = (host: string) => AMAZON_HOSTS.has(host.replace(/^\./, '').toLowerCase())
  if (cookies.some(cookie => cookie === null || typeof cookie !== 'object' || Array.isArray(cookie)
    || typeof cookie.domain !== 'string' || !scoped(cookie.domain))) throw new Error('Amazon state contains out-of-scope cookies')
  if (origins.some(origin => {
    if (origin === null || typeof origin !== 'object' || Array.isArray(origin) || typeof origin.origin !== 'string') return true
    try { const url = new URL(origin.origin); return url.protocol !== 'https:' || !scoped(url.hostname) }
    catch { return true }
  })) throw new Error('Amazon state contains out-of-scope origins')
  if (!cookies.some(cookie => cookie.name === 'i18n-prefs' && cookie.value === 'SGD' && scoped(cookie.domain))) throw new Error('Amazon state lacks SGD preference')
}
