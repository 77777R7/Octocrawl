/**
 * The browser-compatible HTTP transport (ROADMAP PA item 2, ADR 0005 `compatible_transport`): the
 * HTTP lane's requests sent by impit (apify/impit, Apache-2.0), whose TLS and HTTP/2 handshakes and
 * headers are those of a real Chrome, instead of undici's.
 *
 * Identity. A profile sends a complete, ordered set of Chrome headers; overriding any one moves it to
 * the front and the set stops looking like Chrome. So this transport sends the profile's headers as
 * they are, and the lane declares the profile's identity (compatIdentity): the record states what was
 * sent, and the honesty check compares it with the declaration as for every other identity.
 * COMPAT_PROFILES is what impit sends for each profile, pinned by a test against impit itself, so an
 * impit upgrade that changes a header fails that test instead of making the record wrong.
 *
 * Body. impit decodes one coding of gzip, deflate (zlib-wrapped), br or zstd itself and keeps the
 * header; for those the adapter hides the header from the lane, which would decode twice, and reports
 * the coding (onDecoded). Any other Content-Encoding (x-gzip, a stack such as "gzip, gzip", upper case)
 * impit passes through undecoded, and so does the adapter, header and all, for the lane to decode. The
 * lane hashes decoded bytes on either transport; what it cannot know after impit decoded is how many
 * bytes crossed the wire, so it reports that as unknown. The size cap applies to the decoded bytes as
 * they stream, so a compressed bomb is cut where it passes the cap. A raw deflate stream labelled
 * deflate, which the lane's own decoder accepts, does not decode in impit: a decoding failure.
 *
 * Timeouts. As on undici: headersTimeoutMs until the response headers, then bodyTimeoutMs between two
 * chunks of the body, not for the whole body. impit also ends every request at a limit of its own
 * (30 s unless told otherwise): it is set past the caller's deadline, which ends the request first,
 * and without a deadline to COMPAT_REQUEST_CEILING_MS, so a body still arriving after that is cut as
 * a timeout where undici would keep reading. The same limit closes the connection of a request the
 * lane gave up on, which impit otherwise keeps open.
 *
 * Proxy. impit's client reads HTTP_PROXY, HTTPS_PROXY and ALL_PROXY as it is built and, without them,
 * the operating system's proxy settings (macOS), which honour NO_PROXY but not the system's own
 * exceptions. The lane decides the proxy itself, per URL (proxyFor, with NO_PROXY), so each client is
 * built with those variables out of sight, and a direct client with a NO_PROXY that exempts every
 * host so that no system proxy applies either (impit matches `*` against names only, so addresses
 * need 0.0.0.0/0 and ::/0); a proxied client is given the lane's proxy, which impit then uses alone.
 *
 * Install. impit is a native module; it is loaded on first use (loadImpit), so a platform without its
 * binary loses this transport alone, and a server that is asked for it checks at startup.
 *
 * Limits. impit resolves host names itself, outside the lane's address check that pins each connection
 * to a validated address; a local server only, never a hosted one. Standard mode only: research mode
 * declares a contact in its User-Agent, which this transport cannot send unchanged.
 */

import type { Impit } from 'impit'
import { proxyFor, type ModeIdentity, type NetworkPolicy, type SentHeadersFact } from '@w2l/contracts'
import type { ResilientResponseLike } from '@w2l/http-core'
import { ContentDecodingError, type ContentCoding } from './contentEncoding.js'
import { BodyTooLargeError } from './egress.js'
import type { PreparedHttpIdentity } from './httpIdentity.js'

export const COMPAT_LIBRARY = { name: 'impit', version: '0.14.5' } as const

/** What impit sends for each profile, in order (Host aside). */
export const COMPAT_PROFILES = {
  chrome142: {
    browser: 'chrome142',
    headers: [
      ['sec-ch-ua', '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"'],
      ['sec-ch-ua-mobile', '?0'],
      ['sec-ch-ua-platform', '"macOS"'],
      ['upgrade-insecure-requests', '1'],
      ['user-agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'],
      ['accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7'],
      ['sec-fetch-site', 'none'],
      ['sec-fetch-mode', 'navigate'],
      ['sec-fetch-user', '?1'],
      ['sec-fetch-dest', 'document'],
      ['accept-encoding', 'gzip, deflate, br, zstd'],
      ['accept-language', 'en-US,en;q=0.9'],
      ['priority', 'u=0, i'],
    ],
  },
} as const satisfies Record<string, { browser: string; headers: readonly (readonly [string, string])[] }>

export type CompatProfileName = keyof typeof COMPAT_PROFILES
export const DEFAULT_COMPAT_PROFILE: CompatProfileName = 'chrome142'

