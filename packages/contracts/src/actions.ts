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

export const PDF_PAPER_FORMATS = ['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'Letter', 'Legal', 'Tabloid', 'Ledger'] as const
export type PdfPaperFormat = (typeof PDF_PAPER_FORMATS)[number]

export type PageAction =
  /** Pause this long. */
  | { type: 'wait'; milliseconds: number }
  /** Wait until an element matching the selector is in the page (at most MAX_ACTION_WAIT_MS). */
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

/** What the steps produced, each list in the order of its steps. */
export interface ActionsResult {
  screenshots: ScreenshotEvidence[]
  scrapes: { url: string; html: string }[]
  /** `type` is the JavaScript `typeof` of the value (`null` for null). */
  javascriptReturns: { type: string; value: unknown }[]
  pdfs: ActionPdf[]
  /** The step that failed, when one did: the steps after it did not run. */
  failed?: { index: number; type: PageActionType; code: ActionErrorCode; message: string }
}
