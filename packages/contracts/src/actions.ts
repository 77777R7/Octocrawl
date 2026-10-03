/**
 * Page actions: steps the local browser runs on a page after it loads and
 * before it is read, in the order given (Firecrawl v4.42.0's `actions`).
 * Each step is recorded in the trace with its outcome and timing; a step
 * that fails ends the pipeline, and the result keeps the page as it stood.
 */

import type { ScreenshotEvidence } from './result.js'
import type { ScreenshotViewport } from './structured.js'

/** The most steps one request may run. */
export const MAX_ACTIONS = 50
/** The longest a `wait` may pause, or wait for its selector, in milliseconds. */
export const MAX_ACTION_WAIT_MS = 60_000
/** The longest `executeJavascript` script, in characters. */
export const MAX_ACTION_SCRIPT_CHARS = 100_000
/** The longest `write` text, in characters. */
export const MAX_ACTION_TEXT_CHARS = 10_000

/** The most rounds (scrolls, clicks) a scrollToEnd or loadMore step may take, and the most pages a paginate step may read. */
export const MAX_LIST_ROUNDS = 200
export const MAX_LIST_PAGES = 100
/** A list step's pause after each round for the page to add what it loads, in milliseconds. */
export const LIST_WAIT_MS = { min: 100, max: 10_000, default: 1_000 } as const
export const LIST_DEFAULTS = { maxScrolls: 50, maxClicks: 50, maxPages: 10 } as const

export const PDF_PAPER_FORMATS = ['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'Letter', 'Legal', 'Tabloid', 'Ledger'] as const
export type PdfPaperFormat = (typeof PDF_PAPER_FORMATS)[number]

export type PageAction =
  /** Pause this long. */
  | { type: 'wait'; milliseconds: number }
  /** Wait until an element matching the selector is shown on the page (at most MAX_ACTION_WAIT_MS): one that is there but hidden does not count. */
  | { type: 'wait'; selector: string }
  /** Click the first element matching the selector; `all` (Firecrawl v1) clicks every match, in document order. */
  | { type: 'click'; selector: string; all?: boolean }
  /** Type into the element that has focus (click it first), as a keyboard would. */
  | { type: 'write'; text: string }
  /** Press one key (`Enter`, `Tab`, `ArrowDown`, `a`, ...). */
  | { type: 'press'; key: string }
  /** Scroll the page, or the element matching `selector`, one screen up or down. */
  | { type: 'scroll'; direction: 'up' | 'down'; selector?: string }
  /** An image of the page as it stands. */
  | { type: 'screenshot'; fullPage?: boolean; quality?: number; viewport?: ScreenshotViewport }
  /** The page's HTML as it stands. */
  | { type: 'scrape' }
  /** Run a script in the page; what it returns (awaited, JSON-serialisable) is kept. */
  | { type: 'executeJavascript'; script: string }
  /** The page printed as a PDF. */
  | { type: 'pdf'; format?: PdfPaperFormat; landscape?: boolean; scale?: number }
  /**
   * W2L's own: scroll the page (or the element `selector` names) to its end
   * again and again until a round adds nothing: neither height nor, with
   * `itemSelector`, items (`end`), or `maxScrolls` rounds (default 50).
   */
  | { type: 'scrollToEnd'; selector?: string; itemSelector?: string; maxScrolls?: number; waitMs?: number }
  /**
   * W2L's own: click the "load more" control `selector` again and again
   * until it is gone, hidden or disabled (`end`), a click adds nothing
   * (`no_growth`), or `maxClicks` (default 50).
   */
  | { type: 'loadMore'; selector: string; itemSelector?: string; maxClicks?: number; waitMs?: number }
  /**
   * W2L's own: read the page, follow `nextSelector`, read that page, and so
   * on, each page's HTML kept in `scrapes`, until there is no next control,
   * it is hidden or disabled (`end`), a page repeats one already read
   * (`repeat`), or `maxPages` pages were read (default 10).
   */
  | { type: 'paginate'; nextSelector: string; itemSelector?: string; maxPages?: number; waitMs?: number }

export type PageActionType = PageAction['type']

/** Why a step failed: the pipeline stops there. */
export type ActionErrorCode =
  /** No element matched the selector of a click, or of a scroll within an element. */
  | 'selector_not_found'
  /** A `wait` for a selector timed out. */
  | 'selector_timeout'
  /** The script threw, or returned something that cannot be serialised. */
  | 'script_error'
  /** A step led the page to a URL W2L does not fetch (robots.txt, the egress policy). */
  | 'navigation_refused'
  /** The scrape's deadline came before the step finished. */
  | 'deadline_exceeded'
  /** The browser refused the step (a PDF in a headed browser, a detached element, ...). */
  | 'action_error'

/** A PDF a `pdf` step printed. */
export interface ActionPdf {
  contentType: 'application/pdf'
  format: PdfPaperFormat
  landscape: boolean
  scale: number
  bytes: number
  sha256: string
  path: string | null
  base64: string
}

/** Why a scrollToEnd, loadMore or paginate step stopped. `max` and `deadline` stop short of the list's end. */
export type ListStop = 'end' | 'no_growth' | 'repeat' | 'max' | 'deadline'

/** What a scrollToEnd, loadMore or paginate step did. */
export interface ListRun {
  index: number
  type: 'scrollToEnd' | 'loadMore' | 'paginate'
  stoppedBy: ListStop
  /** Scrolls, clicks, or pages read. */
  rounds: number
  /** Elements matching `itemSelector` at the end (on the last page for paginate; summed over its pages in `itemsRead`); null without one. */
  items: number | null
  /** paginate: elements matching `itemSelector` over every page read; null without one. */
  itemsRead?: number | null
}

/** What the steps produced, each list in the order of its steps. */
export interface ActionsResult {
  screenshots: ScreenshotEvidence[]
  scrapes: { url: string; html: string }[]
  /** `type` is the JavaScript `typeof` of the value (`null` for null). */
  javascriptReturns: { type: string; value: unknown }[]
  pdfs: ActionPdf[]
  /** What each scrollToEnd, loadMore and paginate step did, and why it stopped. */
  lists: ListRun[]
  /** The step that failed, when one did: the steps after it did not run. */
  failed?: { index: number; type: PageActionType; code: ActionErrorCode; message: string }
}
