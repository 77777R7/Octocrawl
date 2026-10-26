/**
 * Reading the same captured page again before anything is paid (PA F3a, ADR 0006, ADR 0007).
 *
 * When a request's contract fails on a page whose region was there but whose
 * extraction missed it (readiness `not_extracted`, or an HTTP page that had
 * fully come by its own signals), a paid rung would read the same page. The lane instead reads its own capture again, at most three ways,
 * each judged by the request's contract on the Markdown it would deliver:
 *
 * - `main_content`: the main content the lane extracted (what it delivers now);
 * - `document`: the document as a whole, cleaned as for `onlyMainContent: false`,
 *   so a standard's or a paper's header (number, status, dates) that the main
 *   content left out is there;
 * - for a request whose list's items (`itemSelector`) the lane delivered, those
 *   items come first (`list_items`) and the page's main content, extracted
 *   without the selection, takes the declarations' place;
 * - `declared_data`: the main content with what the page declares about its
 *   subject written under it: its citation tags and article JSON-LD, and a
 *   product's facts when the product is the one the page is about (never the
 *   page's `<title>`).
 *
 * The candidate that passes the most checks is delivered, the first one on a
 * tie, so what the lane delivered stays unless another does better. The lane records
 * `extraction_candidates` with each candidate's checks, the choice and why, and
 * whether a limit left a candidate out; the ladder still judges the delivered
 * page with its own contractVerdict. A page whose content a contract chose is
 * that request's answer: the API engine does not store it in its page cache,
 * whose key leaves the contract out. A request that named its content
 * (`includeTags`, the whole page) is not re-read: what it named is the answer;
 * nor is a list paged through, whose records come from several captures.
 */
import type { FetchOptions, FetchResult, Lane, Readiness, TraceEvent, Verification } from '@w2l/contracts'
import { CONTENTFUL_STATUS, estimateTokens } from '@w2l/contracts'
import { readinessOf, verify } from '@w2l/runtime'
import { captureOf } from '../capture.js'
import { extractTf, htmlToMarkdown } from '@w2l/extract-tf'
import { listSelectionAsked, markdownOptions, MAX_TASK_SELECTION_HTML, selectionAsked, wholePageAsked, wholePageMarkdown } from './errorPage.js'

export const EXTRACTION_CANDIDATES = ['main_content', 'list_items', 'document', 'declared_data'] as const
export type ExtractionCandidateId = (typeof EXTRACTION_CANDIDATES)[number]

const MARKDOWN_CHECKS: ReadonlySet<string> = new Set(['markdownIncludes', 'markdownMatches', 'markdownCountMin'])

/** The longest Markdown a candidate may be: longer is not judged (the region wait's view limit, regionWait.ts MAX_VIEW_HTML). */
export const MAX_CANDIDATE_CHARS = 5_000_000

export interface CandidateSource {
  /** The captured page the lane extracted from: the response body, or the rendered DOM. */
  html: string
  url: string
  options: FetchOptions
  lane: Lane
  at: number
}

interface Scored {
  id: ExtractionCandidateId
  markdown: string | null
  chars: number
  passed: number
  failed: number
  unjudged: number
  skipped?: 'html_too_large' | 'markdown_too_large' | 'empty' | 'same_as_main'
}

type Judged = Exclude<Verification, { status: 'not_requested' }>

function judge(result: FetchResult, markdown: string, options: FetchOptions): { passed: number; failed: number; unjudged: number } {
  const verification = verify(options.verify, { ...result, markdown } as unknown as Record<string, unknown>, { partial: true }) as Judged
  const checks = verification.checks ?? []
  return {
    passed: checks.filter(check => check.passed === true).length,
    failed: checks.filter(check => check.passed === false).length,
    unjudged: checks.filter(check => check.passed === null).length,
  }
}

