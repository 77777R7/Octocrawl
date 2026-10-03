/**
 * The request's `actions`, run on the local browser's page after load,
 * stability and `waitFor`, and before the screenshot format and the DOM are
 * read, one at a time in the order given. Every step leaves an `action`
 * trace event with its index, type, outcome and time. A step that fails
 * stops the pipeline: `failed` names it, and the page stays as it stood.
 * Every step is bounded by the scrape's deadline less the time kept back
 * to read the page, so a step that hangs fails as `deadline_exceeded` and
 * what the steps before it produced is kept. A navigation of the page to a
 * URL W2L does not fetch is stopped before its request goes out (the
 * browser lane's guard) and fails the step that caused it.
 */

import { createHash } from 'node:crypto'
import type { Page } from 'playwright'
import {
  LIST_DEFAULTS,
  LIST_WAIT_MS,
  MAX_ACTION_WAIT_MS,
  type ListRun,
  type ListStop,
  type ActionErrorCode,
  type ActionPdf,
  type ActionsResult,
  type ExecutionContext,
  type PageAction,
  type ScreenshotViewport,
  type TraceEvent,
} from '@w2l/contracts'
import { abortableSleep, raceWithSignal, throwIfExecutionStopped } from '@w2l/http-core'
import { captureArtifact } from '../rawArtifact.js'
import { captureScreenshot } from './screenshot.js'

export interface ActionRunContext {
  page: Page
  execution: ExecutionContext
  trace: TraceEvent[]
  /** Milliseconds since the fetch started, for trace events. */
  at: () => number
  /** Wait for the page to stop changing after a step, at most this long. */
  settle: (maxMs: number) => Promise<void>
  /** The time kept back from the deadline for reading the page after the steps. */
  reserveMs: number
  deviceScaleFactor: number
  /** The window the page is laid out in, to restore after a screenshot step that asked for another. */
  viewport: ScreenshotViewport
  /** A main-frame navigation the browser lane's guard stopped since the last call, or null; each is reported once. */
  takeRefusedNavigation: () => { url: string; reason: string } | null
  /** Why W2L would not fetch the URL a step left the page at (reached through a redirect the guard does not see), or null. */
  refuseLanded: (url: string) => Promise<string | null>
  /** The URL of every document the main frame has loaded so far, in order; a URL changed within the page (pushState) loads none. */
  loadedDocuments: () => readonly string[]
}

export interface ActionRun {
  result: ActionsResult
  /** How many of the page's loaded documents the steps checked: the ones after it loaded after the steps. */
  checkedDocuments: number
  /** Files written under W2L_CAPTURE_RAW_DIR, for `evidence.artifacts`. */
  artifacts: string[]
}

/** How long the page may take to settle after a step that can change it. */
const SETTLE_AFTER_STEP_MS = 1_500

class StepFailure extends Error {
  constructor(readonly code: ActionErrorCode, message: string) {
    super(message)
  }
}

