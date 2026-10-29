/**
 * The `octocrawl-chrome` service (ADR 0005, revision of 2026-10-27: `hosted_chrome`, a Cloud Run service of its own) and
 * the hosted API's client for it (engine.ts `HostedChromeClient`).
 *
 * The service reads one page per request with the pinned Google Chrome, headed under Xvfb (Dockerfile.hosted-chrome),
 * launched as installed_chrome is with a fresh profile per call, behind its address guard (hostedChrome.ts in
 * @w2l/bench). It is the browser lane of the hosted engine with its engine set to `hosted_chrome`, so robots.txt is read
 * and obeyed as on every hosted rung, the page is judged by the lane's own checks, and its trace names the route, the
 * pinned version, the launch and the kind of exit for the Evidence Record.
 *
 * Its HTTP surface, kept to what the rung needs:
 *
 *   POST /v1/read   { url, options?, deadlineAt? } → 200 with the lane's FetchResult; 400 for a request the rung does
 *                   not take (not http(s), an option hosted_chrome refuses, a body over 256 KiB); 503 while a page is
 *                   being read (one window per instance: Cloud Run's concurrency 1 keeps a second request off it).
 *   GET  /health    200 once the process serves.
 *
 * Authentication is Cloud Run's own IAM: the service takes no unauthenticated call, and only the runtime account of the
 * hosted API and the job worker holds `roles/run.invoker` on it. Its ingress is `all`, since neither caller has the VPC
 * egress an internal one would need (docs/hosted-api.md, The octocrawl-chrome service). The client sends a Google ID token
 * for the service's URL from the metadata server. The service checks no token itself: Cloud Run has refused a request
 * without one before it reaches the container.
 */

import { getRequestListener } from '@hono/node-server'
import { Hono } from 'hono'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { hostedNetworkPolicy, hostedVerifyRefusal, withOperatorContact, type ExecutionContext, type FetchOptions, type FetchResult, type NetworkPolicy } from '@w2l/contracts'
import { BrowserLocalSubject, CompatAddressGuard, hostedChromeRefusal, type GuardResolver, type HostedChromeClient, type InstalledChromeTestSeams } from '@w2l/api'
import type { HostedChromeExit } from './hostedChromeEgress.js'
import { withRegexLedger } from '@w2l/runtime'

/**
 * What each page option is to the service, for every key of FetchOptions (a key added there fails to compile until it is
 * placed here): `read`, taken and passed to the lane; `refused`, refused by the rung (hostedChromeRefusal, the options a
 * Chrome read as measured takes none of); `ladder`, no caller's to send: robots.txt is obeyed on every hosted rung
 * (`robotsOverride`), and the ladder's own flags stay with it. The service refuses every key not `read`, by name.
 */
const FETCH_OPTION_ROLE: Record<keyof FetchOptions, 'read' | 'refused' | 'ladder'> = {
  onlyMainContent: 'read', waitFor: 'read', timeout: 'read', maxFileBytes: 'read', parsers: 'read', includeTags: 'read',
  excludeTags: 'read', blockAds: 'read', includeHtml: 'read', includeRawHtml: 'read', includeImages: 'read',
  includeTables: 'read', attributes: 'read', list: 'read', listColumns: 'read', verify: 'read', removeBase64Images: 'read',
  headers: 'refused', mobile: 'refused', skipTlsVerification: 'refused', screenshot: 'refused', actions: 'refused',
  headersTimeoutFallback: 'ladder', robotsOverride: 'ladder',
}

/** The page options the service takes; the client sends these and the refused ones, which the service refuses by name. */
export const HOSTED_CHROME_READ_OPTIONS: ReadonlySet<string> = new Set(Object.entries(FETCH_OPTION_ROLE).filter(([, role]) => role === 'read').map(([key]) => key))
/** The largest file a hosted read saves, as the hosted API's (hostedApi.ts HOSTED_MAX_FILE_BYTES). */
const HOSTED_CHROME_MAX_FILE_BYTES = 5 * 1024 * 1024

