import { LAYOUT_MARKERS } from '@w2l/extract-tf'
import type { Page } from 'playwright'

/** Elements under <body> above which a page is converted unannotated. */
export const LAYOUT_MAX_ELEMENTS = 100_000
/** Time the in-page work may take before the page is converted unannotated. */
export const LAYOUT_MAX_MS = 1_000
/** Time the whole capture may take, transfers included. */
export const LAYOUT_TIMEOUT_MS = 3_000

export interface LayoutOptions {
  maxElements?: number
  maxMs?: number
  /** Epoch ms the capture must finish by; it gives up rather than run past it. */
  deadlineAt?: number
}

export type LayoutOutcome =
  | 'annotated'
  | 'dom_changed'
  | 'marker_conflict'
  | 'element_cap'
  | 'time_cap'
  | 'timeout'
  | 'deadline'
  | 'error'

export interface LayoutCapture {
  /** The rendered page with layout markers; null when the capture fell back to the unannotated page. */
  html: string | null
  /** For the trace: the outcome, what the page held and what it cost. */
  detail: {
    outcome: LayoutOutcome
    elements?: number
    blocks?: number
    hidden?: number
    pageMs?: number
    ms: number
    error?: string
  }
}

interface AnnotateArgs {
  body: string
  display: string
  hidden: string
  blockTags: readonly string[]
  skipTags: readonly string[]
  maxElements: number
  maxMs: number
}

interface AnnotateResult {
  outcome: 'annotated' | 'dom_changed' | 'marker_conflict' | 'element_cap' | 'time_cap'
  html?: string
  elements?: number
  blocks?: number
  hidden?: number
  pageMs: number
}

/**
 * Runs in the page, in one task, so no page script can change the DOM
 * between the check against the evidence and the copy. It declares no inner
 * functions: loaded through tsx, whose esbuild keepNames transform wraps
 * them, they would call a `__name` helper the page does not have.
 */
function annotate(args: AnnotateArgs): AnnotateResult {
  const started = performance.now()
  const body = document.body
  const elements = body === null ? 0 : body.getElementsByTagName('*').length
  if (elements > args.maxElements) return { outcome: 'element_cap', elements, pageMs: performance.now() - started }
  const doctype = document.doctype === null ? '' : new XMLSerializer().serializeToString(document.doctype)
  const root = document.documentElement
  // The serialization page.content() uses: the copy must describe the evidence.
  if (root === null || doctype + root.outerHTML !== args.body) return { outcome: 'dom_changed', elements, pageMs: performance.now() - started }
  if (document.querySelector(`[${args.display}],[${args.hidden}]`) !== null) return { outcome: 'marker_conflict', elements, pageMs: performance.now() - started }
  const blockTags = new Set(args.blockTags)
  const skipTags = new Set(args.skipTags)
  const blockSelector = args.blockTags.join(',')
  const blocks: Element[] = []
  const hidden: Element[] = []
  let visited = 0
  let el: Element | null = body === null ? null : body.firstElementChild
  while (el !== null) {
    if (++visited % 128 === 0 && performance.now() - started > args.maxMs) return { outcome: 'time_cap', elements, pageMs: performance.now() - started }
    let descend = !skipTags.has(el.localName)
    // Only elements the converter lays out inline are marked; block tags keep
    // their tag's layout, so a hidden block (a popup, an accordion panel, a
    // footnote a click reveals) keeps its content.
    if (descend && !blockTags.has(el.localName)) {
      const style = getComputedStyle(el)
      if (style.display === 'none') {
        // Hidden text within a line (a platform name, a sort key) is skipped
        // with everything inside it; one that holds blocks counts as a block.
        if (el.querySelector(blockSelector) === null) {
          hidden.push(el)
          descend = false
        }
      } else if (
        // A block in the flow of the text. Absolute, fixed and floated boxes
        // also compute as blocks but leave the line around them unbroken.
        style.position !== 'absolute' && style.position !== 'fixed' && style.cssFloat === 'none' &&
        /^(?:block|flow-root|flex|grid|table|list-item|-webkit-box)(?: |$)/.test(style.display)
      ) {
        blocks.push(el)
      }
    }
    if (descend && el.firstElementChild !== null) {
      el = el.firstElementChild
    } else {
      while (el !== null && el !== body && el.nextElementSibling === null) el = el.parentElement
      el = el === null || el === body ? null : el.nextElementSibling
    }
  }
  for (const element of blocks) element.setAttribute(args.display, 'block')
  for (const element of hidden) element.setAttribute(args.hidden, '')
  const html = doctype + root.outerHTML
  for (const element of blocks) element.removeAttribute(args.display)
  for (const element of hidden) element.removeAttribute(args.hidden)
  return { outcome: 'annotated', html, elements, blocks: blocks.length, hidden: hidden.length, pageMs: performance.now() - started }
}

/**
 * The page's own layout, captured for conversion only.
 *
 * The converter lays HTML out by its tags; a page's CSS can differ (a <span>
 * shown as a block, a platform name hidden with display: none). Given the
 * settled page and `body`, the page.content() the caller already hashed as
 * evidence, this reads the computed style of each element the converter
 * would lay out inline and returns a copy of `body` with extract-tf's
 * LAYOUT_MARKERS where the page lays that element out as a block in the flow,
 * or hides it while it holds only inline content. The copy is `body` plus
 * those attributes and nothing else; the markers are removed from the live
 * page before the call returns, and never reach the evidence.
 *
 * The cost is bounded: past maxElements, past maxMs of in-page work, or past
 * the time left, the capture returns no copy and says why, and the caller
 * converts `body` unannotated.
 */
export async function captureLayout(page: Page, body: string, options: LayoutOptions = {}): Promise<LayoutCapture> {
  const started = performance.now()
  const ms = () => Math.round(performance.now() - started)
  const budget = options.deadlineAt === undefined ? LAYOUT_TIMEOUT_MS : Math.min(LAYOUT_TIMEOUT_MS, options.deadlineAt - Date.now())
  if (budget <= 0) return { html: null, detail: { outcome: 'deadline', ms: ms() } }
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const pending = page.evaluate(annotate, {
      body,
      display: LAYOUT_MARKERS.display,
      hidden: LAYOUT_MARKERS.hidden,
      blockTags: LAYOUT_MARKERS.blockTags,
      skipTags: LAYOUT_MARKERS.skipTags,
      maxElements: options.maxElements ?? LAYOUT_MAX_ELEMENTS,
      maxMs: Math.min(options.maxMs ?? LAYOUT_MAX_MS, budget),
    })
    // A capture abandoned at the timeout may still fail when the page closes.
    pending.catch(() => {})
    const result = await Promise.race([pending, new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), budget) })])
    if (result === null) return { html: null, detail: { outcome: 'timeout', ms: ms() } }
    const { html, pageMs, ...counts } = result
    return { html: result.outcome === 'annotated' ? html ?? null : null, detail: { ...counts, pageMs: Math.round(pageMs), ms: ms() } }
  } catch (error) {
    return { html: null, detail: { outcome: 'error', ms: ms(), error: (error instanceof Error ? error.message : String(error)).slice(0, 200) } }
  } finally {
    clearTimeout(timer)
  }
}
