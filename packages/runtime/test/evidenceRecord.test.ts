import { afterEach, describe, expect, it } from 'vitest'
import { EXTRACTOR_VERSION } from '@w2l/extract-tf'
import { sha256Utf8 } from '@w2l/http-core'
import { researchUserAgent, type ComplianceRecord, type FetchResult, type TraceEvent } from '@w2l/contracts'
import { toEvidenceRecord } from '../src/evidenceRecord.js'

const url = 'https://source.example/start'
const final = 'https://source.example/page'
const RAW = 'a'.repeat(64)
const ROBOTS = 'b'.repeat(64)

function result(over: Partial<FetchResult> = {}, trace: TraceEvent[] = []): FetchResult {
  return {
    requestedUrl: url, status: 'success', failureReason: null, blockReason: null, budgetExceeded: null, lane: 'http', escalations: [],
    markdown: '# Page', truncated: false, truncatedAt: null, compliance: null,
    evidence: { finalUrl: final, httpStatus: 200, redirectChain: [url, final], contentType: 'text/html', rawBodySha256: RAW, artifacts: [], fetchedAt: '2026-09-29T10:00:00.000Z' },
    usage: { wallMs: 1, bytesWire: 1, bytesDecompressed: 1, requestCount: 2, attemptCount: 1, contentTokens: 1, browserMs: 0, externalCostUsd: null },
    trace,
    ...over,
  }
}

const httpTrace = (userAgent: string): TraceEvent[] => [
  { at: 0, lane: 'http', event: 'identity_sent', detail: { mode: 'research', headers: [{ name: 'accept', value: 'text/html' }, { name: 'user-agent', value: userAgent }] } },
  { at: 1, lane: 'http', event: 'robots_checked', detail: { decision: 'allowed', robotsUrl: 'https://source.example/robots.txt', robotsSha256: ROBOTS, matchedGroup: '*', ruleCount: 1, crawlDelayMs: 2000 } },
]

function compliance(over: Partial<ComplianceRecord> = {}): ComplianceRecord {
  return {
    schemaVersion: 2, recordId: 'r1', mode: 'standard', requestedUrl: url, finalUrl: final, requestedAt: '2026-09-29T09:59:59.000Z',
    robots: { robotsUrl: 'https://source.example/robots.txt', robotsSha256: ROBOTS, matchedUserAgentGroup: null, appliedRules: [], decision: 'allowed', skippedFetch: false, crawlDelayMs: null },
    sentHeaders: { headers: [{ name: 'user-agent', value: 'Mozilla/5.0 Chrome/140' }] },
    rateLimit: { previousRequestAtMs: null, observedDelayMs: null, requiredDelayMs: 0, compliant: true, recentSameHostCount: 1 },
    access: {} as ComplianceRecord['access'], prevRecordHash: null, contentHash: 'c', signature: null,
    ...over,
  }
}

