import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { localNetworkPolicy } from '@w2l/contracts'
import type { FetchOptions, FetchResult, TraceEvent } from '@w2l/contracts'
import { extractTf, htmlToMarkdown } from '@w2l/extract-tf'
import { readinessOf, verify } from '@w2l/runtime'
import { captureEvent, newCapture } from '../src/capture.js'
import { withExtractionCandidates } from '../src/subjects/candidateExtraction.js'
import { ResilientHttpSubject } from '../src/subjects/resilientHttp.js'

/** A standard's page: its number, status and date sit in a header block the main content leaves out. */
const standard = `<html lang="en"><head><title>Widget Exchange Format</title>
<meta name="citation_title" content="Widget Exchange Format"><meta name="citation_date" content="2026/06/14"></head><body>
<nav><a href="/">Home</a> <a href="/standards">Standards</a></nav>
<div class="doc-header"><dl><dt>Number</dt><dd>WXF 42</dd><dt>Status</dt><dd>Proposed Standard</dd><dt>Published</dt><dd>June 2026</dd></dl></div>
<main><h1>Widget Exchange Format</h1>
${'<p>This document specifies how widgets are exchanged between two parties, the order of their fields, and how a receiver answers a widget it cannot read. </p>'.repeat(6)}
<h2>1. Introduction</h2>${'<p>Widgets have been exchanged informally for a long time; this specification writes down the common practice so that implementations agree. </p>'.repeat(4)}
</main><footer>Copyright</footer></body></html>`

const url = 'https://standards.example/wxf42'

/** A shop's offers page: its terms sit in the page's main content, above the list of offers a list format names. */
const offers = `<html lang="en"><head><title>Offers</title></head><body><nav><a href="/">Home</a></nav><main><h1>This week's offers</h1>
<p>Offers valid until 30 June, while stocks last, for orders delivered within the country. Prices include tax and delivery to the door.</p>
<ul>${['Brass lamp', 'Oak shelf', 'Linen throw', 'Wool rug'].map((name, n) => `<li class="offer"><a href="/p/${n}">${name}</a> <span>£${10 + n}.00</span></li>`).join('')}</ul>
${'<p>Every item is checked before it leaves the workshop, and returns are free for thirty days after delivery. </p>'.repeat(3)}</main></body></html>`

/** What a lane delivers for this capture: the main content as Markdown, with its capture in the trace. */
function delivered(html: string, lane: FetchResult['lane'] = 'browser_local'): FetchResult {
  const out = extractTf.extract(html, { url })
  const capture = newCapture({ sourceKind: lane === 'http' ? 'http_body' : 'browser_dom' })
  return {
    requestedUrl: url, status: 'success', failureReason: null, blockReason: null, budgetExceeded: null,
    lane, escalations: [], markdown: htmlToMarkdown(out.mainHtml, { baseUrl: out.baseUrl }), links: [], truncated: false, truncatedAt: null, compliance: null,
    evidence: { finalUrl: url, httpStatus: 200, redirectChain: [], contentType: 'text/html', rawBodySha256: 'x', artifacts: [] },
    usage: { wallMs: 5, bytesWire: html.length, bytesDecompressed: html.length, requestCount: 1, attemptCount: 1, contentTokens: 100, browserMs: 0, externalCostUsd: null },
    trace: [captureEvent(capture, 1, lane)], metadata: out.metadata,
    document: { title: out.title, pageType: out.pageType, strategy: out.strategy, confidence: out.confidence, product: out.product ?? null, adapter: out.adapter, entities: out.entities, declaredValues: out.declaredValues },
  }
}
const ask = (checks: NonNullable<FetchOptions['verify']>['checks'], extra: FetchOptions = {}): FetchOptions => ({ verify: { checks }, ...extra })
const source = (options: FetchOptions, lane: FetchResult['lane'] = 'browser_local') => ({ html: standard, url, options, lane, at: 9 })

