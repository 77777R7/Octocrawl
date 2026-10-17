import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { Client as ModernClient, StreamableHTTPClientTransport as ModernTransport } from '@modelcontextprotocol/client'
import { hostedNetworkPolicy, type CompactScrapeResponse } from '@w2l/contracts'
import { MCP_VERSION } from '../src/server.js'
import { expectUsableInstructions } from './instructionChecks.js'
import { TOOL_NAMES } from '../src/tools.js'
import { accessTokenDigest, BROWSER_BUSY_RETRY_MAX_S, createHostedApi, FirestoreHostedKeys, FirestoreHostedLeases, FirestoreHostedOAuthTokens, fromClaude, keyDigest, MCP_OAUTH_RESOURCE, MemoryHostedKeys, MemoryHostedLeases, MemoryHostedOAuthTokens, MemoryHostedQuota, SITE_ACCOUNT_HEADER, SITE_ACCOUNT_TTL_MS, siteAccountAssertion, sweepTaskRoot, verifySiteAccount, type HostedKeyRecord, type HostedKeys, type HostedOAuthTokenRecord, type HostedOAuthTokens } from '../src/hostedApi.js'
import { MemoryCreditsStore, type CreditsStore } from '../src/hostedCredits.js'
import { mkdir, readdir, utimes, writeFile } from 'node:fs/promises'

const HASH_KEY = 'h'.repeat(40)
const PROSE = 'The harbour office records tide height, wind and visibility for every hour of the day and publishes them each morning. '.repeat(4)
const PAGE = `<!doctype html><html lang="en"><head><title>Tides</title></head><body><main><article><h1>Tides</h1><p>${PROSE}</p></article></main></body></html>`
// A client-rendered shell: the http lane asks for the browser lane, which a caller without one never gets.
const SHELL = '<!doctype html><html><head><title>App</title></head><body><div id="root"></div><noscript>Enable JavaScript to run this app.</noscript></body></html>'

let site: Server
let origin: string
beforeAll(async () => {
  site = createServer((req, res) => {
    if (req.url === '/robots.txt') return void res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nDisallow: /private\nAllow: /\n')
    if (req.url === '/missing') return void res.writeHead(404, { 'content-type': 'text/html' }).end('<!doctype html><title>Not found</title><h1>Not found</h1>')
    if (req.url === '/shell') return void res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(SHELL)
    if (req.url === '/slow') return void setTimeout(() => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE), 1_500)
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE)
  })
  site.listen(0, '127.0.0.1'); await once(site, 'listening')
  origin = `http://127.0.0.1:${(site.address() as AddressInfo).port}`
})
afterAll(async () => { await new Promise<void>((resolve) => site.close(() => resolve())) })

let close: (() => Promise<void>) | undefined
let root: string | undefined
afterEach(async () => { await close?.(); close = undefined; if (root) await rm(root, { recursive: true, force: true }); root = undefined })

async function freePort(): Promise<number> {
  const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening')
  const port = (probe.address() as AddressInfo).port
  await new Promise<void>((resolve) => probe.close(() => resolve()))
  return port
}

async function start(options: { keylessDaily?: number; claudeDaily?: number; proxySecret?: string; keys?: Record<string, HostedKeyRecord>; keyRecords?: Record<string, HostedKeyRecord>; oauthTokens?: Record<string, HostedOAuthTokenRecord>; oauthTokenStore?: HostedOAuthTokens; now?: () => number; keyStore?: HostedKeys; credits?: CreditsStore | null; leases?: MemoryHostedLeases; log?: (line: string) => void } = {}) {
  root = await mkdtemp(join(tmpdir(), 'octocrawl-hosted-api-'))
  const port = await freePort()
  // `keys` are stored under their plaintext's digest; `keyRecords` under their own id, as a connection's key record has no plaintext.
  const records = new Map([...Object.entries(options.keys ?? {}).map(([key, record]) => [keyDigest(HASH_KEY, key), record] as const), ...Object.entries(options.keyRecords ?? {})])
  const oauthTokens = new MemoryHostedOAuthTokens(new Map(Object.entries(options.oauthTokens ?? {}).map(([token, record]) => [accessTokenDigest(HASH_KEY, token), record])))
  const quota = new MemoryHostedQuota()
  const service = createHostedApi({
    port, host: '127.0.0.1', taskRoot: root, hashKey: HASH_KEY, keys: options.keyStore ?? new MemoryHostedKeys(records), oauthTokens: options.oauthTokenStore ?? oauthTokens, ...(options.now ? { now: options.now } : {}), quota, leases: options.leases,
    ...(options.credits === null ? {} : { credits: options.credits ?? new MemoryCreditsStore() }),
    keylessDaily: options.keylessDaily ?? 2, claudeDaily: options.claudeDaily, siteDaily: 100, proxySecret: options.proxySecret,
    networkPolicy: { ...hostedNetworkPolicy(), privateAllowlist: ['127.0.0.0/8'] }, log: options.log ?? (() => {}),
  })
  close = service.close
  if (!service.server.listening) await once(service.server, 'listening')
  return { url: `http://127.0.0.1:${port}`, quota, server: service.server }
}

const post = (url: string, path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${url}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })

it('serves scrape and map only, and refuses the rest by name with a hint to run locally', async () => {
  const { url, server } = await start()
  // The keep-alive idle timeout goes through closeIdleOnlyWhenUnread (packages/api/test/keepAlive.test.ts tests it).
  expect(server.listenerCount('timeout')).toBe(1)
  expect(await (await fetch(`${url}/health`)).json()).toMatchObject({ ok: true, tools: ['scrape', 'map', 'scrape_product'] })
  for (const [method, path] of [['GET', '/v1/crawl/active'], ['POST', '/v1/crawl'], ['POST', '/v1/batches'], ['GET', '/v1/monitors'], ['POST', '/fc/v1/scrape'], ['GET', '/v1/logins'], ['POST', '/v1/logins/import'], ['DELETE', '/v1/logins/example.com'], ['POST', '/v1/sessions/managed'], ['GET', '/v1/sessions/s1'], ['POST', '/v1/sessions/s1/capture']] as const) {
    const response = await fetch(`${url}${path}`, { method, headers: { 'content-type': 'application/json' }, body: method === 'POST' ? '{}' : undefined })
    expect(response.status, `${method} ${path}`).toBe(403)
    const body = await response.json() as { code: string; agentHints: string[] }
    expect(body.code).toBe('hosted_unavailable')
    expect(body.agentHints.join(' ')).toContain('npx octocrawl serve')
  }
  // A private or metadata address is refused by the hosted network policy: a result that says so, never a fetch.
  const metadata = await post(url, '/v1/scrape', { url: 'http://169.254.169.254/computeMetadata/v1/' })
  expect(metadata.status).toBe(200)
  const refused = await metadata.json() as { status: string }
  expect(refused.status).not.toBe('success')
  expect(JSON.stringify(refused)).toMatch(/private|policy|link.?local|metadata/i)
})

it('keyless: reads a page over the HTTP lane alone, within a daily allowance, then answers 429 until UTC midnight', async () => {
  const { url, quota } = await start({ keylessDaily: 3 })
  const first = await post(url, '/v1/scrape', { url: `${origin}/page`, formats: ['markdown'] })
  expect(first.status).toBe(200)
  const result = await first.json() as { status: string; lane: string; markdown: string }
  expect(result.status).toBe('success')
  expect(result.lane).toBe('http')
  expect(result.markdown).toContain('Tides')
  // A screenshot needs the browser lane, which keyless use never has: refused by name. The start still counts, so a loop of refused requests cannot probe for free.
  const screenshot = await post(url, '/v1/scrape', { url: `${origin}/page`, formats: ['screenshot'] })
  expect(screenshot.status).toBe(400)
  expect(((await screenshot.json()) as { error: string }).error).toContain('fastMode')
  expect((await post(url, '/v1/scrape', { url: `${origin}/page` })).status).toBe(200)
  const third = await post(url, '/v1/scrape', { url: `${origin}/page` })
  expect(third.status).toBe(429)
  expect(Number(third.headers.get('retry-after'))).toBeGreaterThan(0)
  const body = await third.json() as { code: string; agentHints: string[] }
  expect(body.code).toBe('quota_exhausted')
  expect(body.agentHints.join(' ')).toContain('key')
  expect((await post(url, '/v1/scrape', { url: `${origin}/page` }, { 'content-type': 'text/plain' })).status).toBe(429)
  // Three starts counted (two reads and the refused screenshot), the fourth refused.
  expect([...quota.counts.values()].sort()).toEqual([3, 3])
})

