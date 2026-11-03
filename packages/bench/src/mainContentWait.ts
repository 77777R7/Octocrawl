import type { Lane, TraceEvent } from '@w2l/contracts'
import { isNavigationError, LOADING_PAGE_TEXT_MAX, type SettlePage } from './browserSettle.js'

/**
 * The wait for a page's main content that its app fetches after load (developer.apple.com/documentation, 2026-11-03):
 * the static HTML is a frame (a header, a footer, an empty `<div id="app">`) that stays still while the page's data is on
 * the way, with no loading indicator and no empty main landmark for the loading probe (LOADING_PROBE) to see, so the
 * usual settle ends and the frame was read as the page: failed, or, its hidden menus over WHOLE_PAGE_MIN_CHARS of
 * Markdown, answered whole. Such a page, one with little text and no main content the extractor would answer with, is
 * read again as it changes until it has main content, or until nothing is on the way and it has stopped changing (it is
 * as empty as it looks), or until the bound.
 */
export interface MainContentWaitPage extends SettlePage {
  content(): Promise<string>
  url(): string
}

export interface MainContentWait {
  /** How long in all the page is waited for. */
  maxMs: number
  /** Whether the page's HTML holds main content: the extractor finds a region it would answer with. */
  hasContent: (html: string, url: string) => boolean
  /** How many requests the page sent (its scripts, data and frames) have not finished. */
  pending: () => number
  /** Whether the page is not one to wait on (an error status, a check): asked only of a page that would be waited for. */
  gated?: () => Promise<boolean>
  sampleMs?: number
  /** How long the page must stay unchanged, with nothing on the way, to be read as done. */
  quietMs?: number
}

/** Why the wait ended: the main content came, the page was done without it, or the bound came first. */
export type MainContentWaitEnd = 'content' | 'settled' | 'deadline'

export interface MainContentWaitOutcome {
  ended: MainContentWaitEnd
  waitedMs: number
  /** Requests still on the way when the wait ended. */
  pending: number
}

/** How long a page with nothing on the way must stay unchanged before it is read as done without main content. */
export const MAIN_CONTENT_QUIET_MS = 1_000

const SIGNATURE = `(() => {
  const root = document.documentElement
  const body = document.body
  return (root === null ? 0 : root.outerHTML.length) + ':' + (body === null ? 0 : (body.innerText ?? '').length)
})()`

const TEXT_LENGTH = `(() => document.body === null ? 0 : (document.body.innerText ?? '').length)()`

/**
 * Waits for the page's main content as above; null when there was nothing to wait for: the page has more text than
 * LOADING_PAGE_TEXT_MAX (it is read for that text, as the loading probe reads it), has main content already, or is gated.
 */
export async function waitForMainContent(page: MainContentWaitPage, wait: MainContentWait): Promise<MainContentWaitOutcome | null> {
  const started = Date.now()
  const sampleMs = wait.sampleMs ?? 250
  const quietMs = wait.quietMs ?? MAIN_CONTENT_QUIET_MS
  const deadline = started + wait.maxMs
  const holds = async () => wait.hasContent(await page.content(), page.url())
  try {
    const text = await page.evaluate(TEXT_LENGTH)
    if (typeof text !== 'number' || text > LOADING_PAGE_TEXT_MAX || await holds() || await wait.gated?.() === true) return null
  } catch (error) {
    // A page whose document went away while it was looked at is on its way to another one: it is waited for below.
    if (!isNavigationError(error)) throw error
  }
  const outcome = (ended: MainContentWaitEnd): MainContentWaitOutcome => ({ ended, waitedMs: Date.now() - started, pending: wait.pending() })
  let previous = ''
  // Since when the page has not changed and nothing it sent has been on the way.
  let quietSince = Date.now()
  while (Date.now() < deadline) {
    await page.waitForTimeout(Math.max(1, Math.min(sampleMs, deadline - Date.now())))
    let signature: unknown
    try {
      signature = await page.evaluate(SIGNATURE)
      if (signature !== previous) {
        previous = String(signature)
        quietSince = Date.now()
        if (await holds()) return outcome('content')
        continue
      }
    } catch (error) {
      if (!isNavigationError(error)) throw error
      previous = ''
      quietSince = Date.now()
      continue
    }
    if (wait.pending() > 0) quietSince = Date.now()
    else if (Date.now() - quietSince >= quietMs) return outcome('settled')
  }
  return outcome('deadline')
}

/**
 * The trace events a wait for main content leaves: `content_wait` with how it ended, and, when the bound came while the
 * page was still fetching or changing, a `loading_wait` that did not clear, which readiness (page_still_loading), the
 * whole-page answer (wholePageDelivered) and the still-loading warning read as for a loading indicator that stayed.
 */
export function mainContentWaitEvents(outcome: MainContentWaitOutcome | null, at: number, lane: Lane): TraceEvent[] {
  if (outcome === null) return []
  const events: TraceEvent[] = [{ at, lane, event: 'content_wait', detail: { ended: outcome.ended, waitedMs: outcome.waitedMs, pending: outcome.pending } }]
  if (outcome.ended === 'deadline') events.push({ at, lane, event: 'loading_wait', detail: { waitedMs: outcome.waitedMs, cleared: false } })
  return events
}
