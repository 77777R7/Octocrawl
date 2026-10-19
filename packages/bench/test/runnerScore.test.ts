import { describe, expect, it, vi } from 'vitest'
import type { FetchResult, GroundTruth } from '@w2l/contracts'
import { runBenchmark } from '../src/runner.js'

const truth = (id: string, mustContain: string[]): GroundTruth => ({
  id, target: `https://example.test/${id}`, kind: 'canary', category: 'test', mustContain, mustNotContain: [],
  expectedLane: 'http', emptyIsLegit: false, expectedMainTokens: null, budget: { maxTokens: 100_000, maxWallMs: 60_000, maxAttempts: 5 }, expectedStatus: 'success',
})

const answer = (url: string, status: FetchResult['status'], markdown: string | null): FetchResult => ({
  requestedUrl: url, status, failureReason: status === 'failed' ? 'connection_error' : null, blockReason: null, budgetExceeded: null, lane: 'http', escalations: [],
  markdown, truncated: false, truncatedAt: null, compliance: null,
  evidence: { finalUrl: url, httpStatus: status === 'failed' ? null : 200, redirectChain: [], contentType: 'text/html', rawBodySha256: null, artifacts: [] },
  usage: { wallMs: 5, bytesWire: 1, bytesDecompressed: 1, requestCount: 1, attemptCount: 1, contentTokens: 10, browserMs: 0, externalCostUsd: null },
  trace: [],
})

describe('runBenchmark score', () => {
  it('counts contentful answers no check contradicted, an unannotated one among them, and does not call that verified', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const pages: Record<string, FetchResult['status']> = { annotated: 'success', unannotated: 'success', contradicted: 'success', failed: 'failed' }
    const run = await runBenchmark([{
      meta: { id: 'fake', displayName: 'fake', version: '0', hosting: 'self_hosted' },
      fetch: async (url) => answer(url, pages[url.split('/').at(-1)!]!, '# Page\n\nThe expected sentence is here, with enough words to read as main content.'),
      teardown: async () => {},
    }], [truth('annotated', ['expected sentence']), truth('unannotated', []), truth('contradicted', ['absent words']), truth('failed', ['expected sentence'])], ['http'])
    const score = run.scores[0]!
    // annotated and unannotated, of four: the unannotated page is counted although nothing confirmed it.
    expect(score.contentfulUncontradictedRate).toBe(0.5)
    expect(score).not.toHaveProperty('verifiedCompletionRate')
  })
})
