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
 * - `declared_data`: the main content with what the page declares about its
 *   subject written under it: its citation tags and article JSON-LD, and a
 *   product's facts when the product is the one the page is about.
 *
 * The candidate that passes the most checks is delivered, the first one on a
 * tie, so the main content stays unless another does better. The lane records
 * `extraction_candidates` with each candidate's checks, the choice and why, and
 * whether a limit left a candidate out; the ladder still judges the delivered
 * page with its own contractVerdict. A page whose content a contract chose is
 * that request's answer: the API engine does not store it in its page cache,
 * whose key leaves the contract out. A request that named its content
 * (`includeTags`, the whole page, a list's items) is not re-read: what it named
 * is the answer.
 */
import type { FetchOptions, FetchResult, Lane, Readiness, TraceEvent, Verification } from '@w2l/contracts'
import { CONTENTFUL_STATUS, estimateTokens } from '@w2l/contracts'
import { readinessOf, verify } from '@w2l/runtime'
import { captureOf } from '../capture.js'
import { MAX_TASK_SELECTION_HTML, selectionAsked, wholePageAsked, wholePageMarkdown } from './errorPage.js'

export const EXTRACTION_CANDIDATES = ['main_content', 'document', 'declared_data'] as const
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
  const lines: string[] = []
  const metadata = result.metadata
  if (metadata?.title) lines.push(`title: ${metadata.title}`)
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
  if (selectionAsked(options) || wholePageAsked(options) || options.list?.itemSelector !== undefined) return result
  // Only Markdown checks can change with the Markdown a candidate delivers.
  if (!options.verify.checks.some(check => MARKDOWN_CHECKS.has(check.type))) return result
  const verification = verify(options.verify, result as unknown as Record<string, unknown>, { partial: true })
  if (verification.status !== 'failed' || verification.reason !== 'checks_failed') return result
  const readiness = readinessOf({ ...result, verification })
  const trigger = candidateTrigger(result, readiness)
  if (trigger === null) return result

  const main = candidate('main_content', result.markdown, result, options)
  const tooLarge = source.html.length > MAX_TASK_SELECTION_HTML
  const whole = tooLarge ? null : wholePageMarkdown(source.html, source.url, options)
  const document = tooLarge ? candidate('document', null, result, options, 'html_too_large')
    : whole === result.markdown ? candidate('document', null, result, options, 'same_as_main')
      : candidate('document', whole, result, options)
  const lines = declaredLines(result)
  const declared = lines.length === 0 ? candidate('declared_data', null, result, options, 'empty')
    : candidate('declared_data', `${result.markdown}\n\n${lines.join('\n\n')}`, result, options)
  const all = [main, document, declared]
  // Most checks passed wins; fewer failed breaks a tie; the earlier candidate (the main content first) keeps it.
  const best = all.filter(item => item.markdown !== null).reduce((a, b) => (b.passed > a.passed || (b.passed === a.passed && b.failed < a.failed) ? b : a))
  const reason = best.id === 'main_content' ? 'main_content_kept' : best.failed === 0 && best.unjudged === 0 ? 'passes_contract' : 'more_checks_passed'
  const capture = captureOf(result.trace)
  const view = [...result.trace].reverse().find(event => event.event === 'view')
  const event: TraceEvent = {
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
      reason,
      capped: all.some(item => item.skipped === 'html_too_large' || item.skipped === 'markdown_too_large'),
      limits: { html: MAX_TASK_SELECTION_HTML, markdown: MAX_CANDIDATE_CHARS, candidates: EXTRACTION_CANDIDATES.length },
    },
  }
  // Appended to the lane's own trace array: a lane adds events after its result is built (browserLocal's session_cookies).
  ;(result.trace as TraceEvent[]).push(event)
  if (best.id === 'main_content' || best.markdown === null) return result
  return { ...result, markdown: best.markdown, usage: { ...result.usage, contentTokens: estimateTokens(best.markdown) } }
}
