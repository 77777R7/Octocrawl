import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { chromium as stock } from 'playwright'

// The real Patchright library, launching the Chromium stock Playwright already installed: its own build
// is a separate download. What is checked here, where `evaluate` runs, is decided by Patchright's client.
vi.mock('../src/subjects/browserEngine.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/subjects/browserEngine.js')>()
  return {
    ...actual,
    browserEngineFor: async (name: 'playwright' | 'patchright') => {
      if (name !== 'patchright') return actual.PLAYWRIGHT_ENGINE
      const engine = await actual.loadPatchrightEngine()
      return { ...engine, launch: (options: Parameters<typeof engine.launch>[0]) => engine.launch({ ...options, executablePath: stock.executablePath() }) }
    },
  }
})
const { BrowserLocalSubject } = await import('../src/subjects/browserLocal.js')

const PAGE = `<!doctype html><html><head><title>State</title></head><body><main><article><h1>Harbour state</h1><p>${'The harbour office publishes the tide table every morning. '.repeat(8)}</p></article></main><script>window.appState = { n: 42 }</script></body></html>`
let server: Server
let url: string
beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/robots.txt') { res.writeHead(404).end(); return }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/state`
})
afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())) })

describe('executeJavascript on the Patchright engine', () => {
  it("reads the page's own globals, as on stock Playwright, though Patchright evaluates in an isolated world by default", async () => {
    const actions = [{ type: 'executeJavascript' as const, script: 'return window.appState?.n ?? null' }]
    for (const engine of ['playwright', 'patchright'] as const) {
      const subject = new BrowserLocalSubject('standard', null, false, undefined, null, undefined, null, undefined, undefined, null, false, undefined, engine)
      try {
        const out = await subject.fetch(url, undefined, undefined, undefined, { actions })
        expect(out.status, engine).toBe('success')
        expect(out.actions?.javascriptReturns, engine).toEqual([{ type: 'number', value: 42 }])
      } finally {
        await subject.teardown()
      }
    }
  }, 90_000)
})
