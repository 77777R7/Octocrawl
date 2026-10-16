import { describe, expect, it } from 'vitest'
import { scrapeTool } from '../src/index.js'
import { parseScrapeRequest, type VerifyCheck } from '@w2l/contracts'
import type { ZodType } from 'zod'
import { verify as verifyTask } from '@w2l/runtime'

const verification = { status: 'failed', verifier: 'verify/4', contractSha256: 'contract', reason: 'checks_failed', checks: [{ index: 0, type: 'minTables', data: true, passed: false, observed: '0 tables', observedCount: 0, asked: 1 }] }
const readiness = { state: 'not_served', basis: ['source_data_error'], waitedMs: 12 }
const page = { status: 'success', requestedUrl: 'https://example.test', finalUrl: 'https://example.test', markdown: '[Cart $0](https://example.test/cart)', snapshot: { httpStatus: 200 }, evidenceRecord: {}, verification, readiness }
const context = { toolCallId: 'completion', messages: [], context: {} }

describe('task completion through the AI SDK adapter', () => {
  it.each(['snapshot.httpStatus', 'document.title', 'metadata.sourceURL', 'usage.requestCount', 'httpStatus', 'title', 'failureReason', 'agentHints', 'verification.status', 'readiness.state', 'evidenceRecord.httpStatus'])('refuses the non-preserved path %s before calling the API', async path => {
    let calls = 0
    const tool = scrapeTool({ fetch: async () => { calls++; return Response.json(page) } })
    const out = await tool.execute!({ url: page.requestedUrl, verify: { checks: [{ type: 'field', path, present: true }] } }, context)
    expect(out).toMatchObject({ status: 'refused', httpStatus: 400, code: 'invalid_request' })
    expect(JSON.stringify(out)).toContain(path)
    expect(calls).toBe(0)
  })

  it.each([
    { type: 'recordFields' as const, fields: ['name'], min: 1 },
    { type: 'listRecordsMin' as const, min: 1 },
    { type: 'listRecordsMin' as const, path: 'json.data.records', min: 1 },
  ])('refuses implicit or removed record paths before calling the API: %j', async check => {
    let calls = 0
    const out = await scrapeTool({ fetch: async () => { calls++; return Response.json(page) } }).execute!({ url: page.requestedUrl, verify: { checks: [check] } }, context)
    expect(out).toMatchObject({ status: 'refused', httpStatus: 400, code: 'invalid_request' })
    expect(calls).toBe(0)
  })

  it('preserves failed task checks and readiness on a successful navigation-only read', async () => {
    const tool = scrapeTool({ fetch: async () => Response.json(page) })
    const out = await tool.execute!({ url: page.requestedUrl }, context)
    expect(out).toMatchObject({ status: 'success', verification, readiness })
  })

  it('sends an optional contract unchanged and preserves its checked outcome', async () => {
    const verify = { checks: [{ type: 'minTables' as const, min: 1 }], emptyOk: false }
    let body: unknown
    const tool = scrapeTool({ fetch: async (_url, init) => { body = JSON.parse(String(init?.body)); return Response.json(page) } })
    await tool.execute!({ url: page.requestedUrl, verify, formats: ['tables'] }, context)
    expect(body).toMatchObject({ verify, formats: ['tables'] })
  })

  it.each(['passed', 'not_requested'])('retains the server verdict %s instead of inferring it from success', async status => {
    const verdict = status === 'not_requested' ? { status } : { ...verification, status, reason: null, checks: [] }
    const out = await scrapeTool({ fetch: async () => Response.json({ ...page, verification: verdict }) }).execute!({ url: page.requestedUrl }, context)
    expect(out).toMatchObject({ verification: verdict, readiness })
  })

  it('does not invent a verdict or readiness for an older server', async () => {
    const { verification: _v, readiness: _r, ...older } = page
    const out = await scrapeTool({ fetch: async () => Response.json(older) }).execute!({ url: page.requestedUrl }, context)
    expect(out).not.toHaveProperty('verification')
    expect(out).not.toHaveProperty('readiness')
  })

  it('returns a hosted contract refusal unchanged and never retries it', async () => {
    let calls = 0
    const verify = { checks: [{ type: 'markdownMatches' as const, pattern: 'x' }] }
    const out = await scrapeTool({ fetch: async () => { calls++; return Response.json({ error: 'hosted server refuses regex checks', code: 'invalid_request', agentHints: ['Use markdownIncludes'] }, { status: 400 }) } }).execute!({ url: page.requestedUrl, verify }, context)
    expect(out).toMatchObject({ status: 'refused', httpStatus: 400, code: 'invalid_request', error: 'hosted server refuses regex checks', agentHints: ['Use markdownIncludes'] })
    expect(calls).toBe(1)
  })

  it('offers every existing check without stripping its fields or changing the contract', () => {
    const checks: VerifyCheck[] = [
      { type: 'markdownIncludes', text: 'Revenue' }, { type: 'markdownMatches', pattern: 'Revenue', flags: 'i' },
      { type: 'markdownCountMin', pattern: '\\d', min: 1 }, { type: 'minTables', min: 1 },
      { type: 'tableRowsMin', tableIndex: 0, columns: [0, 2], min: 1 }, { type: 'listRecordsMin', path: 'list.records', min: 1 },
      { type: 'recordFields', fields: ['name', 'price'], min: 1 }, { type: 'field', path: 'metadata.statusCode', equals: 200 },
      { type: 'field', path: 'json.data.value', equals: null }, { type: 'field', path: 'json.data.value', in: [null, 0, false, 'x'] },
      { type: 'field', path: 'json.data.value', present: false }, { type: 'field', path: 'json.data.value', min: -1, max: 10 },
    ]
    const input = { url: page.requestedUrl, formats: ['markdown', 'tables'], verify: { checks, emptyOk: true } }
    const schema = scrapeTool().inputSchema as ZodType
    expect(schema.parse(input)).toEqual(input)
    expect(parseScrapeRequest(input).verify).toEqual(input.verify)
    for (const invalid of [{ checks: [] }, { checks: Array(33).fill(checks[0]) }, { checks: [{ type: 'minTables', min: -1 }] }, { checks: [{ type: 'minTables', min: 1_000_001 }] }, { checks: [{ type: 'markdownIncludes', text: 'x'.repeat(1001) }] }, { checks: [{ ...checks[0], extra: true }] }, { checks: [checks[0]], extra: true }]) {
      expect(schema.safeParse({ ...input, verify: invalid }).success).toBe(false)
      expect(() => parseScrapeRequest({ ...input, verify: invalid })).toThrow()
    }
  })

  it('keeps verified empty distinct from empty or unavailable content even with emptyOk', async () => {
    const contract = { checks: [{ type: 'minTables' as const, min: 1 }], emptyOk: true }
    for (const status of ['empty_verified', 'success'] as const) {
      const verdict = verifyTask(contract, { status, markdown: status === 'success' ? 'Data temporarily unavailable' : null })
      const out = await scrapeTool({ fetch: async () => Response.json({ ...page, status, verification: verdict }) }).execute!({ url: page.requestedUrl, formats: ['tables'], verify: contract }, context)
      expect(out).toMatchObject({ status, verification: { status: status === 'empty_verified' ? 'passed' : 'failed' } })
    }
  })
})