/** The service's network policy: the hosted one, its file cap and the operator's contact, as the hosted API's (hostedPolicy). */
export function hostedChromePolicy(env: NodeJS.ProcessEnv = process.env): NetworkPolicy {
  const base = hostedNetworkPolicy()
  return withOperatorContact({ ...base, maxFileBytes: Math.min(base.maxFileBytes ?? HOSTED_CHROME_MAX_FILE_BYTES, HOSTED_CHROME_MAX_FILE_BYTES) }, env)
}

/** The largest request body the service reads. */
const MAX_BODY_BYTES = 256 * 1024
/** The longest a read may run, whatever deadline it names: the hosted API's own scrape deadline is shorter. */
export const HOSTED_CHROME_MAX_READ_MS = 180_000

/** One page for the service to read. */
export interface HostedChromeRead {
  url: string
  options: FetchOptions
  /** When the read must be done (ms since the epoch), within HOSTED_CHROME_MAX_READ_MS of its arrival. */
  deadlineAt: number
}

/** How the service reads a page; the browser lane in production (hostedChromeReader), a stand-in in tests. */
export type HostedChromeReader = (read: HostedChromeRead, signal: AbortSignal) => Promise<FetchResult>

/** The service's HTTP app (see the top of this file). */
export function createHostedChromeService(read: HostedChromeReader, clock: () => number = Date.now): Hono {
  const app = new Hono()
  let reading = false
  app.get('/health', (c) => c.json({ ok: true }))
  app.post('/v1/read', async (c) => {
    if (Number(c.req.header('content-length') ?? 0) > MAX_BODY_BYTES) return c.json({ error: 'the request body is over 256 KiB' }, 400)
    const text = await c.req.text()
    if (Buffer.byteLength(text) > MAX_BODY_BYTES) return c.json({ error: 'the request body is over 256 KiB' }, 400)
    let body: unknown
    try { body = JSON.parse(text) } catch { return c.json({ error: 'the request body must be JSON' }, 400) }
    const parsed = readOf(body, clock())
    if (typeof parsed === 'string') return c.json({ error: parsed }, 400)
    if (reading) return c.json({ error: 'this instance is reading a page: one window at a time' }, 503)
    reading = true
    try {
      return c.json(await read(parsed, c.req.raw.signal), 200)
    } finally {
      reading = false
    }
  })
  return app
}

/** The request as the service takes it, or why it does not. */
function readOf(body: unknown, now: number): HostedChromeRead | string {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return 'the request is { url, options?, deadlineAt? }'
  const { url, options = {}, deadlineAt } = body as Record<string, unknown>
  if (typeof url !== 'string') return 'url is a string'
  let parsed: URL
  try { parsed = new URL(url) } catch { return 'url is not a URL' }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return 'url is an http(s) URL'
  if (options === null || typeof options !== 'object' || Array.isArray(options)) return 'options is an object'
  const refusal = hostedChromeRefusal(options as FetchOptions)
  if (refusal === null) {
    const outside = Object.keys(options).filter((key) => !HOSTED_CHROME_READ_OPTIONS.has(key))
    if (outside.length > 0) return `hosted_chrome takes no ${outside.join(', ')}: robots.txt is obeyed on every hosted rung, and the rest is no caller's to send`
  }
  // The hosted API's own check of a task contract, made again: hosted refuses the regular-expression checks for now (ADR 0006, amendment of 2026-10-29).
  const verifyRefusal = hostedVerifyRefusal((options as FetchOptions).verify)
  if (verifyRefusal !== null) return verifyRefusal
  if (refusal !== null) return refusal
  if (deadlineAt !== undefined && (typeof deadlineAt !== 'number' || !Number.isFinite(deadlineAt))) return 'deadlineAt is a time in milliseconds since the epoch'
  const latest = now + HOSTED_CHROME_MAX_READ_MS
  return { url, options: options as FetchOptions, deadlineAt: Math.min(typeof deadlineAt === 'number' ? deadlineAt : latest, latest) }
}

/**
 * The production reader: the hosted browser lane on the `hosted_chrome` engine, behind an address guard of its own on
 * `networkPolicy` (without a login, as Chrome takes none), leaving through `exit` (hostedChromeEgress.ts): Cloud Run's
 * own egress, or the operator's datacenter proxies as the guard's dial, one chosen for each read before it starts. One
 * subject and one guard for the process; each read launches its own Chrome and profile, and deletes them after.
 */