/** The identity a profile declares: its User-Agent and client hints, exactly as it sends them. */
export function compatIdentity(profile: CompatProfileName = DEFAULT_COMPAT_PROFILE): ModeIdentity {
  const sent = new Map<string, string>(COMPAT_PROFILES[profile].headers)
  return {
    mode: 'standard',
    userAgent: sent.get('user-agent')!,
    clientHints: { 'sec-ch-ua': sent.get('sec-ch-ua')!, 'sec-ch-ua-mobile': sent.get('sec-ch-ua-mobile')!, 'sec-ch-ua-platform': sent.get('sec-ch-ua-platform')! },
    respectsRobots: true,
    lane: 'browser_local',
    device: 'desktop',
  }
}

/** The lane's prepared identity for a profile: every header it sends, as the record states them. */
export function prepareCompatIdentity(profile: CompatProfileName = DEFAULT_COMPAT_PROFILE): PreparedHttpIdentity {
  const headers = Object.fromEntries(COMPAT_PROFILES[profile].headers.map(([name, value]) => [name, value]))
  const sentHeaders: SentHeadersFact = { headers: Object.entries(headers).map(([name, value]) => ({ name, value })).sort((a, b) => a.name.localeCompare(b.name)) }
  return { mode: 'standard', identity: compatIdentity(profile), headers, identityHeaders: headers, customHeaders: {}, sentHeaders }
}

let impit: Promise<typeof import('impit')> | undefined

/** impit's module, loaded once; the error says how to get it when the platform's binary is missing. */
export function loadImpit(): Promise<typeof import('impit')> {
  impit ??= import('impit').catch((error: unknown) => {
    impit = undefined
    throw new Error(`the compatible transport needs impit ${COMPAT_LIBRARY.version}, which did not load on ${process.platform}-${process.arch}: ${error instanceof Error ? error.message : String(error)}`)
  })
  return impit
}

const PROXY_VARIABLES = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy'] as const

/** Every host, by name and by address: impit's `*` does not match an IP address. */
const NO_PROXY_ANY = '*,0.0.0.0/0,::/0'

/**
 * Builds a client with the proxy variables unset, and for a direct client NO_PROXY_ANY so that the
 * system's proxy settings do not apply; the constructor is synchronous, so nothing else runs meanwhile.
 */
function withLaneProxyOnly<T>(direct: boolean, build: () => T): T {
  const saved = PROXY_VARIABLES.map(name => [name, process.env[name]] as const)
  for (const name of PROXY_VARIABLES) delete process.env[name]
  if (direct) { process.env.NO_PROXY = NO_PROXY_ANY; process.env.no_proxy = NO_PROXY_ANY }
  try { return build() } finally {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
}

/** impit's own limit for a request without a deadline; see Timeouts above. */
export const COMPAT_REQUEST_CEILING_MS = 10 * 60_000

/** impit's own limit for one request: past the caller's deadline, which ends it first; else the ceiling. */
export function impitTimeoutMs(deadlineAt: number | undefined, now = Date.now()): number {
  return deadlineAt === undefined ? COMPAT_REQUEST_CEILING_MS : Math.max(1000, deadlineAt - now + 1000)
}

/**
 * Whether a body error is a coding that did not decode. impit reports every error while it decodes
 * as `kind: Decode`, whatever the cause: bad or cut-short data (`InvalidData`, `UnexpectedEof`,
 * "brotli error", ...) or the connection under it, which carries hyper's or h2's own error, a reset,
 * or a timeout. The connection's markers are the short list, so they decide.
 */
function decodingFault(message: string): boolean {
  return /kind: Decode\b/.test(message) && !/hyper::Error|h2::|IncompleteBody|TimedOut|ConnectionReset|ConnectionAborted|BrokenPipe/.test(message)
}

/** The codings impit 0.14.5 decodes itself: one of these, exactly as written; any other header it leaves alone. */
const IMPIT_DECODES: ReadonlySet<string> = new Set(['gzip', 'deflate', 'br', 'zstd'])

/** Error names the resilient loop maps: a timeout, a DNS failure, a certificate failure, else a connection failure. */
function normalized(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error)
  const name = error instanceof Error ? error.name : ''
  const as = (n: string, code?: string) => Object.assign(new Error(message.split('\n')[0] ?? message), { name: n, ...(code === undefined ? {} : { code }), cause: error })
  if (name === 'TimeoutError' || name === 'AbortError') return error instanceof Error ? error : as('TimeoutError')
  if (/InvalidCertificate|certificate|handshake|tls|ssl/i.test(message)) {
    // Codes the resilient loop's isTlsError knows, by what the certificate failure says.
    const code = /expired/i.test(message) ? 'CERT_HAS_EXPIRED' : /not yet valid/i.test(message) ? 'CERT_NOT_YET_VALID' : /NotValidForName|name mismatch|hostname/i.test(message) ? 'HOSTNAME_MISMATCH' : /not trusted|UnknownIssuer|self.signed/i.test(message) ? 'CERT_UNTRUSTED' : 'ERR_SSL_COMPAT_TRANSPORT'
    return as('CompatTlsError', code)
  }
  if (/dns error|failed to lookup|nodename nor servname|Name or service not known/i.test(message)) return as('DnsLookupError')
  return as('ConnectError')
}

