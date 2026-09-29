import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startFixtureServer, type FixtureServer } from '@w2l/fixtures'
import { buildChannels } from '@w2l/bench'
import { createApiEngine } from '@w2l/api'
import { W2L } from '@w2l/sdk'
import { callTool } from '../src/tools.js'

describe('MCP scrape against the fixture catalog', () => {
  let fixtures: FixtureServer
  let taskRoot: string

  beforeAll(async () => {
    fixtures = await startFixtureServer()
    taskRoot = await mkdtemp(join(tmpdir(), 'w2l-mcp-'))
  })

  afterAll(async () => {
    await fixtures.close()
    await rm(taskRoot, { recursive: true, force: true })
  })

  it('scrapes /crawl/listing through the MCP tool and gets FetchResult markdown', async () => {
    const engine = createApiEngine({
      taskRoot,
      channelsFor: (mode) =>
        buildChannels(mode, {
          localSubjects: {
            browser_local: {
              fetch: async () => {
                throw new Error('MCP fixture scrape stays on HTTP')
              },
            },
          },
        }),
    })
    const client = new W2L({
      baseUrl: 'http://w2l.test',
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        const { createApp } = await import('@w2l/api')
        const app = createApp(engine)
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        return app.request(new URL(url).pathname, init)
      }) as typeof fetch,
    })
    const result = (await callTool(client, 'scrape', { url: `${fixtures.url}/crawl/listing` })) as {
      status: string
      markdown: string | null
      metadata?: unknown
      snapshot?: unknown
      evidenceRecord?: unknown
    }
    expect(result.status).toBe('success')
    // The compact MCP result names the response's status and content type.
    expect(result.snapshot).toMatchObject({ httpStatus: 200, contentType: 'text/html; charset=utf-8' })
    expect(result.markdown).toContain('Harbour lantern catalog')
    expect(result.metadata).toMatchObject({ title: 'Harbour lantern catalog', language: 'en', favicon: null })
    // The compact MCP result carries the same Evidence Record as REST.
    expect(result.evidenceRecord).toMatchObject({
      schemaVersion: 'w2l.evidence/1',
      requestedUrl: `${fixtures.url}/crawl/listing`,
      finalUrl: `${fixtures.url}/crawl/listing`,
      status: 'success',
      lane: 'http',
      httpStatus: 200,
      outputSha256: { markdown: expect.stringMatching(/^[0-9a-f]{64}$/), json: null },
    })
    await engine.close()
  })
})