it('a key is looked up by its digest, a revoked or unknown one is 401, and a key holder has its own allowance', async () => {
  const { url } = await start({ keylessDaily: 1, keys: { 'oc_live': { enabled: true, plan: 'free', dailyLimit: 3, browser: true }, 'oc_off': { enabled: false, plan: 'free', dailyLimit: 3, browser: true } } })
  expect((await post(url, '/v1/scrape', { url: `${origin}/page` }, { authorization: 'Bearer oc_nobody' })).status).toBe(401)
  expect((await post(url, '/v1/scrape', { url: `${origin}/page` }, { authorization: 'Bearer oc_off' })).status).toBe(401)
  expect((await post(url, '/v1/scrape', { url: `${origin}/page` })).status).toBe(200)
  expect((await post(url, '/v1/scrape', { url: `${origin}/page` })).status).toBe(429)
  for (let i = 0; i < 3; i++) expect((await post(url, '/v1/scrape', { url: `${origin}/page` }, { authorization: 'Bearer oc_live' })).status).toBe(200)
  const spent = await post(url, '/v1/scrape', { url: `${origin}/page` }, { authorization: 'Bearer oc_live' })
  expect(spent.status).toBe(429)
  expect(((await spent.json()) as { error: string }).error).toContain('key allowance')
})

it('Claude\'s egress range is one published IPv4 block, matched exactly', () => {
  for (const inside of ['160.79.104.0', '160.79.105.17', '160.79.111.255']) expect(fromClaude(inside), inside).toBe(true)
  for (const outside of ['160.79.103.255', '160.79.112.0', '203.0.113.1', '2607:6bc0::1', 'unknown', '']) expect(fromClaude(outside), outside).toBe(false)
})

it('keyless calls from Claude\'s egress range share one pool of their own, beside every address\'s own day', async () => {
  const { url } = await start({ keylessDaily: 1, claudeDaily: 2, proxySecret: 's'.repeat(32), keys: { oc_range: { enabled: true, plan: 'free', dailyLimit: 5, browser: false } } })
  const from = (ip: string) => ({ 'x-w2l-proxy-secret': 's'.repeat(32), 'cf-connecting-ip': ip })
  // Two of Anthropic's addresses draw on the same two pages, past the one an address gets.
  expect((await post(url, '/v1/scrape', { url: `${origin}/page` }, from('160.79.104.10'))).status).toBe(200)
  expect((await post(url, '/v1/scrape', { url: `${origin}/page` }, from('160.79.110.20'))).status).toBe(200)
  const spent = await post(url, '/v1/scrape', { url: `${origin}/page` }, from('160.79.104.10'))
  expect(spent.status).toBe(429)
  const refusal = await spent.json() as { error: string; agentHints: string[] }
  expect(refusal.error).toContain('every Claude connector without a key shares')
  // A key cannot be sent from claude.ai, so the hint says to run Octocrawl on your computer rather than to get one.
  expect(refusal.agentHints[0]).toContain('npx octocrawl serve')
  expect((await post(url, '/v1/scrape', { url: `${origin}/page` }, { ...from('160.79.104.10'), authorization: 'Bearer oc_range' })).status).toBe(200)
  // An address outside the range keeps its own day.
  expect((await post(url, '/v1/scrape', { url: `${origin}/page` }, from('203.0.113.9'))).status).toBe(200)
  // Without the Worker's secret an address in the range is not believed, and a key holder in the range keeps the key's day.
  expect((await post(url, '/v1/scrape', { url: `${origin}/page` }, { 'cf-connecting-ip': '160.79.104.10' })).status).toBe(200)
  // The MCP endpoint counts the same way: the pool is spent.
  const transport = new StreamableHTTPClientTransport(new URL(`${url}/mcp`), { requestInit: { headers: from('160.79.106.30') } })
  const client = new Client({ name: 'octocrawl-test-client', version: '1.0.0' })
  try {
    await client.connect(transport)
    await expect(client.callTool({ name: 'scrape', arguments: { url: `${origin}/page` } })).rejects.toThrow(/Claude connector|429/)
  } finally { await client.close() }
})

it('the Worker\'s address header counts only with the shared secret', async () => {
  const { url } = await start({ keylessDaily: 1, proxySecret: 's'.repeat(32) })
  // Two visitors behind the Worker: each has its own day.
  expect((await post(url, '/v1/scrape', { url: `${origin}/page` }, { 'x-w2l-proxy-secret': 's'.repeat(32), 'cf-connecting-ip': '203.0.113.1' })).status).toBe(200)
  expect((await post(url, '/v1/scrape', { url: `${origin}/page` }, { 'x-w2l-proxy-secret': 's'.repeat(32), 'cf-connecting-ip': '203.0.113.2' })).status).toBe(200)
  expect((await post(url, '/v1/scrape', { url: `${origin}/page` }, { 'x-w2l-proxy-secret': 's'.repeat(32), 'cf-connecting-ip': '203.0.113.1' })).status).toBe(429)
  // Without the secret the header is not believed: the socket address is the identity, shared by these calls.
  expect((await post(url, '/v1/scrape', { url: `${origin}/page` }, { 'cf-connecting-ip': '203.0.113.3' })).status).toBe(200)
  expect((await post(url, '/v1/scrape', { url: `${origin}/page` }, { 'cf-connecting-ip': '203.0.113.4' })).status).toBe(429)
})

it('the /mcp endpoint speaks Streamable HTTP, offers its tools read-only, scrape_product only to a key with the browser, and runs them through the same gate', async () => {
  const { url } = await start({ keylessDaily: 3, keys: { 'oc_live': { enabled: true, plan: 'free', dailyLimit: 3, browser: true } } })
  expect((await fetch(`${url}/mcp`, { method: 'GET' })).status).toBe(405)
  expect((await fetch(`${url}/mcp`, { method: 'POST', headers: { 'mcp-protocol-version': 'not-a-version', 'content-type': 'application/json' }, body: '{}' })).status).toBe(400)
  expect((await fetch(`${url}/mcp`, { method: 'POST', headers: { authorization: 'Bearer oc_nobody', 'content-type': 'application/json' }, body: '{}' })).status).toBe(401)
  const transport = new StreamableHTTPClientTransport(new URL(`${url}/mcp`))
  const client = new Client({ name: 'octocrawl-test-client', version: '1.0.0' })
  try {
    await client.connect(transport)
    const keyless = (await client.listTools()).tools
    expect(keyless.map((tool) => tool.name)).toEqual(['scrape', 'map'])
    // Every listed tool has a title and is read-only, as directories (Anthropic's among them) require.
    for (const tool of keyless) expect(tool.annotations, tool.name).toMatchObject({ title: expect.any(String), readOnlyHint: true })
    const result = await client.callTool({ name: 'scrape', arguments: { url: `${origin}/page`, formats: ['markdown'] } })
    const text = (result.content as { type: string; text: string }[])[0]!.text
    expect(JSON.parse(text)).toMatchObject({ status: 'success', lane: 'http' })
    await expect(client.callTool({ name: 'crawl', arguments: { url: `${origin}/` } })).rejects.toThrow('tool not available')
    await expect(client.callTool({ name: 'scrape_product', arguments: { url: 'https://www.amazon.sg/dp/B000VW9PIK' } })).rejects.toThrow('needs a key')
    await client.callTool({ name: 'scrape', arguments: { url: `${origin}/page` } })
    await client.callTool({ name: 'scrape', arguments: { url: `${origin}/page` } })
    // The fourth keyless start of the day is refused through the tool too.
    await expect(client.callTool({ name: 'scrape', arguments: { url: `${origin}/page` } })).rejects.toThrow(/allowance|429/)
  } finally { await client.close() }
  const keyed = new StreamableHTTPClientTransport(new URL(`${url}/mcp`), { requestInit: { headers: { authorization: 'Bearer oc_live' } } })
  const holder = new Client({ name: 'octocrawl-test-client', version: '1.0.0' })
  try {
    await holder.connect(keyed)
    const listed = (await holder.listTools()).tools
    expect(listed.map((tool) => tool.name)).toEqual(['scrape', 'map', 'scrape_product'])
    for (const tool of listed) expect(tool.annotations, tool.name).toMatchObject({ title: expect.any(String), readOnlyHint: true })
    // No listed tool's description sends the client to a tool hosted Octocrawl does not serve (scrape's get_scrape, 2026-10-16).
    const names = listed.map((tool) => tool.name)
    for (const tool of listed) expect(TOOL_NAMES.filter((name) => name.includes('_') && !names.includes(name) && new RegExp(`\\b${name}\\b`).test(tool.description ?? '')), tool.name).toEqual([])
    const result = await holder.callTool({ name: 'scrape', arguments: { url: `${origin}/page` } })
    expect(JSON.parse((result.content as { text: string }[])[0]!.text)).toMatchObject({ status: 'success' })
  } finally { await holder.close() }
})

