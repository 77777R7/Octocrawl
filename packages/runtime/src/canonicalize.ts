/**
 * Crawl URL canonicalization. Dedupes tracking variants, not content.
 *
 * `/duplicate/a` and `/duplicate/c?utm_source=x` stay distinct: the path is
 * the page. Two `/duplicate/c` URLs that differ only by `utm_*` collapse.
 * With `ignoreQuery` the whole query string goes too, so `/list?page=2` is
 * `/list`: the crawl's `ignoreQueryParameters`.
 *
 * `visitKey` is the frontier's visited-set key: the canonical URL itself, or,
 * with `deduplicateSimilarURLs`, that URL without its scheme, a leading
 * `www.`, a trailing slash and a final index file, so that `http://www.a.test/x/`
 * and `https://a.test/x/index.html` are one visit while `/x/y` is another.
 * The key is never fetched or shown: the step keeps a real URL.
 *
 * This is not HTTP redirect following and not content-hash dedupe.
 */

const TRACKING_PARAM = /^(utm_.*|gclid|gclsrc|fbclid|msclkid|dclid|mc_cid|mc_eid|_ga|_gl|yclid|ttclid)$/i

export interface CanonicalizeOptions {
  /** Drop the whole query string, not only the tracking parameters. */
  ignoreQuery?: boolean
}

export function canonicalizeUrl(raw: string, base?: string, options: CanonicalizeOptions = {}): string | null {
  let parsed: URL
  try {
    parsed = base === undefined ? new URL(raw) : new URL(raw, base)
  } catch {
    return null
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null

  parsed.username = ''
  parsed.password = ''
  parsed.hash = ''
  parsed.hostname = parsed.hostname.toLowerCase()

  if (
    (parsed.protocol === 'http:' && parsed.port === '80') ||
    (parsed.protocol === 'https:' && parsed.port === '443')
  ) {
    parsed.port = ''
  }

  if (parsed.pathname === '') parsed.pathname = '/'

  const kept = options.ignoreQuery === true
    ? []
    : [...parsed.searchParams.entries()]
      .filter(([name]) => !TRACKING_PARAM.test(name))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  parsed.search = ''
  for (const [name, value] of kept) parsed.searchParams.append(name, value)

  return parsed.href
}

export function hostOf(canonicalUrl: string): string {
  return new URL(canonicalUrl).hostname
}

export interface VisitKeyOptions {
  /** Fold the scheme, a leading `www.`, a trailing slash and a final `index.html` / `index.htm` / `index.php` segment. */
  deduplicateSimilarURLs?: boolean
}

const INDEX_FILE = /\/index\.(?:html?|php)$/i

/** The frontier's visited-set key for a canonical URL. */
export function visitKey(canonicalUrl: string, options: VisitKeyOptions = {}): string {
  if (options.deduplicateSimilarURLs !== true) return canonicalUrl
  const parsed = new URL(canonicalUrl)
  const hostname = parsed.hostname.startsWith('www.') ? parsed.hostname.slice(4) : parsed.hostname
  const host = parsed.port === '' ? hostname : `${hostname}:${parsed.port}`
  let pathname = parsed.pathname.replace(INDEX_FILE, '/')
  if (pathname.length > 1 && pathname.endsWith('/')) pathname = pathname.slice(0, -1)
  return `${host}${pathname}${parsed.search}`
}