describe('toEvidenceRecord', () => {
  const saved = process.env.W2L_SOURCE_COMMIT
  afterEach(() => { if (saved === undefined) delete process.env.W2L_SOURCE_COMMIT; else process.env.W2L_SOURCE_COMMIT = saved })

  it('reads an HTTP-lane result: every hop, the robots decision and identity from its trace', () => {
    const ua = researchUserAgent('Jane Doe jane@example.org')
    const record = toEvidenceRecord(result({}, httpTrace(ua)), { mode: 'research' }, { markdown: '# Page' }, { sourceCommit: null })
    expect(record).toEqual({
      schemaVersion: 'w2l.evidence/1',
      requestedUrl: url,
      finalUrl: final,
      redirectChain: { urls: [url, final], complete: true },
      fetchedAt: '2026-09-29T10:00:00.000Z',
      httpStatus: 200,
      status: 'success',
      reason: null,
      lane: 'http',
      robotsDecision: { decision: 'allowed', robotsUrl: 'https://source.example/robots.txt', robotsSha256: ROBOTS, unreachable: null, crawlDelayMs: 2000, userOverride: false },
      rawSha256: RAW,
      outputSha256: { markdown: sha256Utf8('# Page'), json: null },
      extractor: { name: 'extract-tf', version: EXTRACTOR_VERSION, commit: null },
      fieldEvidence: null,
      artifacts: [],
      proxy: null,
      identity: { userAgent: ua, mode: 'research', contact: 'Jane Doe jane@example.org' },
    })
  })

  it('prefers the signed compliance record, and says a browser lane lists only the endpoints', () => {
    const record = toEvidenceRecord(result({ lane: 'browser_local', compliance: compliance() }), { mode: 'standard' }, {})
    expect(record.redirectChain).toEqual({ urls: [url, final], complete: false })
    expect(record.robotsDecision).toMatchObject({ decision: 'allowed', robotsSha256: ROBOTS, crawlDelayMs: null })
    expect(record.identity).toEqual({ userAgent: 'Mozilla/5.0 Chrome/140', mode: 'standard', contact: null })
    expect(record.outputSha256).toEqual({ markdown: null, json: null })
  })

  it('lists the requested URL alone when nothing redirected', () => {
    const plain = result({ evidence: { ...result().evidence, finalUrl: url, redirectChain: [] } })
    expect(toEvidenceRecord(plain, { mode: 'standard' }, {}).redirectChain).toEqual({ urls: [url], complete: true })
  })

  it('has no final URL, chain, response or User-Agent when no request for the page was sent', () => {
    const denied = result({
      status: 'failed', failureReason: 'policy_denied', markdown: null,
      evidence: { finalUrl: url, httpStatus: null, redirectChain: [], contentType: null, rawBodySha256: null, artifacts: [] },
      usage: { ...result().usage, requestCount: 0 },
    }, [httpTrace(researchUserAgent())[0]!, { at: 1, lane: 'http', event: 'robots_checked', detail: { decision: 'disallowed', robotsUrl: 'https://source.example/robots.txt', matchedGroup: '*', ruleCount: 1, crawlDelayMs: null } }])
    const record = toEvidenceRecord(denied, { mode: 'research' }, { markdown: null })
    expect(record).toMatchObject({
      finalUrl: null, redirectChain: { urls: [], complete: true }, fetchedAt: null, httpStatus: null, reason: 'policy_denied', rawSha256: null,
      identity: { userAgent: null, mode: 'research', contact: null },
    })
    // Recorded before W2L kept the robots.txt hash in the trace: unknown, not invented.
    expect(record.robotsDecision).toEqual({ decision: 'disallowed', robotsUrl: 'https://source.example/robots.txt', robotsSha256: null, unreachable: null, crawlDelayMs: null, userOverride: false })
  })

  it('keeps an unreachable robots.txt and treats an unconsulted one as no decision', () => {
    const unreachable = compliance({ finalUrl: null, robots: { robotsUrl: 'https://source.example/robots.txt', robotsSha256: null, matchedUserAgentGroup: null, appliedRules: [], decision: 'disallowed', skippedFetch: true, crawlDelayMs: null, unreachable: 'timeout' } })
    expect(toEvidenceRecord(result({ lane: 'provider', compliance: unreachable }), { mode: 'standard' }, {}).robotsDecision).toMatchObject({ decision: 'disallowed', unreachable: 'timeout' })
    const skipped = compliance({ robots: { robotsUrl: null, robotsSha256: null, matchedUserAgentGroup: null, appliedRules: [], decision: 'no_robots', skippedFetch: true } })
    expect(toEvidenceRecord(result({ lane: 'provider', compliance: skipped }), { mode: 'standard' }, {}).robotsDecision).toBeNull()
    expect(toEvidenceRecord(result(), { mode: 'standard' }, {}).robotsDecision).toBeNull()
  })

  it('does not claim a User-Agent the provider lane did not observe', () => {
    const unobserved = result({ lane: 'provider', compliance: compliance() }, [{ at: 1, lane: 'provider', event: 'identity_unobserved', detail: { declared: 'Mozilla/5.0 Chrome/140' } }])
    expect(toEvidenceRecord(unobserved, { mode: 'standard' }, {}).identity.userAgent).toBeNull()
  })

  it('writes an HTTP status of 0 as unknown', () => {
    const zero = result({ lane: 'browser_local', evidence: { ...result().evidence, httpStatus: 0 } })
    expect(toEvidenceRecord(zero, { mode: 'standard' }, {}).httpStatus).toBeNull()
  })

  it('hashes JSON data as canonical JSON and maps field evidence by pointer', () => {
    const json = {
      status: 'complete' as const,
      data: { price: 51.77, title: 'A Light in the Attic', stock: { count: 22, label: 'In stock' } },
      evidence: [
        { path: '/price', source: 'jsonld' as const, evidencePath: '/offers/price' },
        { path: '/title', source: 'dom' as const, evidencePath: 'table[0] tr[0] "Title"' },
        { path: '/stock', source: 'model' as const },
      ],
      issues: [],
    }
    const record = toEvidenceRecord(result(), { mode: 'standard' }, { markdown: null, json })
    expect(record.outputSha256.json).toBe(sha256Utf8('{"price":51.77,"stock":{"count":22,"label":"In stock"},"title":"A Light in the Attic"}'))
    const reordered = toEvidenceRecord(result(), { mode: 'standard' }, { json: { ...json, data: { title: 'A Light in the Attic', stock: { label: 'In stock', count: 22 }, price: 51.77 } } })
    expect(reordered.outputSha256.json).toBe(record.outputSha256.json)
    expect(record.fieldEvidence).toEqual({
      '/price': { source: 'jsonld', locator: '/offers/price' },
      '/title': { source: 'dom', locator: 'table[0] tr[0] "Title"' },
      '/stock': { source: 'model', locator: null },
    })
    expect(toEvidenceRecord(result(), { mode: 'standard' }, { json: { ...json, data: null, evidence: [] } })).toMatchObject({ outputSha256: { json: null }, fieldEvidence: {} })
  })

  it('names a raw snapshot by its content hash and leaves an unknown file unknown', () => {
    const withFiles = result({ evidence: { ...result().evidence, artifacts: [`/tmp/raw/${RAW}.html`, '/tmp/other/page.png'] } })
    expect(toEvidenceRecord(withFiles, { mode: 'standard' }, {}).artifacts).toEqual([
      { kind: 'snapshot', path: `/tmp/raw/${RAW}.html`, sha256: RAW },
      { kind: null, path: '/tmp/other/page.png', sha256: null },
    ])
  })

  it('records the environment proxy and the declared source commit', () => {
    const proxied = result({ evidence: { ...result().evidence, envProxy: '127.0.0.1:7890' } })
    process.env.W2L_SOURCE_COMMIT = '7E2A7B3'
    expect(toEvidenceRecord(proxied, { mode: 'standard' }, {})).toMatchObject({ proxy: '127.0.0.1:7890', extractor: { commit: '7e2a7b3' } })
    process.env.W2L_SOURCE_COMMIT = 'not a commit'
    expect(toEvidenceRecord(proxied, { mode: 'standard' }, {}).extractor.commit).toBeNull()
  })
})