export async function runPageActions(actions: readonly PageAction[], ctx: ActionRunContext): Promise<ActionRun> {
  const { page, execution, trace } = ctx
  const result: ActionsResult = { screenshots: [], scrapes: [], javascriptReturns: [], pdfs: [], lists: [] }
  const artifacts: string[] = []
  let checkedUrl = withoutHash(page.url())
  // Documents loaded before the first step are the fetch's; every one after it is checked, in order, whatever its URL.
  let checkedDocuments = ctx.loadedDocuments().length
  /** The first document loaded since the last check that W2L does not fetch, checking (and passing) the ones before it; documents loaded during a check are checked too. A refused one stays unchecked: the page may still show it, and the check after the steps then reads nothing. */
  const refusedDocument = async (): Promise<{ url: string; reason: string } | null> => {
    for (let loaded = ctx.loadedDocuments(); checkedDocuments < loaded.length; loaded = ctx.loadedDocuments()) {
      const url = loaded[checkedDocuments]!
      const reason = await ctx.refuseLanded(url)
      if (reason !== null) return { url, reason }
      checkedDocuments++
    }
    return null
  }
  for (const [index, action] of actions.entries()) {
    throwIfExecutionStopped(execution)
    const started = performance.now()
    const before = { screenshots: result.screenshots.length, scrapes: result.scrapes.length, javascriptReturns: result.javascriptReturns.length, pdfs: result.pdfs.length, lists: result.lists.length, artifacts: artifacts.length }
    // Every document loaded so far, a redirect's landing among them (the guard sees only a navigation's first request), and a
    // navigation the guard stopped: either fails the step. A paginate step checks between its pages, the runner after every step.
    const guard = async (): Promise<void> => {
      const landed = await refusedDocument()
      if (landed !== null) throw new StepFailure('navigation_refused', `the step led the page to ${landed.url}, which W2L does not fetch (${landed.reason}); it is not read`)
      const refused = ctx.takeRefusedNavigation()
      if (refused !== null) throw new StepFailure('navigation_refused', `the step led the page to ${refused.url}, which W2L does not fetch (${refused.reason}); the request was not sent`)
    }
    try {
      const detail = await runStep(action, ctx, result, artifacts, index, guard)
      await guard()
      const now = withoutHash(page.url())
      const moved = now !== checkedUrl
      checkedUrl = now
      trace.push({ at: ctx.at(), lane: 'browser_local', event: 'action', detail: { index, type: action.type, outcome: 'ok', ms: Math.round(performance.now() - started), ...detail, ...(moved ? { navigatedTo: now } : {}) } })
    } catch (error) {
      if (execution.signal?.aborted) throw error
      let failure = error instanceof StepFailure ? error : new StepFailure(deadlinePassed(ctx) ? 'deadline_exceeded' : 'action_error', message(error))
      // Whatever made the step fail, a document it loaded that W2L does not fetch is the reason that counts.
      if (failure.code !== 'navigation_refused') {
        const landed = await refusedDocument().catch(() => null)
        if (landed !== null) failure = new StepFailure('navigation_refused', `the step led the page to ${landed.url}, which W2L does not fetch (${landed.reason}); it is not read`)
      }
      // A step that met a page W2L does not fetch keeps nothing it produced: it may have read that page.
      if (failure.code === 'navigation_refused') {
        result.screenshots.length = before.screenshots
        result.scrapes.length = before.scrapes
        result.javascriptReturns.length = before.javascriptReturns
        result.pdfs.length = before.pdfs
        result.lists.length = before.lists
        artifacts.length = before.artifacts
      }
      trace.push({ at: ctx.at(), lane: 'browser_local', event: 'action', detail: { index, type: action.type, outcome: 'failed', ms: Math.round(performance.now() - started), code: failure.code, error: failure.message } })
      result.failed = { index, type: action.type, code: failure.code, message: failure.message }
      break
    }
  }
  return { result, artifacts, checkedDocuments }
}