it('an account\'s key spends credits by what each result returned, and says what it spent and what is left', async () => {
  const credits = new MemoryCreditsStore(1_000)
  const { url, quota } = await start({ credits, keys: { oc_account: { enabled: true, plan: 'account', dailyLimit: 0, browser: true, uid: 'account-1' } } })
  const auth = { authorization: 'Bearer oc_account' }
  // The browser lane may answer, so five are reserved; the HTTP lane read the page, so one is spent.
  const page = await post(url, '/v1/scrape', { url: `${origin}/page`, formats: ['markdown'] }, auth)
  expect(page.status).toBe(200)
  expect(await page.json()).toMatchObject({ status: 'success', lane: 'http' })
  expect([page.headers.get('x-credits-used'), page.headers.get('x-credits-remaining')]).toEqual(['1', '999'])
  // A page that does not exist costs one; one robots.txt keeps out costs nothing; a body that is not JSON costs nothing.
  const missing = await post(url, '/v1/scrape', { url: `${origin}/missing` }, auth)
  expect(await missing.json()).toMatchObject({ status: 'failed', failureReason: 'http_error' })
  expect(missing.headers.get('x-credits-used')).toBe('1')
  const disallowed = await post(url, '/v1/scrape', { url: `${origin}/private` }, auth)
  expect(((await disallowed.json()) as { status: string }).status).not.toBe('success')
  expect([disallowed.headers.get('x-credits-used'), disallowed.headers.get('x-credits-remaining')]).toEqual(['0', '998'])
  const notJson = await fetch(`${url}/v1/scrape`, { method: 'POST', headers: { 'content-type': 'application/json', ...auth }, body: 'not json' })
  expect([notJson.status, notJson.headers.get('x-credits-used'), notJson.headers.get('x-credits-remaining')]).toEqual([400, '0', '998'])
  const invalid = await post(url, '/v1/scrape', { url: 'not a url' }, auth)
  expect([invalid.status, invalid.headers.get('x-credits-used')]).toEqual([400, null])
  // A map that returned URLs costs one.
  const map = await post(url, '/v1/map', { url: `${origin}/page` }, auth)
  expect(map.status).toBe(200)
  expect([map.headers.get('x-credits-used'), map.headers.get('x-credits-remaining')]).toEqual(['1', '997'])
  // A map whose search matched nothing returned no URL and costs nothing.
  const none = await post(url, '/v1/map', { url: `${origin}/page`, search: 'zzzz-no-match', sitemap: 'skip' }, auth)
  expect(((await none.json()) as { links: unknown[] }).links).toEqual([])
  expect(none.headers.get('x-credits-used')).toBe('0')
  expect(credits.usage.get(`account-1-${new Date().toISOString().slice(0, 10)}`)).toEqual({ http: 1, browser: 0, not_found: 1, map: 1, unread: 4, credits: 3 })
  // Each start leaves one request line, newest first: what was asked for and what came back, never the page's content.
  const lines = credits.requests.get('account-1')!
  expect(lines.map(line => [line.endpoint, line.status, line.credits])).toEqual([
    ['map', 'completed', 0], ['map', 'completed', 1], ['scrape', 'invalid_request', 0], ['scrape', 'invalid_request', 0],
    ['scrape', expect.not.stringMatching(/^success$/), 0], ['scrape', 'failed', 1], ['scrape', 'success', 1],
  ])
  const read = lines.at(-1)!
  expect(read).toMatchObject({ url: `${origin}/page`, finalUrl: `${origin}/page`, lane: 'http', httpStatus: 200, robots: 'allowed', kind: 'http', links: null })
  expect(read.sha256).toMatch(/^[0-9a-f]{64}$/)
  expect(read.keyId).toBe(keyDigest(HASH_KEY, 'oc_account'))
  expect(lines[4]).toMatchObject({ url: `${origin}/private`, robots: 'disallowed', kind: 'unread' })
  expect(lines[3]).toMatchObject({ url: '', status: 'invalid_request' })
  expect(lines[1]!.links).toBeGreaterThan(0)
  expect(lines[0]!.links).toBe(0)
  // The formats a scrape named (none named: an empty list; a map: none at all), and how long each call took.
  expect(lines.map(line => line.formats)).toEqual([null, null, [], [], [], [], ['markdown']])
  for (const line of lines) expect(line.ms).toEqual(expect.any(Number))
  expect(lines.every(line => line.ms! >= 0)).toBe(true)
  // Never the page's content: its words appear nowhere in the lines.
  expect(JSON.stringify(lines)).not.toContain('Tides')
  // The site's daily total still counts every start; no per-key daily counter is kept for an account.
  expect([...credits.site.values()]).toEqual([7])
  expect(quota.counts.size).toBe(0)
})

it('a caller without the browser lane is told why a shell was read over HTTP alone, never to retry without fastMode', async () => {
  const credits = new MemoryCreditsStore(3)
  const { url } = await start({ keylessDaily: 10, credits, keys: { oc_http: { enabled: true, plan: 'free', dailyLimit: 5, browser: false }, oc_account: { enabled: true, plan: 'account', dailyLimit: 0, browser: true, uid: 'account-1' } } })
  const hintsOf = async (body: unknown, headers: Record<string, string> = {}) => {
    const answer = await (await post(url, '/v1/scrape', body, headers)).json() as { scrapeId: string; status: string; failureReason: string; lane: string; agentHints?: string[] }
    expect(answer).toMatchObject({ status: 'failed', failureReason: 'empty_unverified', lane: 'http' })
    expect(answer.agentHints?.join(' ')).not.toContain('retry without fastMode')
    // The stored record, read back by GET /v1/scrapes/:id and get_scrape, carries the same hints as the answer.
    const record = await (await fetch(`${url}/v1/scrapes/${answer.scrapeId}`, { headers })).json() as { agentHints?: string[] }
    expect(record.agentHints).toEqual(answer.agentHints)
    return answer.agentHints?.join(' ') ?? ''
  }
  // Keyless, whether fastMode is left out or sent as false: the gate pins it, and the hint says what opens the browser lane.
  for (const body of [{ url: `${origin}/shell` }, { url: `${origin}/shell`, fastMode: false }]) {
    const hints = await hintsOf(body)
    expect(hints).toContain('without a key')
    expect(hints).toContain('https://octocrawl.dev/docs/connect-mcp/')
  }
  expect(await hintsOf({ url: `${origin}/shell` }, { authorization: 'Bearer oc_http' })).toContain('this key has no browser lane')
  expect(await hintsOf({ url: `${origin}/shell` }, { authorization: 'Bearer oc_account' })).toContain('fewer credits than a browser page')
  // A page the HTTP lane reads in full carries no such hint, unless the caller asked for the browser lane by sending fastMode: false.
  const page = await (await post(url, '/v1/scrape', { url: `${origin}/page` })).json() as { status: string; agentHints?: string[] }
  expect(page.status).toBe('success')
  expect(page.agentHints ?? []).toEqual([])
  const asked = await (await post(url, '/v1/scrape', { url: `${origin}/page`, fastMode: false })).json() as { status: string; agentHints?: string[] }
  expect(asked.status).toBe('success')
  expect(asked.agentHints?.join(' ')).toContain('fastMode: false was not honoured')
  // The MCP tool goes through the same gate and carries the same hint.
  const client = new Client({ name: 'octocrawl-test-client', version: '1.0.0' })
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`${url}/mcp`)))
    const result = await client.callTool({ name: 'scrape', arguments: { url: `${origin}/shell`, fastMode: false } })
    const answer = JSON.parse((result.content as { text: string }[])[0]!.text) as { agentHints?: string[] }
    expect(answer.agentHints?.join(' ')).not.toContain('retry without fastMode')
    expect(answer.agentHints?.join(' ')).toContain('without a key')
  } finally { await client.close() }
})