/** What the page declares about its subject, one `name: value` line each. */
function declaredLines(result: FetchResult): string[] {
  // Not the page's <title>: it names the page, not content, and would let a check for the page's name pass on a
  // main content that is some other part of it (an appendix).
  const lines: string[] = []
  for (const item of result.document?.declaredValues ?? []) lines.push(`${item.name}: ${item.values.join('; ')}`)
  const product = result.document?.product ?? null
  // A product's facts only when the page is about that product (D2's identity, or a site adapter's).
  if (product !== null && (product.identity === undefined || product.identity.status === 'matched') && result.document?.adapterValidation?.valid !== false) {
    const facts: Array<[string, { value: string } | null | undefined]> = [
      ['name', product.name], ['sku', product.subjectId ?? product.sku], ['brand', product.brand], ['price', product.price],
      ['priceCurrency', product.priceCurrency], ['availability', product.availability],
    ]
    for (const [name, fact] of facts) if (fact) lines.push(`${name}: ${fact.value}`)
  }
  return lines
}

function candidate(id: ExtractionCandidateId, markdown: string | null, result: FetchResult, options: FetchOptions, skipped?: Scored['skipped']): Scored {
  if (skipped !== undefined || markdown === null) return { id, markdown: null, chars: markdown?.length ?? 0, passed: 0, failed: 0, unjudged: 0, skipped: skipped ?? 'empty' }
  if (markdown.length > MAX_CANDIDATE_CHARS) return { id, markdown: null, chars: markdown.length, passed: 0, failed: 0, unjudged: 0, skipped: 'markdown_too_large' }
  return { id, markdown, chars: markdown.length, ...judge(result, markdown, options) }
}

/**
 * Why this page is read again, or null: its region was there and the contract failed on what was extracted
 * (`not_extracted`); or, on a lane that runs no scripts, readinessOf says `not_loaded` only because nothing rendered
 * the page while the page's own signals say it had come (no shell, no loading text), so what was read is all a
 * browser would start from. A page with a loading signal goes on to a browser unread.
 */
function candidateTrigger(result: FetchResult, readiness: Readiness): 'not_extracted' | 'unrendered_page_complete' | null {
  if (readiness.state === 'not_extracted') return 'not_extracted'
  if (readiness.state !== 'not_loaded' || !readiness.basis.includes('not_rendered')) return null
  const { verification: _verification, ...unverified } = result
  return readinessOf(unverified).state === 'ready' ? 'unrendered_page_complete' : null
}

/**
 * The result with the best of its capture's candidates delivered and an
 * `extraction_candidates` trace event, when its contract failed on a page whose
 * region was there (`not_extracted`); otherwise the result as it was.
 */
export function withExtractionCandidates(result: FetchResult, source: CandidateSource): FetchResult {
  const { options } = source
  if (options.verify === undefined || !CONTENTFUL_STATUS.has(result.status) || typeof result.markdown !== 'string') return result
  // A list paged through is merged from several captures, not this one.
  if (selectionAsked(options) || wholePageAsked(options) || (options.actions ?? []).some(action => action.type === 'paginate')) return result
  // Only Markdown checks can change with the Markdown a candidate delivers.
  if (!options.verify.checks.some(check => MARKDOWN_CHECKS.has(check.type))) return result
  const verification = verify(options.verify, result as unknown as Record<string, unknown>, { partial: true })
  if (verification.status !== 'failed' || verification.reason !== 'checks_failed') return result
  const readiness = readinessOf({ ...result, verification })
  const trigger = candidateTrigger(result, readiness)
  if (trigger === null) return result

  // The lane delivered the items a list format named when it could select them (errorPage.ts listSelectionAsked).
  const listed = listSelectionAsked(options, source.html.length)
  const main = candidate(listed ? 'list_items' : 'main_content', result.markdown, result, options)
  const tooLarge = source.html.length > MAX_TASK_SELECTION_HTML
  const whole = tooLarge ? null : wholePageMarkdown(source.html, source.url, options)
  const document = tooLarge ? candidate('document', null, result, options, 'html_too_large')
    : whole === result.markdown ? candidate('document', null, result, options, 'same_as_main')
      : candidate('document', whole, result, options)
  // A request whose list's items the lane delivered (itemSelector) has the page's main content as a candidate in place
  // of the declarations, extracted from the capture without the selection; the first candidate is then those items.
  let third: Scored
  if (listed) {
    if (tooLarge) third = candidate('main_content', null, result, options, 'html_too_large')
    else {
      const out = extractTf.extract(source.html, { url: source.url, pruneSelectors: options.excludeTags, blockAds: options.blockAds })
      const markdown = htmlToMarkdown(out.mainHtml, { baseUrl: out.baseUrl, ...markdownOptions(options) })
      third = candidate('main_content', markdown === result.markdown ? null : markdown, result, options, markdown === result.markdown ? 'same_as_main' : undefined)
    }
  } else {
    const lines = declaredLines(result)
    third = lines.length === 0 ? candidate('declared_data', null, result, options, 'empty')
      : candidate('declared_data', `${result.markdown}\n\n${lines.join('\n\n')}`, result, options)
  }
  // The narrower read first: on a tie the main content beats the whole document.
  const all = listed ? [main, third, document] : [main, document, third]
  // Most checks passed wins; fewer failed breaks a tie; the earlier candidate (the main content first) keeps it.
  const best = all.filter(item => item.markdown !== null).reduce((a, b) => (b.passed > a.passed || (b.passed === a.passed && b.failed < a.failed) ? b : a))
  const reason = best === main ? 'delivered_kept' : best.failed === 0 && best.unjudged === 0 ? 'passes_contract' : 'more_checks_passed'
  // Appended to the lane's own trace array: a lane adds events after its result is built (browserLocal's session_cookies).
  ;(result.trace as TraceEvent[]).push(candidatesEvent(result.trace, source, readiness, trigger, all, best, main, reason))
  if (best === main || best.markdown === null) return result
  return { ...result, markdown: best.markdown, usage: { ...result.usage, contentTokens: estimateTokens(best.markdown) } }
}