export interface CompatFetchOptions {
  signal?: AbortSignal
  headersTimeoutMs: number
  bodyTimeoutMs: number
  /** The cap for the body, chosen from its content type and whether impit decoded it; null for a type the lane does not download. */
  capFor: (contentType: string | null, decodedFrom: string | null) => number | null
  /** Request headers beyond the profile's (validators, a caller's custom headers). They are sent first, so they change the order. */
  extraHeaders?: Readonly<Record<string, string>>
  /** Certificate checks off for this request (`skipTlsVerification`). */
  ignoreTlsErrors?: boolean
  /** The caller's deadline (epoch ms), which sets impit's own limit for the request (impitTimeoutMs). */
  deadlineAt?: number
  /** Called when impit decoded a Content-Encoding the lane will not see. */
  onDecoded?: (contentEncoding: string) => void
  onBodyRead?: (ms: number) => void
}

/** One impit client per egress route and certificate mode, reused across requests. */
export class CompatTransport {
  private readonly clients = new Map<string, Impit>()
  constructor(private readonly networkPolicy: NetworkPolicy, readonly profile: CompatProfileName = DEFAULT_COMPAT_PROFILE) {}

  private async clientFor(url: string, ignoreTlsErrors: boolean): Promise<Impit> {
    const proxy = proxyFor(url, this.networkPolicy)
    const auth = proxy?.username === undefined ? '' : `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password ?? '')}@`
    const proxyUrl = proxy === null ? undefined : proxy.url.replace('://', `://${auth}`)
    const key = `${proxyUrl ?? 'direct'}|${ignoreTlsErrors}`
    let client = this.clients.get(key)
    if (client === undefined) {
      const { Impit } = await loadImpit()
      // Built after the await: another request may have built it meanwhile.
      client = this.clients.get(key) ?? withLaneProxyOnly(proxyUrl === undefined, () => new Impit({ browser: COMPAT_PROFILES[this.profile].browser, followRedirects: false, ...(proxyUrl === undefined ? {} : { proxyUrl }), ...(ignoreTlsErrors ? { ignoreTlsErrors: true } : {}) }))
      this.clients.set(key, client)
    }
    return client
  }