async function runStep(action: PageAction, ctx: ActionRunContext, result: ActionsResult, artifacts: string[], index: number, guard: () => Promise<void>): Promise<Record<string, unknown>> {
  const { page, execution } = ctx
  const signal = execution.signal
  switch (action.type) {
    case 'wait': {
      if ('milliseconds' in action) {
        const allowed = timeLeft(ctx)
        if (allowed < action.milliseconds) {
          if (allowed > 0) await abortableSleep(allowed, signal)
          throw new StepFailure('deadline_exceeded', `the scrape's deadline came ${Math.round(action.milliseconds - Math.max(0, allowed))} ms before the wait of ${action.milliseconds} ms ended`)
        }
        await abortableSleep(action.milliseconds, signal)
        return { milliseconds: action.milliseconds }
      }
      const timeout = Math.min(MAX_ACTION_WAIT_MS, timeLeft(ctx))
      if (timeout <= 0) throw new StepFailure('deadline_exceeded', `the scrape's deadline came before ${action.selector} could be waited for`)
      try {
        await raceWithSignal(page.waitForSelector(action.selector, { state: 'visible', timeout }), signal)
      } catch (error) {
        if (signal?.aborted) throw error
        if (isTimeout(error)) throw new StepFailure(timeout < MAX_ACTION_WAIT_MS ? 'deadline_exceeded' : 'selector_timeout', `no element matched ${action.selector} within ${timeout} ms`)
        throw new StepFailure('action_error', message(error))
      }
      return { selector: action.selector }
    }
    case 'click': {
      const matches = page.locator(action.selector)
      const count = await bounded(ctx, matches.count())
      if (count === 0) throw new StepFailure('selector_not_found', `no element matched ${action.selector}`)
      const targets = action.all === true ? count : 1
      for (let i = 0; i < targets; i++) {
        await raceWithSignal(matches.nth(i).click({ timeout: stepTimeout(ctx) }), signal)
      }
      await ctx.settle(Math.min(SETTLE_AFTER_STEP_MS, timeLeft(ctx)))
      return { selector: action.selector, matched: count, clicked: targets }
    }
    case 'write':
      await bounded(ctx, page.keyboard.type(action.text))
      return { characters: action.text.length }
    case 'press':
      await bounded(ctx, page.keyboard.press(action.key))
      await ctx.settle(Math.min(SETTLE_AFTER_STEP_MS, timeLeft(ctx)))
      return { key: action.key }
    case 'scroll': {
      const sign = action.direction === 'down' ? 1 : -1
      if (action.selector !== undefined) {
        const target = page.locator(action.selector).first()
        if (await bounded(ctx, page.locator(action.selector).count()) === 0) throw new StepFailure('selector_not_found', `no element matched ${action.selector}`)
        await bounded(ctx, target.evaluate((element, s) => { element.scrollBy(0, s * element.clientHeight) }, sign))
      } else {
        await bounded(ctx, page.evaluate((s) => { window.scrollBy(0, s * window.innerHeight) }, sign))
      }
      await ctx.settle(Math.min(SETTLE_AFTER_STEP_MS, timeLeft(ctx)))
      return { direction: action.direction, ...(action.selector === undefined ? {} : { selector: action.selector }), scrollY: await bounded(ctx, page.evaluate(() => Math.round(window.scrollY))) }
    }
    case 'screenshot': {
      const viewport = action.viewport ?? ctx.viewport
      if (action.viewport !== undefined) await bounded(ctx, page.setViewportSize(action.viewport))
      try {
        const capture = await bounded(ctx, captureScreenshot(page, action, viewport, ctx.deviceScaleFactor, execution, ctx.trace, ctx.at))
        if (capture.screenshot === null) throw new StepFailure('action_error', capture.warning?.message ?? 'the screenshot could not be captured')
        result.screenshots.push(capture.screenshot)
        artifacts.push(...capture.artifacts)
        return { sha256: capture.screenshot.sha256, bytes: capture.screenshot.bytes }
      } finally {
        if (action.viewport !== undefined) await page.setViewportSize(ctx.viewport).catch(() => {})
      }
    }
    case 'scrape': {
      const html = await bounded(ctx, page.content())
      const url = page.url()
      result.scrapes.push({ url, html })
      return { url, characters: html.length }
    }
    case 'executeJavascript': {
      let value: unknown
      try {
        // A function body, as Firecrawl takes it (`return` gives the value), awaited. Evaluated through the
        // DevTools protocol, so the page's Content-Security-Policy does not stop it.
        value = await bounded(ctx, page.evaluate(`(async () => {\n${action.script}\n})()`))
      } catch (error) {
        if (signal?.aborted || error instanceof StepFailure) throw error
        throw new StepFailure('script_error', message(error))
      }
      const type = value === null ? 'null' : typeof value
      result.javascriptReturns.push({ type, value: value === undefined ? null : value })
      await ctx.settle(Math.min(SETTLE_AFTER_STEP_MS, timeLeft(ctx)))
      return { returned: type }
    }
    case 'pdf': {
      const format = action.format ?? 'Letter'
      const landscape = action.landscape ?? false
      const scale = action.scale ?? 1
      const buffer = await bounded(ctx, page.pdf({ format, landscape, scale, printBackground: true }))
      const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      const files = await captureArtifact(bytes, sha256, 'pdf')
      artifacts.push(...files)
      const pdf: ActionPdf = { contentType: 'application/pdf', format, landscape, scale, bytes: bytes.byteLength, sha256, path: files[0] ?? null, base64: buffer.toString('base64') }
      result.pdfs.push(pdf)
      return { format, landscape, scale, bytes: pdf.bytes, sha256 }
    }
    case 'scrollToEnd':
    case 'loadMore':
    case 'paginate': {
      const run = action.type === 'scrollToEnd' ? await scrollToEnd(action, ctx, index)
        : action.type === 'loadMore' ? await loadMore(action, ctx, index)
          : await paginate(action, ctx, index, result, guard)
      result.lists.push(run)
      return { stoppedBy: run.stoppedBy, rounds: run.rounds, items: run.items, ...(run.itemsRead === undefined ? {} : { itemsRead: run.itemsRead }) }
    }
  }
}

/** Two rounds in a row that add nothing end a list: one quiet round may be a slow load. */
const QUIET_ROUNDS_TO_END = 2

interface Measure { height: number; items: number | null }

