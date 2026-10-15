import { expect, it } from 'vitest'
import type { FetchResult, ListFormatRequest } from '@w2l/contracts'
import { extractStructured } from '../src/structured.js'

it('represents a thousand selected records within the bounded conversion budget', async () => {
  const url = 'https://example.test/products'
  const request: ListFormatRequest = { type: 'list', itemSelector: '.item', fields: [{ name: 'name', selector: 'h2' }, { name: 'price', selector: '.price' }] }
  const source: FetchResult = {
    requestedUrl: url, status: 'success', failureReason: null, blockReason: null, budgetExceeded: null, lane: 'http', compliance: null,
    evidence: { finalUrl: url, httpStatus: 200, redirectChain: [], contentType: 'text/html', rawBodySha256: null, artifacts: [], fetchedAt: '2026-10-15T00:00:00Z' },
    usage: { wallMs: 0, bytesWire: 0, bytesDecompressed: 0, requestCount: 0, attemptCount: 0, contentTokens: null, browserMs: 0, externalCostUsd: 0 },
    trace: [], escalations: [], markdown: null, links: [], truncated: false, truncatedAt: null,
    list: { itemSelector: '.item', fields: ['name', 'price'], pages: 1, incomplete: 0, truncated: false, csv: '', csvSha256: '', records: Array.from({ length: 1000 }, (_, index) => ({ values: { name: `Notebook ${index}`, price: '$12.00' }, missing: [], source: { url, page: 1, index } })) },
  }
  const start = performance.now()
  const out = await extractStructured(source, undefined, {}, null, request)
  expect(out.status).toBe('complete')
  expect((out.data as any).records).toHaveLength(1000)
  expect(out.evidence).toHaveLength(2000)
  expect(performance.now() - start).toBeLessThan(1500)
})