it('keeps the pinned HTTP-only hint in the final verified response and stored record', async () => {
  const { url } = await start({ keylessDaily: 3 })
  const request = { url: `${origin}/page?cache-projection`, formats: ['markdown'], fastMode: false, debug: false, maxAge: 3_600_000 }
  const first = await (await post(url, '/v1/scrape', request)).json() as CompactScrapeResponse
  expect(first.usage.requestCount).toBeGreaterThan(0)
  const hit = await (await post(url, '/v1/scrape', { ...request, verify: { checks: [
    { type: 'field', path: 'usage.requestCount', min: 1 },
    { type: 'field', path: 'usage.bytesDecompressed', min: 1 },
    { type: 'field', path: 'agentHints.0', present: true },
  ] } })).json() as CompactScrapeResponse
  // Hosted calls deliberately do not fill the cache. Cache projection has a separate local API test.
  expect(hit.metadata.cacheState).toBe('miss')
  expect(hit.usage.requestCount).toBeGreaterThan(0)
  expect(hit.agentHints?.join(' ')).toContain('fastMode: false was not honoured')
  expect(hit.agentHints?.join(' ')).not.toContain('retry without fastMode')
  expect(hit.verification.status).toBe('passed')
  expect(hit.readiness.state).toBe('ready')
  expect(hit.evidenceRecord.verification?.status).toBe('passed')
  const record = await (await fetch(`${url}/v1/scrapes/${hit.metadata.scrapeId}`)).json() as { agentHints?: string[] }
  expect(record.agentHints).toEqual(hit.agentHints)
})

it('a key revoked while its lookup is cached stops at its next start; reading a result still uses the cache', async () => {
  // A store that answers from its cache unless asked for a fresh read, as FirestoreHostedKeys does.
  const stored = new Map<string, HostedKeyRecord>([[keyDigest(HASH_KEY, 'oc_soon_off'), { enabled: true, plan: 'free', dailyLimit: 5, browser: false }]])
  const cache = new Map<string, HostedKeyRecord | null>()
  const asked: boolean[] = []
  const keyStore: HostedKeys = {
    async lookup(hash, options) {
      asked.push(options?.fresh === true)
      if (options?.fresh !== true && cache.has(hash)) return cache.get(hash)!
      const record = stored.get(hash) ?? null
      cache.set(hash, record)
      return record
    },
  }
  const { url } = await start({ keyStore })
  const first = await post(url, '/v1/scrape', { url: `${origin}/page` }, { authorization: 'Bearer oc_soon_off' })
  expect(first.status).toBe(200)
  const { scrapeId } = await first.json() as { scrapeId: string }
  stored.set(keyDigest(HASH_KEY, 'oc_soon_off'), { enabled: false, plan: 'free', dailyLimit: 5, browser: false })
  expect((await fetch(`${url}/v1/scrapes/${scrapeId}`, { headers: { authorization: 'Bearer oc_soon_off' } })).status).toBe(200)
  const revoked = await post(url, '/v1/scrape', { url: `${origin}/page` }, { authorization: 'Bearer oc_soon_off' })
  expect(revoked.status).toBe(401)
  expect(asked).toEqual([true, false, true])
})

it('a key runs one browser-lane scrape at a time; a second waits with Retry-After, fastMode does not, and the lease is freed after', async () => {
  const leases = new MemoryHostedLeases()
  const { url } = await start({ leases, keys: { oc_browser: { enabled: true, plan: 'free', dailyLimit: 20, browser: true } } })
  const auth = { authorization: 'Bearer oc_browser' }
  const running = post(url, '/v1/scrape', { url: `${origin}/slow` }, auth)
  await new Promise((resolve) => setTimeout(resolve, 300))
  const busy = await post(url, '/v1/scrape', { url: `${origin}/page` }, auth)
  expect(busy.status).toBe(429)
  expect(Number(busy.headers.get('retry-after'))).toBeGreaterThanOrEqual(1)
  expect(Number(busy.headers.get('retry-after'))).toBeLessThanOrEqual(BROWSER_BUSY_RETRY_MAX_S)
  expect(await busy.json()).toMatchObject({ code: 'browser_busy' })
  // Over HTTP alone the same key is not held back, and map never is.
  expect((await post(url, '/v1/scrape', { url: `${origin}/page`, fastMode: true }, auth)).status).toBe(200)
  expect((await post(url, '/v1/map', { url: `${origin}/page` }, auth)).status).toBe(200)
  expect((await running).status).toBe(200)
  expect(leases.held.size).toBe(0)
  expect((await post(url, '/v1/scrape', { url: `${origin}/page` }, auth)).status).toBe(200)
})

it('logs each key start per key and UTC day by the digest\'s prefix, never the key, and nothing for keyless calls', async () => {
  const lines: string[] = []
  const { url } = await start({ log: (line) => lines.push(line), keys: { oc_logged_key: { enabled: true, plan: 'trial', dailyLimit: 5, browser: false } } })
  expect((await post(url, '/v1/scrape', { url: `${origin}/page` }, { authorization: 'Bearer oc_logged_key' })).status).toBe(200)
  expect((await post(url, '/v1/map', { url: `${origin}/page` }, { authorization: 'Bearer oc_logged_key' })).status).toBe(200)
  expect((await post(url, '/v1/scrape', { url: `${origin}/page` })).status).toBe(200)
  const usage = lines.map((line) => JSON.parse(line) as Record<string, unknown>).filter((line) => line.event === 'hosted_usage')
  const day = new Date().toISOString().slice(0, 10)
  expect(usage).toEqual([
    { severity: 'INFO', event: 'hosted_usage', key: keyDigest(HASH_KEY, 'oc_logged_key').slice(0, 16), plan: 'trial', endpoint: 'scrape', day },
    { severity: 'INFO', event: 'hosted_usage', key: keyDigest(HASH_KEY, 'oc_logged_key').slice(0, 16), plan: 'trial', endpoint: 'map', day },
  ])
  expect(lines.join('\n')).not.toContain('oc_logged_key')
})

/** A Firestore REST stand-in: documents by name, reads, and commits whose preconditions are checked, as the service's stores use them. */
function fakeFirestore() {
  const docs = new Map<string, { fields: Record<string, unknown>; updateTime: string }>()
  let clock = 0
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const href = String(input)
    if (href.startsWith('http://metadata.google.internal/')) return Response.json({ access_token: 'token', expires_in: 3600 })
    if (href.endsWith(':commit')) {
      const { writes } = JSON.parse(String(init?.body)) as { writes: { update?: { name: string; fields: Record<string, unknown> }; delete?: string; currentDocument?: { exists?: boolean; updateTime?: string } }[] }
      for (const write of writes) {
        const name = write.update?.name ?? write.delete!
        const doc = docs.get(name)
        const pre = write.currentDocument
        if (pre?.exists === false && doc !== undefined) return Response.json({ error: { status: 'FAILED_PRECONDITION' } }, { status: 400 })
        if (pre?.updateTime !== undefined && doc?.updateTime !== pre.updateTime) return Response.json({ error: { status: 'FAILED_PRECONDITION' } }, { status: 400 })
      }
      const writeResults = writes.map((write) => {
        const updateTime = `2026-10-13T00:00:${String(++clock).padStart(2, '0')}Z`
        if (write.delete !== undefined) docs.delete(write.delete); else docs.set(write.update!.name, { fields: write.update!.fields, updateTime })
        return { updateTime }
      })
      return Response.json({ writeResults })
    }
    const name = href.replace('https://firestore.googleapis.com/v1/', '')
    const doc = docs.get(name)
    return doc === undefined ? new Response('{}', { status: 404 }) : Response.json({ name, fields: doc.fields, updateTime: doc.updateTime })
  }) as typeof fetch
  return { docs, fetcher }
}

