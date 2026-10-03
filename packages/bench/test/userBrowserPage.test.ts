import { describe, expect, it } from 'vitest'
import type { FetchResult } from '@w2l/contracts'
import { toEvidenceRecord } from '@w2l/runtime'
import { pageFromUserBrowser, type UserBrowserRead } from '../src/subjects/userBrowserPage.js'

const PAGE = `<html><head><title>Members</title></head><body><article><h1>Members</h1>${'<p>The page behind the check, long enough to be read as an article. </p>'.repeat(4)}</article></body></html>`

/** The result a check stopped: blocked at a captcha, with the robots decision its lane signed. */
const STOPPED = {
  requestedUrl: 'https://site.test/members', status: 'blocked', failureReason: null, blockReason: 'captcha', budgetExceeded: null, lane: 'browser_local',
  evidence: { finalUrl: 'https://site.test/members', httpStatus: 200, redirectChain: [], contentType: 'text/html', rawBodySha256: 'a'.repeat(64), artifacts: [], fetchedAt: '2026-10-04T00:00:00.000Z' },
  compliance: { mode: 'standard', robots: { decision: 'allowed', robotsUrl: 'https://site.test/robots.txt', robotsSha256: 'b'.repeat(64) }, sentHeaders: { headers: [{ name: 'user-agent', value: 'W2L' }] } },
  trace: [], escalations: [], markdown: null, links: [], truncated: false, truncatedAt: null,
  usage: { wallMs: 1, bytesWire: null, bytesDecompressed: 1, requestCount: 1, contentTokens: null, browserMs: 1, externalCostUsd: null },
} as unknown as FetchResult

const read = (html: string, extra: Partial<UserBrowserRead> = {}): UserBrowserRead => ({
  requestedUrl: 'https://site.test/members', finalUrl: 'https://site.test/members', status: 200, html, fetchedAt: '2026-10-04T01:00:00.000Z', wallMs: 42_000, sawGate: 'captcha', browser: 'Chrome/144.0', ...extra,
})

describe('a page read in the person\'s browser', () => {
  it('is read as the browser lane reads a rendered page, recorded as theirs: mode authed, its headers unseen, the stopped fetch\'s robots decision', () => {
    const result = pageFromUserBrowser(read(PAGE), STOPPED, {})
    expect(result).toMatchObject({ status: 'success', lane: 'browser_local_authed', compliance: null, blockReason: null, evidence: { finalUrl: 'https://site.test/members', httpStatus: 200, redirectChainComplete: false, fetchedAt: '2026-10-04T01:00:00.000Z' } })
    expect(result.markdown).toContain('The page behind the check')
    expect(result.trace.map((event) => event.event)).toEqual(['handoff_from', 'robots_checked', 'identity_sent', 'identity_unobserved', 'user_browser_read', 'extract'])
    expect(result.trace[0]).toMatchObject({ detail: { status: 'blocked', blockReason: 'captcha', lane: 'browser_local' } })
    const record = toEvidenceRecord(result, { mode: 'standard' }, { markdown: result.markdown })
    expect(record).toMatchObject({ lane: 'browser_local_authed', status: 'success', httpStatus: 200, identity: { mode: 'authed', userAgent: null }, robotsDecision: { decision: 'allowed', robotsUrl: 'https://site.test/robots.txt' } })
  })

  it('a page that still shows its check is blocked again, and a status the browser did not report is unknown', () => {
    expect(pageFromUserBrowser(read('<html><body><div class="g-recaptcha" data-sitekey="k"></div></body></html>'), STOPPED, {})).toMatchObject({ status: 'blocked', blockReason: 'captcha' })
    expect(pageFromUserBrowser(read(PAGE, { status: null }), STOPPED, {}).evidence.httpStatus).toBeNull()
  })

  it('answers the formats asked for, a list among them', () => {
    const list = '<html><body><ul class="l">' + [1, 2, 3].map((n) => `<li class="it"><a href="/p/${n}">Item ${n}</a></li>`).join('') + '</ul></body></html>'
    const result = pageFromUserBrowser(read(list), STOPPED, { list: { type: 'list', itemSelector: 'li.it', fields: [{ name: 'name', selector: 'a' }] } })
    expect(result.status).toBe('success')
    expect(result.list?.records.map((record) => record.values.name)).toEqual(['Item 1', 'Item 2', 'Item 3'])
  })
})
