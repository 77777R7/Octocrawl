/**
 * A page a person opened in their own browser, after W2L was stopped at a
 * check it does not pass (a captcha, a challenge, a login wall): read there,
 * with their approval, once they were through. W2L sent no request for it:
 * the person's browser did, with their identity, so the result is recorded
 * as mode `authed` on the `browser_local_authed` lane, its headers unobserved
 * (`identity_unobserved`), and the robots.txt decision the lane that was
 * stopped took for the same URL. Read the way the browser lane reads a
 * rendered page: the same gate, extractor and formats.
 */

import { estimateTokens, type FetchOptions, type FetchResult, type TraceEvent } from '@w2l/contracts'
import { collectLinks, extractTf, htmlToMarkdown } from '@w2l/extract-tf'
import { classifyGate, sha256Utf8 } from '@w2l/http-core'
import { errorPageEvidence, extraFormats, htmlFormats, isNoContentStatus, isSuccessStatus, listRecordsFound, markdownOptions, selectionAsked, tablesFormat, tagOptions, wholePageAsked, wholePageMarkdown, withListCaveat } from './errorPage.js'

const LANE = 'browser_local_authed' as const

/** What was read in the person's browser. */
export interface UserBrowserRead {
  /** The URL the stopped fetch asked for. */
  requestedUrl: string
  /** The page's address when it was read. */
  finalUrl: string
  /** The document's HTTP status, when the browser reported it (Navigation Timing); null when it did not. */
  status: number | null
  /** The rendered document. */
  html: string
  fetchedAt: string
  /** From opening the page to reading it, the person's time included. */
  wallMs: number
  /** The check the page showed before the person was through, as W2L's gate read it; null when it showed none. */
  sawGate: string | null
  /** Which browser: `chrome` and its version, as it reported them. */
  browser: string
}

