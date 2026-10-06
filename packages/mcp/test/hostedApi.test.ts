import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { hostedNetworkPolicy } from '@w2l/contracts'
import { createHostedApi, keyDigest, MemoryHostedKeys, MemoryHostedQuota, sweepTaskRoot, type HostedKeyRecord } from '../src/hostedApi.js'
import { mkdir, readdir, utimes, writeFile } from 'node:fs/promises'

const HASH_KEY = 'h'.repeat(40)
const PROSE = 'The harbour office records tide height, wind and visibility for every hour of the day and publishes them each morning. '.repeat(4)
const PAGE = `<!doctype html><html lang="en"><head><title>Tides</title></head><body><main><article><h1>Tides</h1><p>${PROSE}</p></article></main></body></html>`

let site: Server
let origin: string
beforeAll(async () => {
  site = createServer((req, res) => {
    if (req.url === '/robots.txt') return void res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nAllow: /\n')
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

async function start(options: { keylessDaily?: number; proxySecret?: string; keys?: Record<string, HostedKeyRecord> } = {}) {
  root = await mkdtemp(join(tmpdir(), 'octocrawl-hosted-api-'))
  const port = await freePort()
  const records = new Map(Object.entries(options.keys ?? {}).map(([key, record]) => [keyDigest(HASH_KEY, key), record]))
  const quota = new MemoryHostedQuota()
  const service = createHostedApi({
    port, host: '127.0.0.1', taskRoot: root, hashKey: HASH_KEY, keys: new MemoryHostedKeys(records), quota,
    keylessDaily: options.keylessDaily ?? 2, siteDaily: 100, proxySecret: options.proxySecret,
    networkPolicy: { ...hostedNetworkPolicy(), privateAllowlist: ['127.0.0.0/8'] }, log: () => {},
  })
  close = service.close
  if (!service.server.listening) await once(service.server, 'listening')
  return { url: `http://127.0.0.1:${port}`, quota }
}

const post = (url: string, path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${url}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })

it('serves scrape and map only, and refuses the rest by name with a hint to run locally', async () => {
  const { url } = await start()
  expect(await (await fetch(`${url}/healthz`)).json()).toMatchObject({ ok: true, tools: ['scrape', 'map', 'scrape_product'] })
  for (const [method, path] of [['GET', '/v1/crawl/active'], ['POST', '/v1/crawl'], ['POST', '/v1/batches'], ['GET', '/v1/monitors'], ['POST', '/fc/v1/scrape'], ['GET', '/v1/logins']] as const) {
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

it('the /mcp endpoint speaks Streamable HTTP, offers three tools, and runs them through the same gate', async () => {
  const { url } = await start({ keylessDaily: 3, keys: { 'oc_live': { enabled: true, plan: 'free', dailyLimit: 3, browser: true } } })
  expect((await fetch(`${url}/mcp`, { method: 'GET' })).status).toBe(405)
  expect((await fetch(`${url}/mcp`, { method: 'POST', headers: { 'mcp-protocol-version': 'not-a-version', 'content-type': 'application/json' }, body: '{}' })).status).toBe(400)
  expect((await fetch(`${url}/mcp`, { method: 'POST', headers: { authorization: 'Bearer oc_nobody', 'content-type': 'application/json' }, body: '{}' })).status).toBe(401)
  const transport = new StreamableHTTPClientTransport(new URL(`${url}/mcp`))
  const client = new Client({ name: 'octocrawl-test-client', version: '1.0.0' })
  try {
    await client.connect(transport)
    const tools = (await client.listTools()).tools.map((tool) => tool.name)
    expect(tools).toEqual(['scrape_product', 'scrape', 'map'])
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
    const result = await holder.callTool({ name: 'scrape', arguments: { url: `${origin}/page` } })
    expect(JSON.parse((result.content as { text: string }[])[0]!.text)).toMatchObject({ status: 'success' })
  } finally { await holder.close() }
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