export function hostedChromeReader(networkPolicy: NetworkPolicy, exit: HostedChromeExit, seams: InstalledChromeTestSeams = {}, resolve?: GuardResolver): { read: HostedChromeReader; close: () => Promise<void> } {
  const guard = new CompatAddressGuard(networkPolicy, resolve, { login: false, ...(exit.dial === undefined ? {} : { dial: exit.dial }) })
  const subject = new BrowserLocalSubject('standard', null, true, networkPolicy, null, undefined, null, undefined, undefined, null, false, undefined, 'hosted_chrome', 'actual', seams, null, undefined, { guard, egressKind: exit.kind, proxy: () => exit.proxy() })
  return {
    // The service reads one page at a time (createHostedChromeService), so the read's exit is chosen here and held by all its connections.
    // One read is one request for its regular-expression checks: the region wait and the extraction candidates share its steering pool.
    read: (request, signal) => { exit.choose(); return withRegexLedger(() => subject.fetch(request.url, request.deadlineAt, signal, undefined, request.options)) },
    close: async () => { await subject.teardown(); await guard.close() },
  }
}

/** Starts the service's HTTP server on `port` (0: any free one) on all interfaces, as Cloud Run expects. */
export async function serveHostedChrome(app: Hono, port: number): Promise<{ server: Server; port: number }> {
  const server = createServer(getRequestListener(app.fetch))
  await new Promise<void>((resolve) => server.listen(port, resolve))
  return { server, port: (server.address() as AddressInfo).port }
}

/**
 * The hosted API's client for the service: POST /v1/read with the call's URL, options and deadline, a Google ID token for
 * the service's URL, and the call's signal. An answer other than 200 throws, naming its status: the ladder records the
 * rung as failed, and the page is what the rungs before it read.
 */
export function httpHostedChromeClient(serviceUrl: string, idToken: () => Promise<string>, fetcher: typeof fetch = fetch): HostedChromeClient {
  const endpoint = new URL('/v1/read', serviceUrl)
  if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && endpoint.hostname === '127.0.0.1')) throw new Error('the octocrawl-chrome service is reached over https')
  return {
    async fetch(url: string, options: FetchOptions | undefined, execution: ExecutionContext | undefined): Promise<FetchResult> {
      const response = await fetcher(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${await idToken()}` },
        body: JSON.stringify({ url, options: readOptions(options), ...(execution?.deadlineAt === undefined ? {} : { deadlineAt: execution.deadlineAt }) }),
        ...(execution?.signal === undefined ? {} : { signal: execution.signal }),
      })
      if (response.status !== 200) throw new Error(`the octocrawl-chrome service answered ${response.status}`)
      return await response.json() as FetchResult
    },
  }
}

/**
 * The options a read is sent with: the ones the service takes, and the options the rung refuses, which the service then
 * refuses by name. A ladder's own flags, and a robots.txt override no hosted engine sets, are not sent.
 */
function readOptions(options: FetchOptions | undefined): Partial<FetchOptions> {
  return Object.fromEntries(Object.entries(options ?? {}).filter(([key, value]) => value !== undefined && FETCH_OPTION_ROLE[key as keyof FetchOptions] !== undefined && FETCH_OPTION_ROLE[key as keyof FetchOptions] !== 'ladder'))
}

/** A Google ID token for `audience` (the service's URL) from the metadata server, kept until five minutes before it expires. */
export function metadataIdToken(audience: string, fetcher: typeof fetch = fetch, clock: () => number = Date.now): () => Promise<string> {
  let kept: { token: string; until: number } | null = null
  return async () => {
    if (kept !== null && clock() < kept.until) return kept.token
    const url = `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(audience)}`
    const response = await fetcher(url, { headers: { 'metadata-flavor': 'Google' }, signal: AbortSignal.timeout(3_000) })
    if (!response.ok) throw new Error(`the metadata server gave no ID token (${response.status})`)
    const token = (await response.text()).trim()
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8') || '{}') as { exp?: number }
    kept = { token, until: typeof payload.exp === 'number' ? payload.exp * 1000 - 300_000 : clock() + 600_000 }
    return token
  }
}