/** The page's (or the element's) scroll height, and the items `itemSelector` matches. */
async function measure(ctx: ActionRunContext, itemSelector: string | undefined, within?: string): Promise<Measure> {
  const height = await bounded(ctx, within === undefined
    ? ctx.page.evaluate(() => (document.scrollingElement ?? document.body).scrollHeight)
    : ctx.page.locator(within).first().evaluate((element) => element.scrollHeight))
  const items = itemSelector === undefined ? null : await bounded(ctx, ctx.page.locator(itemSelector).count())
  return { height, items }
}

const grew = (before: Measure, after: Measure): boolean => after.height > before.height || (after.items !== null && before.items !== null && after.items > before.items)

/** Wait for what a round loads: the pause asked for, then the page's quiet, within the time left. */
async function afterRound(ctx: ActionRunContext, waitMs: number): Promise<void> {
  const pause = Math.min(waitMs, Math.max(0, timeLeft(ctx)))
  if (pause > 0) await abortableSleep(pause, ctx.execution.signal)
  await ctx.settle(Math.min(SETTLE_AFTER_STEP_MS, Math.max(0, timeLeft(ctx))))
}

/** Whether a round of `waitMs` still fits before the time kept back to read the page. */
const roundFits = (ctx: ActionRunContext, waitMs: number): boolean => timeLeft(ctx) > waitMs + 500

async function scrollToEnd(action: Extract<PageAction, { type: 'scrollToEnd' }>, ctx: ActionRunContext, index: number): Promise<ListRun> {
  const max = action.maxScrolls ?? LIST_DEFAULTS.maxScrolls
  const waitMs = action.waitMs ?? LIST_WAIT_MS.default
  if (action.selector !== undefined && await bounded(ctx, ctx.page.locator(action.selector).count()) === 0) throw new StepFailure('selector_not_found', `no element matched ${action.selector}`)
  let last = await measure(ctx, action.itemSelector, action.selector)
  let rounds = 0
  let quiet = 0
  let stoppedBy: ListStop
  for (;;) {
    if (rounds >= max) { stoppedBy = 'max'; break }
    if (!roundFits(ctx, waitMs)) { stoppedBy = 'deadline'; break }
    await bounded(ctx, action.selector === undefined
      ? ctx.page.evaluate(() => { window.scrollTo(0, (document.scrollingElement ?? document.body).scrollHeight) })
      : ctx.page.locator(action.selector).first().evaluate((element) => { element.scrollTop = element.scrollHeight }))
    rounds++
    await afterRound(ctx, waitMs)
    const now = await measure(ctx, action.itemSelector, action.selector)
    quiet = grew(last, now) ? 0 : quiet + 1
    last = now
    if (quiet >= QUIET_ROUNDS_TO_END) { stoppedBy = 'end'; break }
  }
  return { index, type: 'scrollToEnd', stoppedBy, rounds, items: last.items }
}

/** Why a control cannot be used: gone, hidden, or disabled (the attribute, aria-disabled, or a `disabled` class on it or around it). */
async function unusable(ctx: ActionRunContext, selector: string): Promise<string | null> {
  const control = ctx.page.locator(selector).first()
  if (await bounded(ctx, ctx.page.locator(selector).count()) === 0) return 'gone'
  if (!await bounded(ctx, control.isVisible())) return 'hidden'
  const disabled = await bounded(ctx, control.evaluate((element) =>
    (element as HTMLButtonElement).disabled === true ||
    element.getAttribute('aria-disabled') === 'true' ||
    element.closest('.disabled, [aria-disabled="true"], [disabled]') !== null))
  return disabled ? 'disabled' : null
}

async function loadMore(action: Extract<PageAction, { type: 'loadMore' }>, ctx: ActionRunContext, index: number): Promise<ListRun> {
  const max = action.maxClicks ?? LIST_DEFAULTS.maxClicks
  const waitMs = action.waitMs ?? LIST_WAIT_MS.default
  let last = await measure(ctx, action.itemSelector)
  let rounds = 0
  let quiet = 0
  let stoppedBy: ListStop
  for (;;) {
    // The control gone, hidden or disabled is the list's end; gone before the first click, it was never there.
    const why = await unusable(ctx, action.selector)
    if (why !== null) {
      if (rounds === 0 && why === 'gone') throw new StepFailure('selector_not_found', `no element matched ${action.selector}`)
      stoppedBy = 'end'
      break
    }
    if (rounds >= max) { stoppedBy = 'max'; break }
    if (!roundFits(ctx, waitMs)) { stoppedBy = 'deadline'; break }
    await raceWithSignal(ctx.page.locator(action.selector).first().click({ timeout: stepTimeout(ctx) }), ctx.execution.signal)
    rounds++
    await afterRound(ctx, waitMs)
    const now = await measure(ctx, action.itemSelector)
    quiet = grew(last, now) ? 0 : quiet + 1
    last = now
    if (quiet >= QUIET_ROUNDS_TO_END) { stoppedBy = 'no_growth'; break }
  }
  return { index, type: 'loadMore', stoppedBy, rounds, items: last.items }
}

