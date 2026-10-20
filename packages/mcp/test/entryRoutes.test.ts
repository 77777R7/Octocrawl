import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { runApiServer } from '@w2l/api'
import { runCli } from '../../cli/src/index.js'
import { createLocalService, localConfigFromEnv } from '../src/localHost.js'

/**
 * The same grant and the same request give the same rungs on each entry point that runs the engine on this machine
 * (docs/pa-enhancement-tasks.md A, acceptance): the API server, a one-off octocrawl command and the local MCP host.
 * The page is on loopback and the provider rung is never reached (connectVendor waits for the first fetch), so nothing
 * here leaves the machine or costs anything.
 */
const STEEL_GRANT = JSON.stringify({ tier: 'enhanced', capabilities: ['vendor_remote_browser'], budget: { perRunUsd: 0.05, perRequestUsd: 0.05 }, tariffs: { steel: { perHourUsd: 0.1, maxSessionMs: 120000, minBilledMs: 1, billingIncrementMs: 1 } }, attestation: { principal: 'test', at: '2026-10-20T00:00:00Z', statement: 'test grant' } })

type Routes = { status: string; channelsTried: string[]; filtered: { reason: string; dropped: string[] }[] }
type Request = { access?: 'standard' | 'enhanced'; headers?: Record<string, string>; fastMode?: boolean }
type Entry = (url: string, req: Request, env: NodeJS.ProcessEnv) => Promise<Routes>

const routesOf = (response: { status: string; channelsTried: string[]; ladderTrace: { event: string; detail: { reason?: string; dropped?: string[] } }[] }): Routes => ({
  status: response.status,
  channelsTried: response.channelsTried,
  filtered: response.ladderTrace.filter((event) => event.event === 'ladder_channels_filtered').map((event) => ({ reason: event.detail.reason!, dropped: event.detail.dropped! })),
})

let site: Server
let origin: string
let root: string
const saved = { vendors: process.env.W2L_VENDORS, steel: process.env.STEEL_API_KEY }
beforeAll(async () => {
  // The provider rung is built from W2L_VENDORS and its key in the process environment (buildChannels), on every entry point.
  process.env.W2L_VENDORS = 'steel'
  process.env.STEEL_API_KEY = 'fake-steel-key'
  root = await mkdtemp(join(tmpdir(), 'w2l-entry-routes-'))
  site = createServer((req, res) => {
    if (req.url === '/robots.txt') return void res.writeHead(404).end()
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end('<html><head><title>Tides</title></head><body><main><h1>Tide table</h1><p>High water at 06:12 and 18:40, low water at 00:05 and 12:27 on the harbour gauge.</p></main></body></html>')
  })
  site.listen(0, '127.0.0.1'); await once(site, 'listening')
  origin = `http://127.0.0.1:${(site.address() as AddressInfo).port}`
})
afterAll(async () => {
  await new Promise<void>((resolve) => site.close(() => resolve()))
  await rm(root, { recursive: true, force: true })
  for (const [name, value] of [['W2L_VENDORS', saved.vendors], ['STEEL_API_KEY', saved.steel]] as const) { if (value === undefined) delete process.env[name]; else process.env[name] = value }
})

let runs = 0
const taskRoot = () => join(root, `run-${++runs}`)
const freePort = async (): Promise<number> => {
  const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening')
  const port = (probe.address() as AddressInfo).port
  await new Promise<void>((resolve) => probe.close(() => resolve()))
  return port
}

const ENTRIES: Record<string, Entry> = {
  'API server': async (url, req, env) => {
    const server = await runApiServer(['--port', String(await freePort())], { ...env, W2L_TASK_ROOT: taskRoot() }, { signals: false, log: () => {} })
    try {
      const response = await fetch(`${server.url}/v1/scrape`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url, ...req, debug: true, storeInCache: false }) })
      expect(response.status, await response.clone().text()).toBe(200)
      return routesOf(await response.json())
    } finally { await server.close() }
  },
  'octocrawl command': async (url, req, env) => {
    const out: string[] = []
    const err: string[] = []
    const flags = [...(req.access === undefined ? [] : ['--access', req.access]), ...Object.entries(req.headers ?? {}).flatMap(([name, value]) => ['--header', `${name}: ${value}`]), ...(req.fastMode === true ? ['--fast-mode'] : []), '--debug', '--store-in-cache=false']
    const code = await runCli(['scrape', url, ...flags], { env: { ...env, W2L_TASK_ROOT: taskRoot() }, stdout: (text) => out.push(text), stderr: (text) => err.push(text) })
    expect(code, err.join('\n')).toBe(0)
    return routesOf(JSON.parse(out.join('')))
  },
  'local MCP host': async (url, req, env) => {
    const port = await freePort()
    const service = createLocalService(localConfigFromEnv({ ...env, W2L_LOCAL_MCP_PORT: String(port), W2L_TASK_ROOT: taskRoot() }))
    if (!service.server.listening) await once(service.server, 'listening')
    const client = new Client({ name: 'w2l-entry-routes', version: '1.0.0' })
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)))
      const result = await client.callTool({ name: 'scrape', arguments: { url, ...req, debug: true, storeInCache: false } }, undefined, { timeout: 60_000 })
      const text = (result.content as CallToolResult['content']).find((entry) => entry.type === 'text')
      expect(result.isError, text?.type === 'text' ? text.text : '').not.toBe(true)
      return routesOf(JSON.parse(text?.type === 'text' ? text.text : '{}'))
    } finally { await client.close(); await service.close() }
  },
}

const CASES: { name: string; env: NodeJS.ProcessEnv; req: Request; routes: Omit<Routes, 'status'> }[] = [
  { name: 'enhanced, a header keeping the page off the provider', env: { W2L_ACCESS_GRANT: STEEL_GRANT }, req: { access: 'enhanced', headers: { 'accept-language': 'en' } }, routes: { channelsTried: ['http'], filtered: [{ reason: 'headers', dropped: ['provider(steel)'] }] } },
  { name: 'enhanced over HTTP alone', env: { W2L_ACCESS_GRANT: STEEL_GRANT }, req: { access: 'enhanced', fastMode: true }, routes: { channelsTried: ['http'], filtered: [{ reason: 'fastMode', dropped: ['browser_local', 'provider(steel)'] }] } },
  { name: 'standard under the same grant', env: { W2L_ACCESS_GRANT: STEEL_GRANT }, req: { access: 'standard', fastMode: true }, routes: { channelsTried: ['http'], filtered: [{ reason: 'fastMode', dropped: ['browser_local'] }] } },
  { name: 'no grant', env: {}, req: { fastMode: true }, routes: { channelsTried: ['http'], filtered: [{ reason: 'fastMode', dropped: ['browser_local'] }] } },
]

describe('one grant, one request: the same rungs on every local entry point', () => {
  for (const scenario of CASES) {
    it(scenario.name, async () => {
      const url = `${origin}/tides`
      const seen: Record<string, Routes> = {}
      for (const [entry, run] of Object.entries(ENTRIES)) seen[entry] = await run(url, scenario.req, scenario.env)
      for (const entry of Object.keys(ENTRIES)) expect(seen[entry], entry).toEqual({ status: 'success', ...scenario.routes })
    })
  }
})