it('Firestore leases: one holder at a time, an expired lease is taken over, and release deletes only the holder\'s own write', async () => {
  const { docs, fetcher } = fakeFirestore()
  const leases = new FirestoreHostedLeases('project-1', fetcher)
  const t0 = new Date('2026-10-13T01:00:00Z')
  const first = await leases.acquire('browser-k1', 130_000, t0)
  expect(first.ok).toBe(true)
  const second = await leases.acquire('browser-k1', 130_000, new Date(t0.getTime() + 125_000))
  expect(second).toEqual({ ok: false, retryAfterSeconds: 5 })
  expect(await leases.acquire('browser-k2', 130_000, t0)).toMatchObject({ ok: true })
  // Past its expiry the lease is taken over; the first holder's late release then leaves the new one in place.
  const later = await leases.acquire('browser-k1', 130_000, new Date(t0.getTime() + 131_000))
  expect(later.ok).toBe(true)
  if (first.ok) await first.release()
  expect([...docs.keys()].filter((name) => name.endsWith('/browser-k1'))).toHaveLength(1)
  if (later.ok) await later.release()
  expect([...docs.keys()].filter((name) => name.endsWith('/browser-k1'))).toHaveLength(0)
})

it('Firestore keys: a lookup is cached for a minute, and a fresh one reads past the cache', async () => {
  const { docs, fetcher } = fakeFirestore()
  const keys = new FirestoreHostedKeys('project-1', fetcher)
  const name = 'projects/project-1/databases/(default)/documents/hostedApiKeys/digest-1'
  docs.set(name, { fields: { enabled: { booleanValue: true }, plan: { stringValue: 'free' }, dailyLimit: { integerValue: '5' }, browser: { booleanValue: true } }, updateTime: 't' })
  expect(await keys.lookup('digest-1')).toMatchObject({ enabled: true })
  docs.set(name, { fields: { enabled: { booleanValue: false }, plan: { stringValue: 'free' }, dailyLimit: { integerValue: '5' }, browser: { booleanValue: true } }, updateTime: 't2' })
  expect(await keys.lookup('digest-1')).toMatchObject({ enabled: true })
  expect(await keys.lookup('digest-1', { fresh: true })).toMatchObject({ enabled: false })
})

it('a key whose account was deleted, still in the key cache, is 401 and starts nothing', async () => {
  const credits = new MemoryCreditsStore(1_000)
  credits.reserve = async () => ({ ok: false, limited: 'account' })
  const { url } = await start({ credits, keys: { oc_account: { enabled: true, plan: 'account', dailyLimit: 0, browser: true, uid: 'account-1' } } })
  const refused = await post(url, '/v1/scrape', { url: `${origin}/page` }, { authorization: 'Bearer oc_account' })
  expect(refused.status).toBe(401)
  expect(await refused.json()).toMatchObject({ code: 'unauthorized', error: "this key's account no longer exists" })
  expect(credits.requests.size).toBe(0)
})

it('the site\'s signed account header spends that account\'s credits as a key would, and a forged or stale one is 401', async () => {
  const credits = new MemoryCreditsStore(1_000)
  const { url } = await start({ credits })
  const signed = { [SITE_ACCOUNT_HEADER]: siteAccountAssertion(HASH_KEY, 'account-1') }
  const page = await post(url, '/v1/scrape', { url: `${origin}/page`, formats: ['markdown'] }, signed)
  expect(page.status).toBe(200)
  expect(await page.json()).toMatchObject({ status: 'success', lane: 'http', markdown: expect.stringContaining('Tides') })
  expect([page.headers.get('x-credits-used'), page.headers.get('x-credits-remaining')]).toEqual(['1', '999'])
  const map = await post(url, '/v1/map', { url: `${origin}/page` }, { [SITE_ACCOUNT_HEADER]: siteAccountAssertion(HASH_KEY, 'account-1') })
  expect([map.status, map.headers.get('x-credits-used')]).toEqual([200, '1'])
  // The request lines name the Playground, not a key.
  expect(credits.requests.get('account-1')!.map(line => [line.endpoint, line.keyId])).toEqual([['map', 'playground:account-1'], ['scrape', 'playground:account-1']])
  // Signed with another secret, for another account, expired or too far ahead: refused before any work, nothing spent.
  const now = Date.now()
  const valid = siteAccountAssertion(HASH_KEY, 'account-1', now)
  for (const value of [siteAccountAssertion('x'.repeat(40), 'account-1'), valid.replace('account-1', 'account-2'), siteAccountAssertion(HASH_KEY, 'account-1', now - SITE_ACCOUNT_TTL_MS - 1_000), 'account-1', '']) {
    const refused = await post(url, '/v1/scrape', { url: `${origin}/page` }, { [SITE_ACCOUNT_HEADER]: value })
    expect(refused.status, value).toBe(401)
    expect(((await refused.json()) as { code: string }).code).toBe('unauthorized')
  }
  expect(verifySiteAccount(HASH_KEY, valid, now)).toBe('account-1')
  expect(verifySiteAccount(HASH_KEY, valid, now + SITE_ACCOUNT_TTL_MS + 1)).toBeNull()
  // The site's clock a few seconds ahead of this one is not a forgery.
  expect(verifySiteAccount(HASH_KEY, siteAccountAssertion(HASH_KEY, 'account-1', now + 5_000), now)).toBe('account-1')
  expect(verifySiteAccount(HASH_KEY, siteAccountAssertion(HASH_KEY, 'account-1', now + 10 * SITE_ACCOUNT_TTL_MS), now)).toBeNull()
  expect(() => siteAccountAssertion(HASH_KEY, 'a/b')).toThrow()
  expect(credits.requests.get('account-1')).toHaveLength(2)
})

it('an account with fewer credits than a browser page reads over HTTP alone, and one without credits is refused until the 1st', async () => {
  const credits = new MemoryCreditsStore(3)
  const { url } = await start({ credits, keys: { oc_account: { enabled: true, plan: 'account', dailyLimit: 0, browser: true, uid: 'account-1' } } })
  const auth = { authorization: 'Bearer oc_account' }
  for (const left of ['2', '1', '0']) {
    const response = await post(url, '/v1/scrape', { url: `${origin}/page` }, auth)
    expect(await response.json()).toMatchObject({ status: 'success', lane: 'http' })
    expect(response.headers.get('x-credits-remaining')).toBe(left)
  }
  const spent = await post(url, '/v1/scrape', { url: `${origin}/page` }, auth)
  expect(spent.status).toBe(429)
  expect(spent.headers.get('x-credits-remaining')).toBe('0')
  expect(Number(spent.headers.get('retry-after'))).toBeGreaterThan(0)
  const refusal = await spent.json() as { code: string; error: string; agentHints: string[] }
  expect(refusal.code).toBe('quota_exhausted')
  expect(refusal.error).toContain('credits are used up')
  expect(refusal.agentHints.join(' ')).toContain('on the 1st')
})

it('an account\'s MCP tool calls spend its credits through the same gate, and a server without a ledger refuses its key', async () => {
  const credits = new MemoryCreditsStore(1_000)
  const { url } = await start({ credits, keys: { oc_account: { enabled: true, plan: 'account', dailyLimit: 0, browser: false, uid: 'account-1' } } })
  const holder = new Client({ name: 'octocrawl-test-client', version: '1.0.0' })
  try {
    await holder.connect(new StreamableHTTPClientTransport(new URL(`${url}/mcp`), { requestInit: { headers: { authorization: 'Bearer oc_account' } } }))
    const result = await holder.callTool({ name: 'scrape', arguments: { url: `${origin}/page` } })
    expect(JSON.parse((result.content as { text: string }[])[0]!.text)).toMatchObject({ status: 'success' })
  } finally { await holder.close() }
  expect(credits.balances.get('account-1')).toMatchObject({ grant: 999 })
  await close?.(); close = undefined
  await rm(root!, { recursive: true, force: true }); root = undefined
  const bare = await start({ credits: null, keys: { oc_account: { enabled: true, plan: 'account', dailyLimit: 0, browser: false, uid: 'account-1' } } })
  expect((await post(bare.url, '/v1/scrape', { url: `${origin}/page` }, { authorization: 'Bearer oc_account' })).status).toBe(503)
})