/**
 * The `extraction_candidates` event that makes a page with no main content its whole page (C011, 2026-10-26: Google's
 * reCAPTCHA demo, its form posted with a solved token, shows "Verification Success... Hooray!" alone, 31 characters).
 * The lane's failed result (`empty_unverified`, the whole page kept as evidence) is read as content only when readiness
 * says its region was there and not extracted (the live page held the contract: `region_ready`), and the contract, a
 * Markdown check among its checks, holds on that whole page with every check judged and passed. The requests
 * withExtractionCandidates leaves out are left out. Null for any other page, which stays failed. The event says the
 * content was the contract's choice (`replaced`), so the API's page cache never gives it to another request.
 */
export function wholePageChosen(failed: FetchResult, source: CandidateSource): TraceEvent | null {
  const { options } = source
  if (options.verify === undefined || failed.status !== 'failed' || failed.failureReason !== 'empty_unverified' || typeof failed.markdown !== 'string') return null
  if (selectionAsked(options) || wholePageAsked(options) || (options.actions ?? []).some(action => action.type === 'paginate')) return null
  if (!options.verify.checks.some(check => MARKDOWN_CHECKS.has(check.type))) return null
  const readiness = readinessOf({ ...failed, verification: verify(options.verify, failed as unknown as Record<string, unknown>, { partial: true }) })
  if (readiness.state !== 'not_extracted' || !readiness.basis.includes('region_ready')) return null
  const document = candidate('document', failed.markdown, { ...failed, status: 'success' }, options)
  if (document.markdown === null || document.passed === 0 || document.failed > 0 || document.unjudged > 0) return null
  const main = candidate('main_content', null, failed, options, 'empty')
  return candidatesEvent(failed.trace, source, readiness, 'not_extracted', [main, document], document, main, 'passes_contract')
}

function candidatesEvent(trace: readonly TraceEvent[], source: CandidateSource, readiness: Readiness, trigger: string, all: readonly Scored[], best: Scored, main: Scored, reason: string): TraceEvent {
  const capture = captureOf(trace)
  const view = [...trace].reverse().find(event => event.event === 'view')
  return {
    at: source.at,
    lane: source.lane,
    event: 'extraction_candidates',
    detail: {
      captureId: capture?.captureId ?? null,
      viewId: (view?.detail?.viewId as string | undefined) ?? null,
      readiness: readiness.state,
      trigger,
      candidates: all.map(({ markdown: _markdown, ...rest }) => rest),
      selected: best.id,
      // Whether the delivered Markdown is another candidate's: such a page is that request's answer alone.
      replaced: best !== main,
      reason,
      capped: all.some(item => item.skipped === 'html_too_large' || item.skipped === 'markdown_too_large'),
      limits: { html: MAX_TASK_SELECTION_HTML, markdown: MAX_CANDIDATE_CHARS, candidates: all.length },
    },
  }
}
