import { describe, expect, it } from 'vitest'
import type { GroundTruth } from '@w2l/contracts'
import { scoreTool } from '../src/phase3ScoreCli.js'

const truth = (id: string, mustContain: string[]): GroundTruth => ({
  id, target: `/${id}`, kind: 'fixture', category: 'test', mustContain, mustNotContain: [],
  expectedLane: 'http', emptyIsLegit: false, expectedMainTokens: null, budget: { maxTokens: 100_000, maxWallMs: 60_000, maxAttempts: 5 }, expectedStatus: 'success',
})
const page = '# Page\n\nThe expected sentence is here, with enough words to read as main content.'

describe('phase3 score', () => {
  it('names the share of answers no check contradicted for what it is, not a verified completion', () => {
    const report = scoreTool('w2l', [truth('a', ['expected sentence']), truth('b', []), truth('c', ['absent words']), truth('d', [])], [
      { id: 'a', success: true, markdown: page, error: '', wallMs: 1 },
      { id: 'b', success: true, markdown: page, error: '', wallMs: 1 },
      { id: 'c', success: true, markdown: page, error: '', wallMs: 1 },
      { id: 'd', success: false, markdown: '', error: 'timeout', wallMs: 1 },
    ])
    expect(report.contentfulUncontradicted).toBe(0.5)
    expect(report).not.toHaveProperty('verifiedCompletion')
  })
})