describe('reading the same capture again when its contract fails on what was extracted', () => {
  it('delivers the whole document when only it has the header the contract asks for, and says why', () => {
    const result = delivered(standard)
    const options = ask([{ type: 'markdownIncludes', text: 'Proposed Standard' }, { type: 'markdownIncludes', text: 'Widget Exchange Format' }])
    // The main content alone fails the contract on a page that was there: not_extracted.
    const before = verify(options.verify, result as never, { partial: true })
    expect(before.status).toBe('failed')
    expect(readinessOf({ ...result, verification: before }).state).toBe('not_extracted')

    const out = withExtractionCandidates(result, source(options))
    expect(out.markdown).toContain('Proposed Standard')
    expect(out.markdown).toContain('WXF 42')
    expect(verify(options.verify, out as never, { partial: true }).status).toBe('passed')
    const event = out.trace.find(item => item.event === 'extraction_candidates')!
    expect(event).toMatchObject({ at: 9, lane: 'browser_local', detail: { selected: 'document', reason: 'passes_contract', replaced: true, capped: false, readiness: 'not_extracted', trigger: 'not_extracted' } })
    expect(event.detail!.captureId).toBe((result.trace[0]!.detail as { captureId: string }).captureId)
    expect((event.detail!.candidates as Array<{ id: string; passed: number; failed: number }>).map(item => [item.id, item.passed, item.failed]))
      .toEqual([['main_content', 1, 1], ['document', 2, 0], ['declared_data', 1, 1]])
  })

  it('reads an HTTP page again only when its own signals say it had fully come', () => {
    const options = ask([{ type: 'markdownIncludes', text: 'Proposed Standard' }])
    const out = withExtractionCandidates(delivered(standard, 'http'), source(options, 'http'))
    expect(out.trace.at(-1)).toMatchObject({ event: 'extraction_candidates', lane: 'http', detail: { readiness: 'not_loaded', trigger: 'unrendered_page_complete', selected: 'document' } })
    // A page the lane suspects its scripts fill in goes on to a browser, unread.
    const shell: FetchResult = { ...delivered(standard, 'http'), warnings: [{ code: 'client_rendered_suspected', message: 'shell' }] }
    expect(withExtractionCandidates(shell, source(options, 'http'))).toBe(shell)
  })

  it('takes the page\'s declared date when the contract asks for it and only the declaration states it', () => {
    const out = withExtractionCandidates(delivered(standard), source(ask([{ type: 'markdownIncludes', text: '2026/06/14' }])))
    expect(out.trace.at(-1)).toMatchObject({ event: 'extraction_candidates', detail: { selected: 'declared_data', reason: 'passes_contract' } })
    expect(out.markdown).toContain('citation_date: 2026/06/14')
  })

  it('does not pass a check for the page\'s name with its <title> under a main content that is another part of the page', () => {
    const appendix = `<html><head><title>WXF 42: Widget Exchange Format</title></head><body><main><h1>Appendix A. Collected grammar</h1>${'<p>widget = name SP version SP payload; payload = 1*OCTET; version = 1*DIGIT. </p>'.repeat(8)}</main></body></html>`
    const result = delivered(appendix)
    const out = withExtractionCandidates(result, { ...source(ask([{ type: 'markdownIncludes', text: 'WXF 42' }])), html: appendix })
    expect(out.markdown).toBe(result.markdown)
    expect(out.trace.at(-1)).toMatchObject({ detail: { selected: 'main_content', reason: 'delivered_kept', replaced: false } })
  })

  it('keeps the main content when no candidate does better, and records that it looked', () => {
    const result = delivered(standard)
    const out = withExtractionCandidates(result, source(ask([{ type: 'markdownIncludes', text: 'nowhere on this page' }])))
    expect(out.markdown).toBe(result.markdown)
    expect(out.trace.at(-1)).toMatchObject({ event: 'extraction_candidates', detail: { selected: 'main_content', reason: 'delivered_kept', replaced: false } })
  })

  it('adds its event to the lane\'s own trace, which the lane may still append to', () => {
    const result = delivered(standard)
    const out = withExtractionCandidates(result, source(ask([{ type: 'markdownIncludes', text: 'Proposed Standard' }])))
    expect(out.trace).toBe(result.trace)
    ;(result.trace as TraceEvent[]).push({ at: 10, lane: 'browser_local', event: 'session_cookies' })
    expect(out.trace.map(event => event.event)).toEqual(['capture', 'extraction_candidates', 'session_cookies'])
  })

  it('leaves the result alone without a contract, when it passes, or when the request named its content', () => {
    const result = delivered(standard)
    // A contract with no Markdown check: no candidate's Markdown can change its verdict.
    expect(withExtractionCandidates(result, source(ask([{ type: 'field', path: 'metadata.title', equals: 'nope' }])))).toBe(result)
    expect(withExtractionCandidates(result, source({}))).toBe(result)
    expect(withExtractionCandidates(result, source(ask([{ type: 'markdownIncludes', text: 'Introduction' }])))).toBe(result)
    const failing = [{ type: 'markdownIncludes' as const, text: 'Proposed Standard' }]
    expect(withExtractionCandidates(result, source(ask(failing, { includeTags: ['main'] })))).toBe(result)
    expect(withExtractionCandidates(result, source(ask(failing, { onlyMainContent: false })))).toBe(result)
    // A page that did not come is not re-read: there is nothing captured to read.
    const blocked: FetchResult = { ...result, status: 'blocked', blockReason: 'cloudflare_challenge', markdown: null }
    expect(withExtractionCandidates(blocked, source(ask(failing)))).toBe(blocked)
  })

  it('does not read a capture over the selection limit as a whole document, and says a limit left it out', () => {
    const result = delivered(standard)
    const large = standard.replace('</footer>', `${' '.repeat(1_000_001)}</footer>`)
    const out = withExtractionCandidates(result, { ...source(ask([{ type: 'markdownIncludes', text: 'Proposed Standard' }])), html: large })
    expect(out.trace.at(-1)).toMatchObject({ detail: { capped: true, selected: 'main_content' } })
    expect((out.trace.at(-1)!.detail!.candidates as Array<{ id: string; skipped?: string }>)[1]).toMatchObject({ id: 'document', skipped: 'html_too_large' })
  })
})