/** The result of a page read in the person's browser, in place of `prior`, the result the check stopped. */
export function pageFromUserBrowser(read: UserBrowserRead, prior: FetchResult, options: FetchOptions): FetchResult {
  const { html: body, finalUrl, wallMs } = read
  const status = read.status ?? 200
  const trace: TraceEvent[] = [
    { at: 0, lane: LANE, event: 'handoff_from', detail: { status: prior.status, blockReason: prior.blockReason, failureReason: prior.failureReason, lane: prior.lane, rawBodySha256: prior.evidence.rawBodySha256 } },
    ...robotsOf(prior),
    { at: 0, lane: LANE, event: 'identity_sent', detail: { mode: 'authed', headers: [], by: 'user_browser' } },
    { at: 0, lane: LANE, event: 'identity_unobserved', detail: { reason: `the person's own browser (${read.browser}) sent the request; its headers were not seen` } },
    { at: wallMs, lane: LANE, event: 'user_browser_read', detail: { browser: read.browser, status: read.status, sawGate: read.sawGate, waitedMs: wallMs } },
  ]
  const base = {
    requestedUrl: read.requestedUrl,
    truncated: false,
    truncatedAt: null,
    // W2L sent nothing, so it signs nothing: the person's browser made the request.
    compliance: null,
    evidence: {
      finalUrl,
      httpStatus: read.status,
      redirectChain: [],
      redirectChainComplete: false,
      contentType: 'text/html',
      rawBodySha256: sha256Utf8(body),
      artifacts: [],
      fetchedAt: read.fetchedAt,
    },
    usage: {
      wallMs,
      bytesWire: null,
      bytesDecompressed: Buffer.byteLength(body),
      requestCount: 1,
      attemptCount: 1,
      contentTokens: null as number | null,
      browserMs: wallMs,
      externalCostUsd: null,
    },
    trace,
  }
  const gate = classifyGate({ status, header: () => null, body })
  const errorPage = errorPageEvidence(status, 'text/html', body, finalUrl, options)
  const errorPageFields = { markdown: errorPage?.markdown ?? null, ...(errorPage === null ? {} : { links: errorPage.links }) }
  const blocked = (verdict: NonNullable<typeof gate>): FetchResult => {
    trace.push({ at: wallMs, lane: LANE, event: 'gate_detected', detail: { blockReason: verdict.reason, signals: verdict.signals, status } })
    return { ...base, status: 'blocked', failureReason: null, blockReason: verdict.reason, budgetExceeded: null, lane: LANE, escalations: [], ...errorPageFields }
  }
  const nonOk = status !== 200 && status !== 0
  if (nonOk && gate !== null) return blocked(gate)
  if (nonOk && !isSuccessStatus(status)) return { ...base, status: 'failed', failureReason: 'http_error', blockReason: null, budgetExceeded: null, lane: LANE, escalations: [], ...errorPageFields }
  if (isNoContentStatus(status)) return { ...base, status: 'empty_verified', failureReason: null, blockReason: null, budgetExceeded: null, lane: LANE, escalations: [], markdown: null }

  const extracted = extractTf.extract(body, { url: finalUrl, pruneSelectors: options.excludeTags, includeSelectors: options.includeTags, blockAds: options.blockAds })
  const links = collectLinks(body, finalUrl)
  trace.push({ at: wallMs, lane: LANE, event: 'extract', detail: { pageType: extracted.pageType, strategy: extracted.strategy, confidence: extracted.confidence, escalate: extracted.escalate, linkCount: links.length, ...(options.onlyMainContent === false ? { onlyMainContent: false } : {}), ...tagOptions(options) } })
  let wholePage: string | null = null
  let listPage = false
  if (extracted.escalate && gate !== null) return blocked(gate)
  if (extracted.escalate && !selectionAsked(options)) {
    wholePage = wholePageMarkdown(body, finalUrl, options)
    listPage = listRecordsFound(body, finalUrl, options)
    if ((options.onlyMainContent !== false && !listPage) || wholePage === null) {
      return { ...base, status: 'failed', failureReason: 'empty_unverified', blockReason: null, budgetExceeded: null, lane: LANE, escalations: [], markdown: wholePage, ...(wholePage === null ? {} : { links }) }
    }
  }
  const decisive = classifyGate({ status, header: () => null, body, contentful: true })
  if (decisive !== null) return blocked(decisive)
  const markdown = wholePageAsked(options) || listPage
    ? wholePage ?? htmlToMarkdown(body, { baseUrl: finalUrl, exclude: options.excludeTags, ...markdownOptions(options) })
    : htmlToMarkdown(extracted.mainHtml, { baseUrl: extracted.baseUrl, ...markdownOptions(options) })
  const extra = extraFormats(body, finalUrl, options, trace, LANE, wallMs)
  const tables = tablesFormat(wholePageAsked(options)
    ? { html: body, options: { baseUrl: finalUrl, exclude: options.excludeTags, ...markdownOptions(options) } }
    : { html: extracted.mainHtml, options: { baseUrl: extracted.baseUrl, ...markdownOptions(options) } }, finalUrl, options, trace, LANE, wallMs)
  return withListCaveat({
    ...base,
    status: 'success',
    failureReason: null,
    blockReason: null,
    budgetExceeded: null,
    lane: LANE,
    escalations: [],
    markdown,
    links,
    ...extra,
    ...tables,
    metadata: extracted.metadata,
    document: {
      title: extracted.title,
      pageType: extracted.pageType,
      strategy: extracted.strategy,
      confidence: extracted.confidence,
      product: extracted.product ?? null,
      adapter: extracted.adapter,
      entities: extracted.entities,
      adapterValidation: extracted.adapterValidation,
      labelledValues: extracted.labelledValues,
    },
    ...htmlFormats(body, body, extracted.mainHtml, options),
    usage: { ...base.usage, contentTokens: estimateTokens(markdown) },
  })
}

/** The robots.txt decision the stopped fetch took for this URL, carried over: the person's browser read the same URL. */
function robotsOf(prior: FetchResult): TraceEvent[] {
  const signed = prior.compliance?.robots
  if (signed !== undefined) {
    return [
      { at: 0, lane: LANE, event: 'robots_checked', detail: { decision: signed.decision, robotsUrl: signed.robotsUrl, robotsSha256: signed.robotsSha256, unreachable: signed.unreachable ?? null, crawlDelayMs: signed.crawlDelayMs ?? null, from: 'stopped fetch' } },
      ...(signed.override === undefined ? [] : [{ at: 0, lane: LANE, event: 'robots_overridden', detail: { from: 'stopped fetch' } }]),
    ]
  }
  const checked = [...prior.trace].reverse().find((event) => event.event === 'robots_checked')
  const overridden = prior.trace.some((event) => event.event === 'robots_overridden')
  return [
    ...(checked === undefined ? [] : [{ ...checked, at: 0, lane: LANE, detail: { ...checked.detail, from: 'stopped fetch' } }]),
    ...(overridden ? [{ at: 0, lane: LANE, event: 'robots_overridden', detail: { from: 'stopped fetch' } }] : []),
  ]
}