it('publishes a server card with the tools /mcp lists and no sign-in, and answers 404 for any other /.well-known file', async () => {
  const { url, quota } = await start()
  const response = await fetch(`${url}/.well-known/mcp/server-card.json`)
  expect(response.status).toBe(200)
  const card = await response.json() as { serverInfo: { name: string; version: string }; authentication: { required: boolean }; tools: { name: string; description: string; inputSchema: unknown }[] }
  expect(card.serverInfo).toMatchObject({ name: 'octocrawl', version: MCP_VERSION })
  expect(card.authentication).toEqual({ required: false })
  const client = new Client({ name: 'octocrawl-test-client', version: '1.0.0' })
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`${url}/mcp`)))
    expect(card.serverInfo.version).toBe(client.getServerVersion()?.version)
    const listed = (await client.listTools()).tools
    expect(card.tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))).toEqual(listed.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })))
  } finally { await client.close() }
  // /mcp needs no sign-in, so no metadata names it: only /mcp-oauth's (below) is published.
  for (const path of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp', '/.well-known/oauth-authorization-server', '/.well-known/mcp-config', '/.well-known/mcp/server-cards.json']) {
    const missing = await fetch(`${url}${path}`)
    expect(missing.status, path).toBe(404)
    expect((await missing.json() as { code: string }).code).toBe('not_found')
  }
  // Reading discovery files spends no one's pages.
  expect(quota.counts.size).toBe(0)
})

const RESOURCE_METADATA = 'https://mcp.octocrawl.dev/.well-known/oauth-protected-resource/mcp-oauth'
/** A connection's key record: an account's, marked as OAuth's, with no plaintext anyone holds. */
const CONNECTION: HostedKeyRecord = { enabled: true, plan: 'account', dailyLimit: 0, browser: true, uid: 'account-1', kind: 'oauth' }
const HOUR = 3_600_000

it('/mcp-oauth answers a call without a valid access token with 401 naming its resource metadata, which it publishes', async () => {
  const { url, quota } = await start({ keys: { oc_live: { enabled: true, plan: 'account', dailyLimit: 0, browser: true, uid: 'account-1' } }, keyRecords: { 'connection-1': CONNECTION }, oauthTokens: { oca_good: { keyId: 'connection-1', resource: MCP_OAUTH_RESOURCE, expiresAt: Date.now() + HOUR } } })
  const initialize = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } }
  const call = (headers: Record<string, string>) => post(url, '/mcp-oauth', initialize, { accept: 'application/json, text/event-stream', ...headers })
  // No token: the challenge names the metadata and the scope, and no error (RFC 6750 §3.1), so a client starts sign-in.
  const bare = await call({})
  expect(bare.status).toBe(401)
  expect(bare.headers.get('www-authenticate')).toBe(`Bearer resource_metadata="${RESOURCE_METADATA}", scope="mcp"`)
  // An account key, an unknown token and a keyless caller are all refused here: /mcp-oauth takes OAuth access tokens only.
  for (const authorization of ['Bearer oc_live', 'Bearer oca_nobody', 'Bearer ', 'Basic abc']) {
    const refused = await call({ authorization })
    expect(refused.status, authorization).toBe(401)
    expect(refused.headers.get('www-authenticate'), authorization).toMatch(new RegExp(`^Bearer resource_metadata="${RESOURCE_METADATA.replace(/[.]/g, '\\.')}", scope="mcp"`))
  }
  expect((await call({ authorization: 'Bearer oca_nobody' })).headers.get('www-authenticate')).toContain('error="invalid_token"')
  expect((await call({ authorization: 'Bearer oca_good' })).status).toBe(200)
  // Each tool declares that it needs OAuth, top level and mirrored in _meta, as ChatGPT reads it (developers.openai.com/apps-sdk/build/auth);
  // /mcp's tools declare nothing, as before.
  const list = async (path: string, headers: Record<string, string>) => {
    const response = await post(url, path, { jsonrpc: '2.0', id: 2, method: 'tools/list' }, { accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18', ...headers })
    return ((await response.json()) as { result: { tools: Record<string, unknown>[] } }).result.tools
  }
  const oauthTools = await list('/mcp-oauth', { authorization: 'Bearer oca_good' })
  expect(oauthTools.length).toBe(3)
  for (const tool of oauthTools) expect(tool, String(tool.name)).toMatchObject({ securitySchemes: [{ type: 'oauth2', scopes: ['mcp'] }], _meta: { securitySchemes: [{ type: 'oauth2', scopes: ['mcp'] }] } })
  // Their _meta holds the status lines alone (annotations.test.ts), never securitySchemes.
  for (const tool of await list('/mcp', {})) expect([tool.securitySchemes, 'securitySchemes' in ((tool._meta ?? {}) as object)], String(tool.name)).toEqual([undefined, false])
  // Protected Resource Metadata (RFC 9728) at the path-suffixed well-known URL.
  const metadata = await fetch(`${url}/.well-known/oauth-protected-resource/mcp-oauth`)
  expect(metadata.status).toBe(200)
  expect(metadata.headers.get('access-control-allow-origin')).toBe('*')
  expect(await metadata.json()).toEqual({ resource: 'https://mcp.octocrawl.dev/mcp-oauth', authorization_servers: ['https://octocrawl.dev'], scopes_supported: ['mcp'], bearer_methods_supported: ['header'] })
  expect(quota.counts.size).toBe(0)
})

it('/mcp and /mcp-oauth serve MCP 2026-07-28 without a session, still answer a 2025-11-25 initialize, and refuse other versions as the spec says', async () => {
  const { url } = await start({ keyRecords: { 'connection-1': CONNECTION }, oauthTokens: { oca_good: { keyId: 'connection-1', resource: MCP_OAUTH_RESOURCE, expiresAt: Date.now() + HOUR } } })
  const headers = { accept: 'application/json, text/event-stream' }
  for (const [path, authorization] of [['/mcp', undefined], ['/mcp-oauth', 'Bearer oca_good']] as const) {
    const auth: Record<string, string> = authorization === undefined ? {} : { authorization }
    // A version the server does not implement: 400 and UnsupportedProtocolVersionError (-32022) naming both eras' versions.
    const refused = await post(url, path, { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }, { ...headers, ...auth, 'mcp-protocol-version': '1999-01-01' })
    expect(refused.status, path).toBe(400)
    const error = ((await refused.json()) as { error: { code: number; data: { supported: string[]; requested: string } } }).error
    expect(error.code, path).toBe(-32022)
    expect(error.data.requested, path).toBe('1999-01-01')
    expect(error.data.supported, path).toEqual(expect.arrayContaining(['2026-07-28', '2025-11-25', '2025-06-18']))
    // A 2025-11-25 client opens with initialize and is answered on that revision.
    const initialize = await post(url, path, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 't', version: '1' } } }, { ...headers, ...auth })
    expect(initialize.status, path).toBe(200)
    expect(((await initialize.json()) as { result: { protocolVersion: string } }).result.protocolVersion, path).toBe('2025-11-25')
    // A 2026-07-28 client: server/discover, then every request on its own, with no session.
    const client = new ModernClient({ name: 'octocrawl-modern-test', version: '1.0.0' }, { versionNegotiation: { mode: 'auto' } })
    try {
      await client.connect(new ModernTransport(new URL(`${url}${path}`), { requestInit: { headers: auth } }))
      expect(client.getNegotiatedProtocolVersion(), path).toBe('2026-07-28')
      const listed = (await client.listTools()).tools.map((tool) => tool.name)
      expect(listed, path).toEqual(path === '/mcp' ? ['scrape', 'map'] : ['scrape', 'map', 'scrape_product'])
      // server/discover carries the same instructions initialize does.
      expectUsableInstructions(client.getInstructions(), listed)
      const result = await client.callTool({ name: 'scrape', arguments: { url: `${origin}/page`, formats: ['markdown'] } })
      expect(JSON.parse((result.content as { text: string }[])[0]!.text), path).toMatchObject({ status: 'success' })
    } finally { await client.close() }
  }
  // /mcp-oauth's challenge is the same for a 2026-07-28 request: a client starts sign-in from it.
  const modern = { jsonrpc: '2.0', id: 1, method: 'server/discover', params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientInfo': { name: 't', version: '1' }, 'io.modelcontextprotocol/clientCapabilities': {} } } }
  const bare = await post(url, '/mcp-oauth', modern, { ...headers, 'mcp-protocol-version': '2026-07-28', 'mcp-method': 'server/discover' })
  expect(bare.status).toBe(401)
  expect(bare.headers.get('www-authenticate')).toBe(`Bearer resource_metadata="${RESOURCE_METADATA}", scope="mcp"`)
  const ended = await post(url, '/mcp-oauth', modern, { ...headers, authorization: 'Bearer oca_nobody', 'mcp-protocol-version': '2026-07-28', 'mcp-method': 'server/discover' })
  expect(ended.status).toBe(401)
  expect(ended.headers.get('www-authenticate')).toBe(`Bearer resource_metadata="${RESOURCE_METADATA}", scope="mcp", error="invalid_token"`)
})

