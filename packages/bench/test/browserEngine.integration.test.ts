import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { chromium } from 'playwright'
import { startFixtureServer, type FixtureServer } from '@w2l/fixtures'

// Patchright's own Chromium build is a separate download; the wiring is checked with stock
// Playwright standing in for it, so the test proves which engine the lane asked for, not Patchright.
const launches: string[] = []
vi.mock('../src/subjects/browserEngine.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/subjects/browserEngine.js')>()
  return {
    ...actual,
    browserEngineFor: async (name: 'playwright' | 'patchright') => {
      launches.push(name)
      return name === 'patchright'
        ? { name, version: '1.63.0-stand-in', launch: (options: Parameters<typeof chromium.launch>[0]) => chromium.launch(options) }
        : actual.PLAYWRIGHT_ENGINE
    },
  }
})
const { BrowserLocalSubject } = await import('../src/subjects/browserLocal.js')

let server: FixtureServer
beforeAll(async () => { server = await startFixtureServer() })
afterAll(async () => { await server.close() })

describe('the public browser lane on the engine the entry point chose', () => {
  it('launches the chosen engine and says so in the trace; the default engine adds nothing to it', async () => {
    const enhanced = new BrowserLocalSubject('standard', null, false, undefined, null, undefined, null, undefined, undefined, null, false, undefined, 'patchright')
    const plain = new BrowserLocalSubject()
    try {
      const out = await enhanced.fetch(`${server.url}/static/article`)
      expect(out).toMatchObject({ status: 'success', lane: 'browser_local' })
      expect(out.trace).toContainEqual(expect.objectContaining({ event: 'browser_engine', detail: { engine: 'patchright', version: '1.63.0-stand-in' } }))
      const again = await enhanced.fetch(`${server.url}/static/article`)
      expect(again.trace.filter((event) => event.event === 'browser_engine')).toHaveLength(1)
      const def = await plain.fetch(`${server.url}/static/article`)
      expect(def.status).toBe('success')
      expect(def.trace.some((event) => event.event === 'browser_engine')).toBe(false)
      // One launch per subject: the enhanced one asked for Patchright, the default one for Playwright.
      expect(launches).toEqual(['patchright', 'playwright'])
    } finally {
      await enhanced.teardown()
      await plain.teardown()
    }
  }, 60_000)
})
