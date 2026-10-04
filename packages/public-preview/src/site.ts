import type { IncomingMessage } from 'node:http'
import { createHmac } from 'node:crypto'

/** Static HTML, XML and text files carry this token wherever they need the site's absolute origin (canonical
 * links, Open Graph URLs, the sitemap). The server writes the public origin in when it serves them, so moving
 * the site to another domain is a configuration change rather than a rebuild. */
export const ORIGIN_TOKEN = '__W2L_ORIGIN__'

const LOCAL_HOST = /^(localhost|127\.0\.0\.1)(:\d+)?$/

/** Checks a configured public origin: https (http only for a local host), no path, query or fragment. */
export function parsePublicOrigin(value: string): string {
  let url: URL
  try { url = new URL(value) } catch { throw new Error('W2L_PUBLIC_ORIGIN must be an absolute URL such as https://example.com') }
  const local = LOCAL_HOST.test(url.host)
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw new Error('W2L_PUBLIC_ORIGIN must use https')
  if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw new Error('W2L_PUBLIC_ORIGIN must be an origin without a path')
  return url.origin
}

/** The host the visitor asked for. Behind the Cloudflare Worker (cloudflare/public-preview-proxy) a request reaches
 * Cloud Run on its run.app host and names the public domain in X-Forwarded-Host. That header is believed only when it
 * names the configured domain, so a forged one can never point pages, redirects or the origin check anywhere else. */
export function siteHost(req: IncomingMessage, configured: string | undefined): string {
  const host = (req.headers.host ?? '').toLowerCase()
  const forwarded = req.headers['x-forwarded-host']
  if (configured && typeof forwarded === 'string' && forwarded.toLowerCase() === new URL(configured).host) return new URL(configured).host
  return host
}

/** The origin written into served pages: the configured one, or else the host this request reached. */
export function requestOrigin(req: IncomingMessage, configured: string | undefined): string {
  if (configured) return configured
  const host = req.headers.host ?? ''
  if (!/^[a-z0-9.-]+(:\d{1,5})?$/i.test(host)) return 'http://localhost'
  return `${LOCAL_HOST.test(host) ? 'http' : 'https'}://${host.toLowerCase()}`
}

/** Where a request for a page on another host (the run.app address, say) belongs, once a public origin is set. */
export function canonicalRedirect(req: IncomingMessage, configured: string | undefined, pathname: string): string | null {
  if (!configured || (req.method !== 'GET' && req.method !== 'HEAD')) return null
  if (pathname.startsWith('/api/') || pathname === '/healthz') return null
  const host = siteHost(req, configured)
  if (!host || host === new URL(configured).host) return null
  return `${configured}${req.url ?? '/'}`
}

export type LogLine = Record<string, unknown>
export type Logger = (line: LogLine) => void
/** One JSON object per line on stdout; Cloud Run turns it into a structured log entry. */
export const stdoutLogger: Logger = line => console.log(JSON.stringify({ severity: 'INFO', ...line }))

/** A visitor pseudonym for counting, not for following anyone: it changes every UTC day and cannot be turned back
 * into the visitor cookie or address without the server's secret. */
export function dailyVisitorId(secret: string | undefined, visitorKey: string, now = new Date()): string | null {
  if (!secret) return null
  return createHmac('sha256', secret).update(`analytics:${now.toISOString().slice(0, 10)}:${visitorKey}`).digest('hex').slice(0, 16)
}

/** Do Not Track or Global Privacy Control: the visitor asked not to be counted, so nothing about them is logged. */
export function optedOut(req: IncomingMessage): boolean {
  return req.headers.dnt === '1' || req.headers['sec-gpc'] === '1'
}

export function looksAutomated(req: IncomingMessage): boolean {
  const agent = req.headers['user-agent']
  return typeof agent !== 'string' || /bot|crawl|spider|slurp|headless|preview|fetch|curl|wget|python|node|go-http|java\//i.test(agent)
}

export const EVENT_BODY_BYTES = 2_048
const EVENT_NAMES = new Set([
  'page_view', 'example_click', 'view_change', 'result_copy', 'result_download',
  'get_code_open', 'get_code_copy', 'link_click', 'docs_code_copy', 'mcp_client_select', 'example_tab', 'selfhost_tab',
  'waitlist_open', 'waitlist_submit',
])
const PROP_KEYS = new Set(['path', 'ref', 'utm_source', 'utm_medium', 'utm_campaign', 'view', 'tab', 'target', 'href', 'client', 'trigger'])

export type WebEvent = { name: string; props: Record<string, string | number | boolean> }

/** Accepts only the page's own event names and a few short properties; anything else is refused, not trimmed. */
export function parseWebEvent(body: unknown): WebEvent | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const { name, props = {} } = body as { name?: unknown; props?: unknown }
  if (typeof name !== 'string' || !EVENT_NAMES.has(name)) return null
  if (!props || typeof props !== 'object' || Array.isArray(props)) return null
  const clean: WebEvent['props'] = {}
  for (const [key, value] of Object.entries(props)) {
    if (!PROP_KEYS.has(key)) return null
    if (typeof value === 'string') {
      if (value.length > 120 || /[\u0000-\u001f\u007f]/.test(value)) return null
      clean[key] = value
    } else if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) clean[key] = value
    else return null
  }
  return { name, props: clean }
}

/** The target's host, for knowing which kinds of sites visitors try; the path and query are never logged. */
export function targetHost(submitted: string): string | null {
  try { return new URL(submitted).hostname.replace(/^www\./, '') || null } catch { return null }
}