it('an OAuth access token is its connection\'s key on /mcp-oauth only: wrong audience, expired or disconnected is 401, and REST and /mcp refuse it', async () => {
  const credits = new MemoryCreditsStore(1_000)
  const now = Date.now()
  const { url } = await start({
    credits,
    keyRecords: { 'connection-1': CONNECTION, 'connection-off': { ...CONNECTION, enabled: false }, 'plain-key': { ...CONNECTION, kind: undefined }, 'no-account': { ...CONNECTION, uid: undefined } },
    oauthTokens: {
      oca_good: { keyId: 'connection-1', resource: MCP_OAUTH_RESOURCE, expiresAt: now + HOUR },
      oca_for_mcp: { keyId: 'connection-1', resource: 'https://mcp.octocrawl.dev/mcp', expiresAt: now + HOUR },
      oca_expired: { keyId: 'connection-1', resource: MCP_OAUTH_RESOURCE, expiresAt: now - 1_000 },
      oca_disconnected: { keyId: 'connection-off', resource: MCP_OAUTH_RESOURCE, expiresAt: now + HOUR },
      oca_not_oauth: { keyId: 'plain-key', resource: MCP_OAUTH_RESOURCE, expiresAt: now + HOUR },
      oca_no_account: { keyId: 'no-account', resource: MCP_OAUTH_RESOURCE, expiresAt: now + HOUR },
      oca_orphan: { keyId: 'missing', resource: MCP_OAUTH_RESOURCE, expiresAt: now + HOUR },
    },
  })
  const holder = new Client({ name: 'octocrawl-test-client', version: '1.0.0' })
  try {
    await holder.connect(new StreamableHTTPClientTransport(new URL(`${url}/mcp-oauth`), { requestInit: { headers: { authorization: 'Bearer oca_good' } } }))
    expect((await holder.listTools()).tools.map((tool) => tool.name)).toEqual(['scrape', 'map', 'scrape_product'])
    const result = await holder.callTool({ name: 'scrape', arguments: { url: `${origin}/page` } })
    expect(JSON.parse((result.content as { text: string }[])[0]!.text)).toMatchObject({ status: 'success' })
  } finally { await holder.close() }
  // The call spent the account's credits under the connection's own key id.
  expect(credits.balances.get('account-1')).toMatchObject({ grant: 999 })
  expect(credits.requests.get('account-1')!.map((line) => line.keyId)).toEqual(['connection-1'])
  for (const token of ['oca_for_mcp', 'oca_expired', 'oca_disconnected', 'oca_not_oauth', 'oca_no_account', 'oca_orphan']) {
    const refused = await post(url, '/mcp-oauth', { jsonrpc: '2.0', id: 1, method: 'tools/list' }, { authorization: `Bearer ${token}`, accept: 'application/json, text/event-stream' })
    expect(refused.status, token).toBe(401)
    expect(refused.headers.get('www-authenticate'), token).toContain('error="invalid_token"')
  }
  // REST takes keys, not access tokens; /mcp answers an access token as it answers any key it does not know.
  const rest = await post(url, '/v1/scrape', { url: `${origin}/page` }, { authorization: 'Bearer oca_good' })
  expect(rest.status).toBe(401)
  expect(await rest.json()).toMatchObject({ code: 'unauthorized', error: expect.stringContaining('/mcp-oauth') })
  const mcp = await post(url, '/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' }, { authorization: 'Bearer oca_good', accept: 'application/json, text/event-stream' })
  expect([mcp.status, mcp.headers.get('www-authenticate')]).toEqual([401, 'Bearer'])
  // A header /mcp does not read as a bearer (a tab after the scheme) is keyless there, and its tool calls never run as the connection.
  const tabbed = await post(url, '/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'scrape', arguments: { url: `${origin}/page` } } }, { authorization: 'Bearer\toca_good', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' })
  expect(tabbed.status).toBe(200)
  expect(await tabbed.text()).not.toContain('Tides')
  expect(credits.requests.get('account-1')).toHaveLength(1)
})

it('a disconnected connection stops at its next start at once, and within a minute for calls that read the cache', async () => {
  const { docs, fetcher } = fakeFirestore()
  let clock = Date.now()
  const keys = new FirestoreHostedKeys('project-1', fetcher, 60_000, () => clock)
  const tokens = new FirestoreHostedOAuthTokens('project-1', fetcher, 60_000, () => clock)
  const root = 'projects/project-1/databases/(default)/documents'
  const record = (enabled: boolean) => ({ fields: { enabled: { booleanValue: enabled }, plan: { stringValue: 'account' }, dailyLimit: { integerValue: '0' }, browser: { booleanValue: true }, uid: { stringValue: 'account-1' }, kind: { stringValue: 'oauth' } }, updateTime: 't' })
  docs.set(`${root}/hostedApiKeys/oauth_conn`, record(true))
  docs.set(`${root}/oauthTokens/${accessTokenDigest(HASH_KEY, 'oca_live')}`, { fields: { keyId: { stringValue: 'oauth_conn' }, resource: { stringValue: MCP_OAUTH_RESOURCE }, expiresAt: { timestampValue: new Date(clock + HOUR).toISOString() } }, updateTime: 't' })
  const credits = new MemoryCreditsStore(1_000)
  const { url } = await start({ credits, keyStore: keys, oauthTokenStore: tokens, now: () => clock })
  const headers = { authorization: 'Bearer oca_live', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' }
  const list = () => post(url, '/mcp-oauth', { jsonrpc: '2.0', id: 1, method: 'tools/list' }, headers)
  expect((await list()).status).toBe(200)
  // Disconnected on the account page (public-preview account.ts): the connection's key record is disabled. Listing tools
  // reads the cache, which keeps the answer a minute at most.
  docs.set(`${root}/hostedApiKeys/oauth_conn`, record(false))
  clock += 30_000
  expect((await list()).status).toBe(200)
  clock += 31_000
  const ended = await list()
  expect(ended.status).toBe(401)
  expect(ended.headers.get('www-authenticate')).toContain('error="invalid_token"')
  // Connected again and cached again, then disconnected: a tool call reads the token and its key past the cache, so it is
  // answered 401 with the challenge at once (the client signs in again, Cursor 3.25.6 got a 200 tool error before) and spends nothing.
  docs.set(`${root}/hostedApiKeys/oauth_conn`, record(true))
  clock += 61_000
  expect((await list()).status).toBe(200)
  docs.set(`${root}/hostedApiKeys/oauth_conn`, record(false))
  const call = await post(url, '/mcp-oauth', { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'scrape', arguments: { url: `${origin}/page` } } }, headers)
  expect(call.status).toBe(401)
  expect(call.headers.get('www-authenticate')).toBe(`Bearer resource_metadata="${RESOURCE_METADATA}", scope="mcp", error="invalid_token"`)
  expect(await call.text()).not.toContain('Tides')
  expect(credits.requests.size).toBe(0)
  // The fresh read refreshed the cache, so listing tools is refused from then on too.
  expect((await list()).status).toBe(401)
})