  async fetch(url: string, options: CompatFetchOptions): Promise<ResilientResponseLike> {
    let response: Awaited<ReturnType<Impit['fetch']>>
    const client = await this.clientFor(url, options.ignoreTlsErrors === true)
    // The caller's signal, and the headers deadline until the headers arrive; the body has its own per-chunk timer.
    const controller = new AbortController()
    const abort = () => controller.abort(options.signal?.reason)
    if (options.signal?.aborted === true) abort()
    else options.signal?.addEventListener('abort', abort, { once: true })
    let headersTimedOut = false
    const headersTimer = setTimeout(() => { headersTimedOut = true; controller.abort() }, options.headersTimeoutMs)
    try {
      response = await client.fetch(url, {
        redirect: 'manual',
        timeout: impitTimeoutMs(options.deadlineAt),
        signal: controller.signal,
        ...(options.extraHeaders === undefined || Object.keys(options.extraHeaders).length === 0 ? {} : { headers: { ...options.extraHeaders } }),
      })
    } catch (error) {
      options.signal?.removeEventListener('abort', abort)
      if (headersTimedOut && options.signal?.aborted !== true) throw Object.assign(new Error(`no response headers within ${options.headersTimeoutMs} ms`), { name: 'HeadersTimeoutError', cause: error })
      throw normalized(error)
    } finally {
      clearTimeout(headersTimer)
    }
    const coding = response.headers.get('content-encoding')?.trim() ?? null
    // A response without a body has nothing decoded, whatever its headers say.
    const bodiless = response.status < 200 || response.status === 204 || response.status === 304
    const decodedFrom = !bodiless && coding !== null && IMPIT_DECODES.has(coding) ? coding : null
    if (decodedFrom !== null) options.onDecoded?.(decodedFrom)
    // The lane reads Content-Encoding to decode: hidden when impit already has, kept when it has not.
    const header = (name: string): string | null => (decodedFrom !== null && name.toLowerCase() === 'content-encoding' ? null : response.headers.get(name))
    let bytes: Promise<Uint8Array> | undefined
    const readBody = async (): Promise<Uint8Array> => {
      const cap = options.capFor(response.headers.get('content-type'), decodedFrom)
      const reader = response.body.getReader()
      if (cap === null) { await reader.cancel().catch(() => {}); return new Uint8Array() }
      // Content-Length counts the bytes as sent: a cap on them only when nothing was decoded.
      const declared = decodedFrom === null ? Number(response.headers.get('content-length') ?? NaN) : NaN
      if (Number.isSafeInteger(declared) && declared > cap) { await reader.cancel().catch(() => {}); throw new BodyTooLargeError(cap, declared) }
      const started = performance.now()
      const chunks: Uint8Array[] = []
      let total = 0
      try {
        while (true) {
          let timer: ReturnType<typeof setTimeout> | undefined
          const stalled = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('body read timed out'), { name: 'BodyTimeoutError' })), options.bodyTimeoutMs) })
          let step: ReadableStreamReadResult<Uint8Array>
          try { step = await Promise.race([reader.read(), stalled]) } finally { clearTimeout(timer) }
          if (step.done) break
          total += step.value.byteLength
          if (total > cap) throw new BodyTooLargeError(cap)
          chunks.push(step.value)
        }
      } catch (error) {
        await reader.cancel().catch(() => {})
        if (error instanceof BodyTooLargeError || (error instanceof Error && error.name === 'BodyTimeoutError')) throw error
        if (error instanceof Error && error.name === 'AbortError') throw error
        const message = error instanceof Error ? error.message : String(error)
        // A body impit could not decode is reported as the lane reports one it could not: not the page, a parse error.
        if (decodedFrom !== null && decodingFault(message)) throw new ContentDecodingError(decodedFrom, decodedFrom as ContentCoding, 'impit_decode')
        // After the headers, the lane reads a timeout as a stalled body and anything else as a broken connection.
        const timedOut = (error instanceof Error && error.name === 'TimeoutError') || /TimedOut/.test(message)
        throw Object.assign(new Error(message.split('\n')[0] ?? message), { name: timedOut ? 'BodyTimeoutError' : 'SocketError', cause: error })
      }
      options.onBodyRead?.(Math.max(0, performance.now() - started))
      const out = new Uint8Array(total)
      let offset = 0
      for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.byteLength }
      return out
    }
    const bodyBytes = () => bytes ??= readBody().finally(() => options.signal?.removeEventListener('abort', abort))
    // The resilient loop reads a body as text only to discard it (a redirect's, a retried 503's); the lane reads
    // the answer's as bytes. undici never decodes a discarded body, so a coding that does not decode ends nothing here.
    const bodyText = async (): Promise<string> => {
      try { return new TextDecoder().decode(await bodyBytes()) } catch (error) {
        if (error instanceof ContentDecodingError) return ''
        throw error
      }
    }
    return { status: response.status, headers: { get: header }, bodyBytes, bodyText }
  }
}

/**
 * The hosts a server sends over the compatible transport (`W2L_COMPAT_HOSTS`, comma-separated host
 * names), checked at startup: they need an access grant that names `compatible_transport`, and a
 * hosted server refuses them, since impit resolves names outside the address check a hosted server
 * relies on. Empty when none are given.
 */
export function compatHostsChoice(env: NodeJS.ProcessEnv, grant: { capabilities: readonly string[] } | null, hosted: boolean): string[] {
  const raw = (env.W2L_COMPAT_HOSTS ?? '').split(',').map(value => value.trim().toLowerCase().replace(/\.$/, '')).filter(Boolean)
  if (raw.length === 0) return []
  const invalid = raw.filter(host => {
    try { return new URL(`http://${host}/`).hostname !== host || host.includes('*') } catch { return true }
  })
  if (invalid.length > 0) throw new Error(`W2L_COMPAT_HOSTS takes host names, such as example.com: not ${invalid.join(', ')}`)
  if (hosted) throw new Error('W2L_COMPAT_HOSTS is refused on a hosted server (ADR 0005: the compatible transport resolves host names outside the hosted address check)')
  if (!(grant?.capabilities ?? []).includes('compatible_transport')) {
    throw new Error('W2L_COMPAT_HOSTS needs an access grant that names compatible_transport (ADR 0005; --access-grant or W2L_ACCESS_GRANT)')
  }
  return [...new Set(raw)].sort()
}

/** Whether a URL's host is a listed host or a subdomain of one. */
export function compatHostListed(hosts: readonly string[], url: string): boolean {
  if (hosts.length === 0) return false
  let host: string
  try { host = new URL(url).hostname.toLowerCase().replace(/\.$/, '') } catch { return false }
  return hosts.some(listed => host === listed || host.endsWith(`.${listed}`))
}
