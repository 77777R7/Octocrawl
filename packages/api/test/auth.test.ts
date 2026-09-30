import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.js'
import type { ApiEngine } from '../src/engine.js'

// Byte lengths of each buffer pair the server compares with timingSafeEqual.
const compared = vi.hoisted(() => [] as number[][])
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>()
  return {
    ...actual,
    timingSafeEqual: (a: NodeJS.ArrayBufferView, b: NodeJS.ArrayBufferView) => {
      compared.push([a.byteLength, b.byteLength])
      return actual.timingSafeEqual(a, b)
    },
  }
})

// The token is checked before the engine is asked anything: a request that
// passes it reaches the stub engine and gets 404 for a crawl that does not exist.
const engine = { getCrawl: async () => null } as unknown as ApiEngine
const unauthorized = { status: 401, body: { error: 'unauthorized', code: 'unauthorized' } }

async function call(app: ReturnType<typeof createApp>, authorization?: string): Promise<{ status: number; body: unknown }> {
  const res = await app.request('/v1/crawl/missing', authorization === undefined ? {} : { headers: { authorization } })
  return { status: res.status, body: await res.json() }
}

describe('bearer tokens', () => {
  it('accepts any configured token and compares fixed-length digests of all of them', async () => {
    const app = createApp(engine, { tokens: ['alpha-token', 'beta-token'] })
    expect((await call(app, 'Bearer alpha-token')).status).toBe(404)
    expect((await call(app, 'Bearer beta-token')).status).toBe(404)
    compared.length = 0
    expect(await call(app, 'Bearer gamma')).toEqual(unauthorized)
    expect(compared).toEqual([[32, 32], [32, 32]])
  })

  it('keeps the single token option and rejects a missing, other-scheme or longer token with 401', async () => {
    const app = createApp(engine, { token: 'secret' })
    expect((await call(app, 'Bearer secret')).status).toBe(404)
    expect((await call(app, 'bearer   secret  ')).status).toBe(404)
    for (const header of [undefined, 'Bearer', 'Basic secret', 'Bearer secret-and-more', `Bearer ${'s'.repeat(10_000)}`]) {
      expect(await call(app, header)).toEqual(unauthorized)
    }
  })

  it('stays open when no token is configured', async () => {
    expect((await call(createApp(engine, { tokens: [], token: '' }))).status).toBe(404)
  })
})