async function paginate(action: Extract<PageAction, { type: 'paginate' }>, ctx: ActionRunContext, index: number, result: ActionsResult, guard: () => Promise<void>): Promise<ListRun> {
  const max = action.maxPages ?? LIST_DEFAULTS.maxPages
  const waitMs = action.waitMs ?? LIST_WAIT_MS.default
  const seenStates = new Set<string>()
  const seenTexts = new Set<string>()
  let pages = 0
  let itemsRead: number | null = action.itemSelector === undefined ? null : 0
  let items: number | null = null
  let stoppedBy: ListStop
  for (;;) {
    // The page as it stands. Its URL and text seen together before: Next led back or did nothing, and the list is over. Its text
    // alone seen before: the same page under another URL (a site's first page at both /list and /list?page=1), not read twice,
    // and its Next is followed on.
    const html = await bounded(ctx, ctx.page.content())
    const url = ctx.page.url()
    const text = await bounded(ctx, ctx.page.evaluate(() => document.body?.innerText ?? ''))
    const textHash = createHash('sha256').update(text).digest('hex')
    const state = `${withoutHash(url)}\u0000${textHash}`
    if (seenStates.has(state)) { stoppedBy = 'repeat'; break }
    seenStates.add(state)
    if (!seenTexts.has(textHash)) {
      seenTexts.add(textHash)
      result.scrapes.push({ url, html })
      pages++
      if (action.itemSelector !== undefined) {
        items = await bounded(ctx, ctx.page.locator(action.itemSelector).count())
        itemsRead = (itemsRead ?? 0) + items
      }
    }
    if (pages >= max) { stoppedBy = 'max'; break }
    if (await unusable(ctx, action.nextSelector) !== null) { stoppedBy = 'end'; break }
    if (!roundFits(ctx, waitMs)) { stoppedBy = 'deadline'; break }
    await raceWithSignal(ctx.page.locator(action.nextSelector).first().click({ timeout: stepTimeout(ctx) }), ctx.execution.signal)
    await afterRound(ctx, waitMs)
    // The next page goes through the same checks as any page a step reaches, before it is read.
    await guard()
  }
  return { index, type: 'paginate', stoppedBy, rounds: pages, items, itemsRead }
}

/**
 * The operation, or `deadline_exceeded` when the time left for steps runs
 * out first (the operation is left to the page; the page is read as it
 * stands). A stopped fetch still rejects as stopped.
 */
async function bounded<T>(ctx: ActionRunContext, operation: Promise<T>): Promise<T> {
  const left = timeLeft(ctx)
  if (left <= 0) {
    operation.catch(() => {})
    throw new StepFailure('deadline_exceeded', 'the scrape\'s deadline came before the step could run')
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  const expired = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new StepFailure('deadline_exceeded', `the step did not finish within the ${Math.round(left)} ms left before the scrape's deadline`)), left) })
  try {
    return await raceWithSignal(Promise.race([operation, expired]), ctx.execution.signal)
  } finally {
    clearTimeout(timer)
    operation.catch(() => {})
  }
}

/** Milliseconds left for steps before the time kept back to read the page. */
function timeLeft(ctx: ActionRunContext): number {
  const deadline = ctx.execution.deadlineAt
  return deadline === undefined ? MAX_ACTION_WAIT_MS : deadline - ctx.reserveMs - Date.now()
}

function stepTimeout(ctx: ActionRunContext): number {
  const left = timeLeft(ctx)
  if (left <= 0) throw new StepFailure('deadline_exceeded', 'the scrape\'s deadline came before the step could run')
  return Math.min(MAX_ACTION_WAIT_MS, left)
}

function deadlinePassed(ctx: ActionRunContext): boolean {
  return timeLeft(ctx) <= 0
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.name === 'TimeoutError'
}

function message(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  // Playwright appends a call log; the first line says what happened.
  return text.split('\n')[0]!.slice(0, 300)
}

function withoutHash(url: string): string {
  const at = url.indexOf('#')
  return at === -1 ? url : url.slice(0, at)
}
