import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FetchResult } from '@w2l/contracts'
import type { PreviewMap } from '../src/map.js'

// The reading engine loads on a server's first run, not at start-up (server.ts): loading it made a new Cloud Run
// instance spend ~3.8 s before its first answer, and most first answers are pages.
const loaded = vi.hoisted(() => [] as string[])
vi.mock('../src/preview.js', async (importOriginal) => {
  loaded.push('preview.js')
  const real = await importOriginal<typeof import('../src/preview.js')>()
  return {
    ...real,
    capturePreview: async (target: { url: string }) => ({
      result: {
        requestedUrl: target.url, status: 'success', failureReason: null, blockReason: null, budgetExceeded: null, markdown: '# Example page',
        evidence: { finalUrl: target.url, httpStatus: 200, rawBodySha256: 'fixture-sha' },
        usage: { attemptCount: 1, browserMs: 0, externalCostUsd: null },
        document: { title: 'Example page', adapter: { id: 'generic' }, adapterValidation: { valid: true, issues: [] } },
      } as unknown as FetchResult,
    }),
  }
})
vi.mock('../src/map.js', async (importOriginal) => {
  loaded.push('map.js')
  const real = await importOriginal<typeof import('../src/map.js')>()
  return {
    ...real,
    mapPreview: async (url: string) => ({
      url, status: 'completed', stoppedBy: null, links: [{ url, via: ['start'], robots: 'allowed' }], sources: { startPage: null, sitemap: null },
      refused: { robots: 0 }, warnings: [], elapsedMs: 1,
    }) as unknown as PreviewMap,
  }
})

const servers: Server[] = []
const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('the reading engine', () => {
  it('is not loaded to serve pages and address checks, and is loaded by the first preview and map runs', async () => {
    const { createPreviewServer } = await import('../src/server.js')
    const { validateAmazonPublicState } = await import('../src/previewUrl.js')
    const dir = await mkdtemp(join(tmpdir(), 'w2l-lazy-'))
    tempDirs.push(dir)
    await writeFile(join(dir, 'index.html'), '<h1>Home</h1>')
    const server = createPreviewServer({ quota: { consume: async () => 'ok' }, staticDir: dir, amazonState: null })
    servers.push(server)
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    expect(() => validateAmazonPublicState('{"cookies":[],"origins":[]}')).toThrow('Amazon state lacks SGD preference')
    expect((await fetch(`${base}/`)).status).toBe(200)
    expect((await fetch(`${base}/api/health`)).status).toBe(200)
    expect(await (await fetch(`${base}/api/capability?url=${encodeURIComponent('https://docs.example/page')}`)).json()).toMatchObject({ capability: { task: 'readable_page' } })
    expect(loaded).toEqual([])

    const json = { method: 'POST', headers: { 'content-type': 'application/json' } }
    const preview = await fetch(`${base}/api/preview`, { ...json, body: JSON.stringify({ url: 'https://docs.example/page' }) })
    expect(await preview.json()).toMatchObject({ status: 'success', requestedUrl: 'https://docs.example/page', title: 'Example page' })
    expect(loaded).toEqual(['preview.js'])
    const map = await fetch(`${base}/api/map`, { ...json, body: JSON.stringify({ url: 'https://docs.example/' }) })
    expect(await map.json()).toMatchObject({ status: 'success', map: { links: [{ url: 'https://docs.example/' }] } })
    expect(loaded).toEqual(['preview.js', 'map.js'])
  })
})