describe('the HTTP lane reads its own capture again', () => {
  let server: Server
  let origin = ''
  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === '/robots.txt') return void res.writeHead(404).end()
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(req.url === '/offers' ? offers : standard)
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(() => new Promise<void>(resolve => server.close(() => resolve())))

  it('offers the page\'s main content beside the list items a list format named, and delivers it when only it passes', async () => {
    const http = new ResilientHttpSubject('standard', { ...localNetworkPolicy(), perHostMinDelayMs: 0 })
    const list = { type: 'list' as const, itemSelector: 'li.offer' }
    const verify = { checks: [{ type: 'markdownIncludes' as const, text: 'Offers valid until 30 June' }] }
    const out = await http.fetch(`${origin}/offers`, undefined, undefined, {}, undefined, { list, verify })
    expect(out.status).toBe('success')
    expect(out.markdown).toContain('Offers valid until 30 June')
    expect(out.markdown).toContain('Brass lamp')
    expect(out.trace.find(event => event.event === 'extraction_candidates')).toMatchObject({ detail: { selected: 'main_content', replaced: true, reason: 'passes_contract' } })
    expect((out.trace.find(event => event.event === 'extraction_candidates')!.detail!.candidates as Array<{ id: string }>).map(item => item.id)).toEqual(['list_items', 'main_content', 'document'])
    // A contract the items pass keeps them.
    const items = await http.fetch(`${origin}/offers`, undefined, undefined, {}, undefined, { list, verify: { checks: [{ type: 'markdownIncludes', text: 'Brass lamp' }] } })
    expect(items.markdown).not.toContain('Offers valid until 30 June')
    expect(items.trace.some(event => event.event === 'extraction_candidates')).toBe(false)
  })

  it('delivers the document candidate from the same capture, with its capture in the event', async () => {
    const http = new ResilientHttpSubject('standard', { ...localNetworkPolicy(), perHostMinDelayMs: 0 })
    const verify = { checks: [{ type: 'markdownIncludes' as const, text: 'Proposed Standard' }] }
    const out = await http.fetch(`${origin}/wxf42`, undefined, undefined, {}, undefined, { verify })
    expect(out.status).toBe('success')
    expect(out.markdown).toContain('Proposed Standard')
    const capture = out.trace.find(event => event.event === 'capture')!
    expect(out.trace.find(event => event.event === 'extraction_candidates')).toMatchObject({
      lane: 'http', detail: { captureId: (capture.detail as { captureId: string }).captureId, selected: 'document', trigger: 'unrendered_page_complete' },
    })
    // Without a contract the lane delivers its main content, as before.
    const plain = await http.fetch(`${origin}/wxf42`)
    expect(plain.markdown).not.toContain('Proposed Standard')
    expect(plain.trace.some(event => event.event === 'extraction_candidates')).toBe(false)
  })
})