it('an OAuth token the gate refuses is told to sign in again, without the key hints', async () => {
  // The connection is disconnected between the handler's fresh read and the gate's: the gate's refusal reaches the client
  // as a tool error, and it is the one written for an OAuth connection.
  let freshReads = 0
  const keyStore: HostedKeys = { async lookup(id, options) { if (id !== 'connection-1') return null; if (options?.fresh === true) freshReads++; return { ...CONNECTION, enabled: freshReads < 2 } } }
  const { url } = await start({ keyStore, oauthTokens: { oca_good: { keyId: 'connection-1', resource: MCP_OAUTH_RESOURCE, expiresAt: Date.now() + HOUR } } })
  const call = await post(url, '/mcp-oauth', { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'scrape', arguments: { url: `${origin}/page` } } }, { authorization: 'Bearer oca_good', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' })
  expect(call.status).toBe(200)
  const text = await call.text()
  expect(text).toContain('this connection was disconnected or its sign-in expired: sign in again')
  expect(text).not.toContain('not one Octocrawl issued')
  expect(text).not.toContain('keyless')
  expect(text).not.toContain('Tides')
  expect(freshReads).toBe(2)
})

it('/mcp keeps answering a key revoked while its lookup is cached with a tool error, as before', async () => {
  const stored = new Map<string, HostedKeyRecord>([[keyDigest(HASH_KEY, 'oc_soon_off'), { enabled: true, plan: 'free', dailyLimit: 5, browser: false }]])
  const cache = new Map<string, HostedKeyRecord | null>()
  const keyStore: HostedKeys = {
    async lookup(hash, options) {
      if (options?.fresh !== true && cache.has(hash)) return cache.get(hash)!
      const record = stored.get(hash) ?? null
      cache.set(hash, record)
      return record
    },
  }
  const { url } = await start({ keyStore })
  const headers = { authorization: 'Bearer oc_soon_off', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' }
  expect((await post(url, '/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' }, headers)).status).toBe(200)
  stored.set(keyDigest(HASH_KEY, 'oc_soon_off'), { enabled: false, plan: 'free', dailyLimit: 5, browser: false })
  const call = await post(url, '/mcp', { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'scrape', arguments: { url: `${origin}/page` } } }, headers)
  expect(call.status).toBe(200)
  expect(call.headers.get('www-authenticate')).toBeNull()
  const text = await call.text()
  expect(text).toContain('this key is not one Octocrawl issued, or it was revoked')
  expect(text).not.toContain('Tides')
})

it('Firestore access tokens: read by digest with their expiry, cached for a minute, and a fresh read past the cache', async () => {
  const { docs, fetcher } = fakeFirestore()
  const tokens = new FirestoreHostedOAuthTokens('project-1', fetcher)
  const name = 'projects/project-1/databases/(default)/documents/oauthTokens/digest-1'
  docs.set(name, { fields: { keyId: { stringValue: 'connection-1' }, resource: { stringValue: MCP_OAUTH_RESOURCE }, expiresAt: { timestampValue: '2026-10-16T01:00:00Z' } }, updateTime: 't' })
  expect(await tokens.lookup('digest-1')).toEqual({ keyId: 'connection-1', resource: MCP_OAUTH_RESOURCE, expiresAt: Date.parse('2026-10-16T01:00:00Z') })
  docs.delete(name)
  expect(await tokens.lookup('digest-1')).toMatchObject({ keyId: 'connection-1' })
  expect(await tokens.lookup('digest-1', { fresh: true })).toBeNull()
  // A record missing a field is no token.
  docs.set(name, { fields: { keyId: { stringValue: 'connection-1' }, resource: { stringValue: MCP_OAUTH_RESOURCE } }, updateTime: 't2' })
  expect(await tokens.lookup('digest-1', { fresh: true })).toBeNull()
  // A connection's key record says it is OAuth's.
  const keys = new FirestoreHostedKeys('project-1', fetcher)
  docs.set('projects/project-1/databases/(default)/documents/hostedApiKeys/connection-1', { fields: { enabled: { booleanValue: true }, plan: { stringValue: 'account' }, dailyLimit: { integerValue: '0' }, browser: { booleanValue: true }, uid: { stringValue: 'account-1' }, kind: { stringValue: 'oauth' } }, updateTime: 't' })
  expect(await keys.lookup('connection-1')).toMatchObject({ kind: 'oauth', uid: 'account-1' })
  expect(accessTokenDigest(HASH_KEY, 'oca_x')).not.toBe(keyDigest(HASH_KEY, 'oca_x'))
})

it('a body that is not JSON is 400, and a flood of made-up keys is limited per address before any lookup', async () => {
  const { url } = await start({ keylessDaily: 50 })
  const bad = await fetch(`${url}/v1/scrape`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'not json' })
  expect(bad.status).toBe(400)
  expect(((await bad.json()) as { code: string }).code).toBe('invalid_json')
  let limited = 0
  for (let i = 0; i < 130; i++) {
    const response = await post(url, '/v1/scrape', { url: `${origin}/page` }, { authorization: `Bearer made-up-${i}` })
    if (response.status === 429) { limited++; expect(response.headers.get('retry-after')).not.toBeNull() } else expect(response.status).toBe(401)
  }
  expect(limited).toBeGreaterThan(0)
})

it('sweeps scrape and map records and saved files older than the TTL from the task root', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'octocrawl-sweep-'))
  for (const sub of ['files', 'scrapes', 'maps']) {
    await mkdir(join(dir, sub), { recursive: true })
    await writeFile(join(dir, sub, 'old'), 'x')
    await writeFile(join(dir, sub, 'new'), 'x')
    const past = new Date(Date.now() - 20 * 60_000)
    await utimes(join(dir, sub, 'old'), past, past)
  }
  expect(await sweepTaskRoot(dir, 10 * 60_000)).toBe(3)
  for (const sub of ['files', 'scrapes', 'maps']) expect(await readdir(join(dir, sub))).toEqual(['new'])
  await rm(dir, { recursive: true, force: true })
})

it('answers initialize on every hosted connection with instructions for the tools it lists and the limits it has', async () => {
  const { url } = await start({
    keys: { oc_http: { enabled: true, plan: 'free', dailyLimit: 5, browser: false }, oc_browser: { enabled: true, plan: 'free', dailyLimit: 5, browser: true } },
    keyRecords: { 'connection-1': CONNECTION }, oauthTokens: { oca_good: { keyId: 'connection-1', resource: MCP_OAUTH_RESOURCE, expiresAt: Date.now() + HOUR } },
  })
  const rpc = async (path: string, method: string, headers: Record<string, string>) => {
    const params = method === 'initialize' ? { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'instructions-test', version: '1.0.0' } } : {}
    const response = await post(url, path, { jsonrpc: '2.0', id: 1, method, params }, { accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18', ...headers })
    return ((await response.json()) as { result: Record<string, unknown> }).result
  }
  const surfaces: { path: string; headers: Record<string, string>; has: string[] }[] = [
    { path: '/mcp', headers: {}, has: ['over HTTP alone', 'daily allowance'] },
    { path: '/mcp', headers: { authorization: 'Bearer oc_http' }, has: ['over HTTP alone'] },
    { path: '/mcp', headers: { authorization: 'Bearer oc_browser' }, has: ['browser lane'] },
    { path: '/mcp-oauth', headers: { authorization: 'Bearer oca_good' }, has: ['credits', 'browser lane'] },
  ]
  for (const surface of surfaces) {
    const init = await rpc(surface.path, 'initialize', surface.headers)
    const listed = ((await rpc(surface.path, 'tools/list', surface.headers)).tools as { name: string }[]).map((tool) => tool.name)
    const instructions = init.instructions as string | undefined
    expectUsableInstructions(instructions, listed)
    for (const phrase of surface.has) expect([surface.path, surface.headers, instructions!.includes(phrase)]).toEqual([surface.path, surface.headers, true])
    // Crawls, batches and Monitors are named as what runs on the person's computer, never as tools to call here.
    expect(instructions).toContain('npx octocrawl serve')
    expect(init.serverInfo).toMatchObject({ name: 'octocrawl', title: 'Octocrawl', version: MCP_VERSION, description: expect.any(String) })
  }
})
