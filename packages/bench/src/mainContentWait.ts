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

/** A request the page sent that its content may wait on (a document, a script, its data), with when it got where. */
export interface AwaitedRequest {
  startedAt: number
  /** When its response headers came. */
  respondedAt?: number
  /** When it finished or failed. */
  finishedAt?: number
  /** Whether it is a data request (fetch, XHR), the kind a page polls with. */
  data: boolean
}

export interface MainContentWait {
  /** How long in all the page is waited for. */
  maxMs: number
  /** Whether the page's HTML holds main content: the extractor finds a region it would answer with. */
  hasContent: (html: string, url: string) => boolean
  /** The requests the page sent so far. */
  requests: () => Iterable<AwaitedRequest>
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
  /** At the bound: whether the page was still changing or had requests on the way, so its content may yet have come. */
  stillLoading: boolean
}

/** How long a page with nothing on the way must stay unchanged before it is read as done without main content. */
export const MAIN_CONTENT_QUIET_MS = 1_000

/**
 * A request on the way longer than this is the page's background (a long poll, a tracker that hangs), not its content:
 * it is not waited on. developer.apple.com's data took about 4.3 s from its request to the page when held up (2026-11-03).
 */
export const BACKGROUND_REQUEST_MS = 5_000

/** Data requests a page sent during the wait that finished without changing it, from which on it is read as polling. */
export const POLLING_REQUESTS = 3

const SIGNATURE = `(() => {
  const root = document.documentElement
  const body = document.body
  return (root === null ? 0 : root.outerHTML.length) + ':' + (body === null ? 0 : (body.innerText ?? '').length)
})()`

const TEXT_LENGTH = `(() => document.body === null ? 0 : (document.body.innerText ?? '').length)()`

/**
 * Waits for the page's main content as above; null when there was nothing to wait for: the page has more text than
 * LOADING_PAGE_TEXT_MAX (it is read for that text, as the loading probe reads it), has main content already, or is gated.
 * What is on the way: a request that has not finished, unless its headers came over quietMs ago (a body streamed on and
 * on), it has been on the way BACKGROUND_REQUEST_MS, or the page polls (POLLING_REQUESTS) and it was sent during the wait.
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
  // When the page was seen to change, and the data requests sent during the wait already judged for polling.
  const changes: number[] = []
  const judged = new Set<AwaitedRequest>()
  let idleRequests = 0
  const onTheWay = (now: number): number => {
    let count = 0
    for (const request of wait.requests()) {
      // A data request sent during the wait that finished: did the page change while it was out (two samples after it)?
      if (request.data && request.startedAt >= started && request.finishedAt !== undefined && !judged.has(request) && now - request.finishedAt >= 2 * sampleMs) {
        judged.add(request)
        if (!changes.some((at) => at >= request.startedAt && at <= request.finishedAt! + 2 * sampleMs)) idleRequests++
      }
    }
    for (const request of wait.requests()) {
      if (request.finishedAt !== undefined) continue
      if (request.respondedAt !== undefined && now - request.respondedAt >= quietMs) continue
      if (now - request.startedAt >= BACKGROUND_REQUEST_MS) continue
      if (idleRequests >= POLLING_REQUESTS && request.startedAt >= started) continue
      count++
    }
    return count
  }
  const outcome = (ended: MainContentWaitEnd): MainContentWaitOutcome => {
    const now = Date.now()
    const pending = onTheWay(now)
    const changing = changes.length > 0 && now - changes[changes.length - 1]! < quietMs
    return { ended, waitedMs: now - started, pending, stillLoading: ended === 'deadline' && (pending > 0 || changing) }
  }
  let previous = ''
  // Since when the page has not changed and nothing it sent has been on the way.
  let quietSince = Date.now()
  while (Date.now() < deadline) {
    await page.waitForTimeout(Math.max(1, Math.min(sampleMs, deadline - Date.now())))
    let signature: unknown
    try {
      signature = await page.evaluate(SIGNATURE)
      if (signature !== previous) {
        if (previous !== '') changes.push(Date.now())
        previous = String(signature)
        quietSince = Date.now()
        if (await holds()) return outcome('content')
        continue
      }
    } catch (error) {
      if (!isNavigationError(error)) throw error
      previous = ''
      quietSince = Date.now()
      changes.push(Date.now())
      continue
    }
    if (onTheWay(Date.now()) > 0) quietSince = Date.now()
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
  if (outcome.stillLoading) events.push({ at, lane, event: 'loading_wait', detail: { waitedMs: outcome.waitedMs, cleared: false } })
  return events
}
