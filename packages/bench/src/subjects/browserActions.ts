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
import type { Locator, Page } from 'playwright'
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
  type ListChallenge,
  type ListPageRead,
  type PageAction,
  type ScreenshotViewport,
  type TraceEvent,
} from '@w2l/contracts'
import { abortableSleep, classifyGate, raceWithSignal, throwIfExecutionStopped } from '@w2l/http-core'
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
  /**
   * Runs an `executeJavascript` step's script in the page's own JavaScript world, where its globals are.
   * Patchright evaluates in an isolated world unless told otherwise, which would hide them; absent, `page.evaluate`.
   */
  evaluateScript?: (expression: string) => Promise<unknown>
}

export interface ActionRun {
  result: ActionsResult
  /** How many of the page's loaded documents the steps checked: the ones after it loaded after the steps. */
  checkedDocuments: number
  /** Files written under W2L_CAPTURE_RAW_DIR, for `evidence.artifacts`. */
  artifacts: string[]
  /** How much of each output there was before the last step that ran, for dropLastStep. */
  lastStepFrom: OutputCounts
}

/** How many screenshots, scrapes, script returns, PDFs, lists and files the steps had produced at some point. */
export interface OutputCounts { screenshots: number; scrapes: number; javascriptReturns: number; pdfs: number; lists: number; artifacts: number }

const outputCounts = (result: ActionsResult, artifacts: readonly string[]): OutputCounts => ({ screenshots: result.screenshots.length, scrapes: result.scrapes.length, javascriptReturns: result.javascriptReturns.length, pdfs: result.pdfs.length, lists: result.lists.length, artifacts: artifacts.length })

/** Everything produced since `from`: a step that met a page W2L does not fetch keeps nothing it produced, as it may have read that page. */
function dropSince(result: ActionsResult, artifacts: string[], from: OutputCounts): void {
  result.screenshots.length = from.screenshots
  result.scrapes.length = from.scrapes
  result.javascriptReturns.length = from.javascriptReturns
  result.pdfs.length = from.pdfs
  result.lists.length = from.lists
  artifacts.length = from.artifacts
}

/** What the last step that ran produced, dropped: a page W2L does not fetch, found after the steps, is that step's. */
export function dropLastStep(run: ActionRun): void {
  dropSince(run.result, run.artifacts, run.lastStepFrom)
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
  let lastStepFrom = outputCounts(result, artifacts)
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
    const before = outputCounts(result, artifacts)
    lastStepFrom = before
    // Every document loaded so far, a redirect's landing among them (the guard sees only a navigation's first request), and a
    // navigation the guard stopped: either fails the step. A paginate step checks between its pages, the runner after every step.
    const guard = async (): Promise<void> => {
      const landed = await refusedDocument()
      if (landed !== null) throw new StepFailure('navigation_refused', `the step led the page to ${landed.url}, which Octocrawl does not fetch (${landed.reason}); it is not read`)
      const refused = ctx.takeRefusedNavigation()
      if (refused !== null) throw new StepFailure('navigation_refused', `the step led the page to ${refused.url}, which Octocrawl does not fetch (${refused.reason}); the request was not sent`)
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
        if (landed !== null) failure = new StepFailure('navigation_refused', `the step led the page to ${landed.url}, which Octocrawl does not fetch (${landed.reason}); it is not read`)
      }
      if (failure.code === 'navigation_refused') dropSince(result, artifacts, before)
      trace.push({ at: ctx.at(), lane: 'browser_local', event: 'action', detail: { index, type: action.type, outcome: 'failed', ms: Math.round(performance.now() - started), code: failure.code, error: failure.message } })
      result.failed = { index, type: action.type, code: failure.code, message: failure.message }
      break
    }
  }
  return { result, artifacts, checkedDocuments, lastStepFrom }
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
        await clickControl(ctx, matches.nth(i), action.selector)
      }
      await documentLoaded(ctx)
      await ctx.settle(Math.min(SETTLE_AFTER_STEP_MS, timeLeft(ctx)))
      return { selector: action.selector, matched: count, clicked: targets }
    }
    case 'write':
      await bounded(ctx, page.keyboard.type(action.text))
      return { characters: action.text.length }
    case 'press':
      await bounded(ctx, page.keyboard.press(action.key))
      await documentLoaded(ctx)
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
      result.scrapes.push({ url, html, step: index })
      return { url, characters: html.length }
    }
    case 'executeJavascript': {
      let value: unknown
      try {
        // A function body, as Firecrawl takes it (`return` gives the value), awaited. Evaluated through the
        // DevTools protocol, so the page's Content-Security-Policy does not stop it.
        const expression = `(async () => {\n${action.script}\n})()`
        value = await bounded(ctx, ctx.evaluateScript === undefined ? page.evaluate(expression) : ctx.evaluateScript(expression))
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

/** How long paginate waits for the page Next asked for when the page has not changed yet, and loadMore for a control hidden while it loads. */
const COME_BACK_WAIT_MS = 10_000

/** Time a list round needs beyond its pause: the page's quiet (up to SETTLE_AFTER_STEP_MS) and the measures after it. */
const ROUND_OVERHEAD_MS = SETTLE_AFTER_STEP_MS + 1_500

/** How far apart the two reads of a page's text are, to tell its steady text from what changes by itself (a clock, a ticker). */
const STEADY_TEXT_GAP_MS = 300

/**
 * The page as it stands, read twice STEADY_TEXT_GAP_MS apart so that what
 * changes by itself (a clock, a ticker, a price that moves) does not make a
 * page look new:
 * - `items`, with `itemSelector`: the records it lists, each one the links and
 *   image sources inside it and the words of its text that read the same twice;
 *   null without `itemSelector`;
 * - `state`: the URL with the items, or without `itemSelector` with the
 *   page's steady words and every link and source in it, which says whether
 *   the page is one already read at that URL;
 * - `changing`: whether the two reads differed at all, by a ticking word or
 *   by a page drawn between them (see steadyPageState).
 */
async function pageState(ctx: ActionRunContext, itemSelector: string | undefined): Promise<PageState> {
  await documentLoaded(ctx)
  const read = () => bounded(ctx, ctx.page.evaluate((selector) => {
    // A link or source by its path: a query that changes on every load (a search id, a tracking token) does not make a record new.
    const path = (ref: string) => { try { return new URL(ref, location.href).pathname } catch { return ref } }
    const refs = (root: Element) => [root, ...Array.from(root.querySelectorAll('[href], [src]'))].map((element) => element.getAttribute('href') ?? element.getAttribute('src') ?? '').filter((ref) => ref !== '').map(path)
    return {
      text: document.body?.innerText ?? '',
      refs: document.body === null ? [] : refs(document.body),
      items: selector === null ? null : Array.from(document.querySelectorAll(selector)).map((item) => ({ refs: refs(item).join(' '), text: (item as HTMLElement).innerText })),
    }
  }, itemSelector ?? null))
  const first = await read()
  await abortableSleep(Math.min(STEADY_TEXT_GAP_MS, Math.max(0, timeLeft(ctx))), ctx.execution.signal)
  const second = await read()
  // The HTML is the page as it stands after both reads: what the state below describes, not what was there a moment before.
  const html = await bounded(ctx, ctx.page.content())
  const url = ctx.page.url()
  // Word by word: a row whose price ticks keeps its name.
  const steady = (a: string, b: string) => { const before = new Set(a.split(/\s+/)); return b.split(/\s+/).filter((word) => before.has(word)).join(' ') }
  const hash = (text: string) => createHash('sha256').update(text).digest('hex')
  const changing = JSON.stringify(first) !== JSON.stringify(second)
  if (second.items !== null) {
    const items = hash(second.items.map((item, i) => `${item.refs}\u0001${steady(first.items?.[i]?.text ?? '', item.text)}`).join('\u0000'))
    // The items' links and sources alone: what a changed price or date between two reads of the page leaves as it was.
    const itemRefs = second.items.some((item) => item.refs !== '') ? hash(second.items.map((item) => item.refs).join('\u0000')) : null
    return { html, url, state: `${withoutHash(url)}\u0000${items}`, items, itemRefs, changing }
  }
  const stillThere = new Set(first.refs)
  const page = hash(`${steady(first.text, second.text)}\u0001${second.refs.filter((ref) => stillThere.has(ref)).join(' ')}`)
  return { html, url, state: `${withoutHash(url)}\u0000${page}`, items: null, itemRefs: null, changing }
}

interface PageState { html: string; url: string; state: string; items: string | null; itemRefs: string | null; changing: boolean }

/** How long paginate reads a page that changed while it was read, waiting for two reads in a row that agree. */
const STEADY_READ_WAIT_MS = 3_000

/**
 * The page once it reads the same twice in a row. Two reads that differ are
 * a page that ticks (a clock, a price; its steady words read the same next
 * time) or a page drawn between them (an app swapping its rows in): a read
 * that straddles the swap is half one page and half the next, a list no page
 * ever showed, and is read again. Within STEADY_READ_WAIT_MS and the time a
 * round leaves; past it, the last read stands.
 */
async function steadyPageState(ctx: ActionRunContext, itemSelector: string | undefined): Promise<PageState> {
  let read = await pageState(ctx, itemSelector)
  const until = Date.now() + Math.min(STEADY_READ_WAIT_MS, Math.max(0, timeLeft(ctx) - ROUND_OVERHEAD_MS))
  while (read.changing && Date.now() < until) {
    const again = await pageState(ctx, itemSelector)
    if (again.state === read.state) return again
    read = again
  }
  return read
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

/** Wait for what a round loads: the pause asked for, a document still loading (a Next that navigated), then the page's quiet, within the time left. */
async function afterRound(ctx: ActionRunContext, waitMs: number): Promise<void> {
  const pause = Math.min(waitMs, Math.max(0, timeLeft(ctx)))
  if (pause > 0) await abortableSleep(pause, ctx.execution.signal)
  await documentLoaded(ctx)
  await ctx.settle(Math.min(SETTLE_AFTER_STEP_MS, Math.max(0, timeLeft(ctx))))
}

/**
 * A document the page is still loading, parsed: a step that navigated is
 * read from the page it reached, never from the part of it that had
 * arrived (a slow page read half way has no Next, and a list would seem to
 * end there). Within the time left; past it, the step fails as
 * `deadline_exceeded`.
 */
async function documentLoaded(ctx: ActionRunContext): Promise<void> {
  const left = timeLeft(ctx)
  if (left <= 0) return
  await bounded(ctx, ctx.page.waitForLoadState('domcontentloaded', { timeout: Math.min(MAX_ACTION_WAIT_MS, left) }))
}

/** Whether a whole round (its pause, the page's quiet, the measures) still fits before the time kept back to read the page. */
const roundFits = (ctx: ActionRunContext, waitMs: number): boolean => timeLeft(ctx) > waitMs + ROUND_OVERHEAD_MS

/** How long a wait for something to come back may last: COME_BACK_WAIT_MS, within what a round leaves. */
const comeBackUntil = (ctx: ActionRunContext): number => Date.now() + Math.min(COME_BACK_WAIT_MS, Math.max(0, timeLeft(ctx) - ROUND_OVERHEAD_MS))

/** The deadline reached inside a list step: the list stops there, as `deadline`, with what it has; the step does not fail. */
const isDeadline = (error: unknown): boolean => error instanceof StepFailure && error.code === 'deadline_exceeded'

async function scrollToEnd(action: Extract<PageAction, { type: 'scrollToEnd' }>, ctx: ActionRunContext, index: number): Promise<ListRun> {
  const max = action.maxScrolls ?? LIST_DEFAULTS.maxScrolls
  const waitMs = action.waitMs ?? LIST_WAIT_MS.default
  if (action.selector !== undefined && await bounded(ctx, ctx.page.locator(action.selector).count()) === 0) throw new StepFailure('selector_not_found', `no element matched ${action.selector}`)
  let last = await measure(ctx, action.itemSelector, action.selector)
  let rounds = 0
  let quiet = 0
  let stoppedBy: ListStop
  try {
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
  } catch (error) {
    if (!isDeadline(error)) throw error
    stoppedBy = 'deadline'
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
  try {
    for (;;) {
      // The control gone, hidden or disabled is the list's end. Gone before the first click, it was never there.
      let why = await unusable(ctx, action.selector)
      if (rounds === 0 && why === 'gone') throw new StepFailure('selector_not_found', `no element matched ${action.selector}`)
      // Before the first click, a control the page has not shown or enabled yet (a script that reveals it after load) is
      // waited for, as one hidden while it loads is after a click: within COME_BACK_WAIT_MS.
      if (rounds === 0 && why !== null) {
        const until = comeBackUntil(ctx)
        while (why !== null && why !== 'gone' && Date.now() < until) {
          await abortableSleep(250, ctx.execution.signal)
          why = await unusable(ctx, action.selector)
        }
      }
      if (why !== null) {
        stoppedBy = 'end'
        break
      }
      if (rounds >= max) { stoppedBy = 'max'; break }
      if (!roundFits(ctx, waitMs)) { stoppedBy = 'deadline'; break }
      await clickControl(ctx, ctx.page.locator(action.selector).first(), action.selector)
      rounds++
      await afterRound(ctx, waitMs)
      // Many sites hide or disable the control while the items it asked for load: the round is judged once it is back or the
      // items came, within COME_BACK_WAIT_MS.
      let now = await measure(ctx, action.itemSelector)
      const until = comeBackUntil(ctx)
      while (!grew(last, now) && await unusable(ctx, action.selector) !== null && Date.now() < until) {
        await abortableSleep(250, ctx.execution.signal)
        now = await measure(ctx, action.itemSelector)
      }
      quiet = grew(last, now) ? 0 : quiet + 1
      last = now
      if (quiet >= QUIET_ROUNDS_TO_END) { stoppedBy = 'no_growth'; break }
    }
  } catch (error) {
    if (!isDeadline(error)) throw error
    stoppedBy = 'deadline'
  }
  return { index, type: 'loadMore', stoppedBy, rounds, items: last.items }
}

async function paginate(action: Extract<PageAction, { type: 'paginate' }>, ctx: ActionRunContext, index: number, result: ActionsResult, guard: () => Promise<void>): Promise<ListRun> {
  const max = action.maxPages ?? LIST_DEFAULTS.maxPages
  const waitMs = action.waitMs ?? LIST_WAIT_MS.default
  const seenStates = new Set<string>()
  const seenItems = new Set<string>()
  let lastState: string | null = null
  let lastListed: string | null = null
  let loadsAtClick = ctx.loadedDocuments().length
  let alreadyRead = 0
  let pages = 0
  let itemsRead: number | null = action.itemSelector === undefined ? null : 0
  let items: number | null = null
  let stoppedBy: ListStop
  let challenge: ListChallenge | undefined
  // The pages an earlier run of this step read before it was cut (ExecutionContext.listResume): counted as read from the
  // start. The site's own Next links are the only way to the page after them, so they are passed over on the way: a page
  // the checkpoint holds and has not shown again yet is known by its state, its items, their links alone (a price that
  // changed meanwhile), or its own address when the pages have addresses of their own (two or more, all distinct). Any
  // other page goes through every check a new page does, so a list still ends the way it did; a kept page known by none
  // of those keys (rows without links whose text changed) is read again, and the limit then counts it twice.
  const resumed = (ctx.execution.listResume?.pages ?? []).filter((read) => read.step === index).sort((a, b) => a.page - b.page)
  const resumedUrls = new Set(resumed.map((read) => withoutHash(read.url)))
  const addressed = resumed.length >= 2 && resumedUrls.size === resumed.length
  const shownAgain = resumed.map(() => false)
  let replayed = 0
  let fresh = 0
  for (const read of resumed) {
    result.scrapes.push({ url: read.url, html: read.html, step: index })
    pages++
    if (itemsRead !== null) itemsRead = read.count === null ? itemsRead : itemsRead + read.count
  }
  if (resumed.length > 0) ctx.trace.push({ at: ctx.at(), lane: 'browser_local', event: 'list_resumed', detail: { step: index, pages: resumed.length, from: resumed[resumed.length - 1]!.url, addressed } })
  // Items' links tell kept pages apart only where they differ between them: rows that all link to the same place (a shared
  // "details" link, an icon) say nothing about which page they are on.
  const refsCounts = new Map<string, number>()
  for (const page of resumed) if (page.itemRefs !== null) refsCounts.set(page.itemRefs, (refsCounts.get(page.itemRefs) ?? 0) + 1)
  const knownBy = { content: 0, links: 0, address: 0 }
  const kept = (read: PageState): number => {
    const left = (match: (page: ListPageRead) => boolean) => resumed.findIndex((page, i) => !shownAgain[i] && match(page))
    let hit = left((page) => read.state === page.state || (read.items !== null && read.items === page.items))
    if (hit !== -1) { knownBy.content++; return hit }
    if (read.itemRefs !== null && refsCounts.get(read.itemRefs) === 1) hit = left((page) => page.itemRefs === read.itemRefs)
    if (hit !== -1) { knownBy.links++; return hit }
    if (addressed) hit = left((page) => withoutHash(page.url) === withoutHash(read.url))
    if (hit !== -1) knownBy.address++
    return hit
  }
  const tell = (read: { url: string; html: string; state: string; items: string | null; itemRefs: string | null; count: number | null }) => {
    try { ctx.execution.onListPage?.({ step: index, page: pages, ...read }) } catch { /* a listener's error never changes the fetch */ }
  }
  try {
    for (;;) {
      let read = await steadyPageState(ctx, action.itemSelector)
      let { html, url, state, items: listed } = read
      // Next clicked and the page unchanged, or showing the records it showed before under a URL changed within the page (an app
      // that changes the URL first and loads its rows after, keeping the old ones meanwhile): its page may be on the way, and gets
      // COME_BACK_WAIT_MS. A new document with the same records (a first page under two URLs) has arrived, and is not waited for.
      const unchanged = () => state === lastState || (listed !== null && listed === lastListed && ctx.loadedDocuments().length === loadsAtClick)
      if (unchanged()) {
        const until = comeBackUntil(ctx)
        while (unchanged() && Date.now() < until) {
          await abortableSleep(250, ctx.execution.signal)
          read = await steadyPageState(ctx, action.itemSelector)
          ;({ html, url, state, items: listed } = read)
        }
      }
      lastState = state
      lastListed = listed
      // A check the site put up where the next page should be, by its decisive marks alone (a Cloudflare interstitial, a
      // PerimeterX press-and-hold, Amazon's or Reddit's verification form): the step stops here without reading it, the pages
      // before it keep their records, and the result is blocked with the check's reason. A page of nothing but a CAPTCHA
      // widget is told from a page with little on it only by the extractor, after the steps: the lane's own verdict then marks
      // the step as stopped at it (withActions). A page with records on it is a page, whatever widget it also carries.
      const onPage = action.itemSelector === undefined ? null : await bounded(ctx, ctx.page.locator(action.itemSelector).count())
      const gate = classifyGate({ status: 200, header: () => null, body: html, contentful: true })
      if (gate !== null) {
        challenge = { page: pages + 1, url, reason: gate.reason, signals: gate.signals }
        ctx.trace.push({ at: ctx.at(), lane: 'browser_local', event: 'list_challenge', detail: { step: index, page: pages + 1, url, reason: gate.reason, signals: [...gate.signals] } })
        stoppedBy = 'challenge'
        break
      }
      // A page the checkpoint holds, shown again on the way to the pages after it: passed over, not read again.
      const held = kept(read)
      if (held !== -1) {
        shownAgain[held] = true
        replayed++
        alreadyRead = 0
        seenStates.add(state)
        if (listed !== null) seenItems.add(listed)
        items = onPage
      } else {
      // The same URL showing what it showed before: Next led back or did nothing, and the list is over.
      if (seenStates.has(state)) { stoppedBy = 'repeat'; break }
      seenStates.add(state)
      if (listed !== null && seenItems.has(listed)) {
        // With itemSelector, the same records under another URL: a site's first page at both /list and /list?page=1 is not
        // read twice, and its Next is followed on. Twice in a row (a site that answers every page past the last with the last
        // one) is the list's end. Without itemSelector nothing tells records apart, and no page is skipped.
        if (++alreadyRead >= 2) { stoppedBy = 'repeat'; break }
      } else {
        alreadyRead = 0
        if (listed !== null) seenItems.add(listed)
        result.scrapes.push({ url, html, step: index })
        pages++
        if (onPage !== null) {
          items = onPage
          itemsRead = (itemsRead ?? 0) + onPage
        }
        fresh++
        // A page with no record on it is not kept for a resume: nothing on it is lost by reading it again, and it may be the
        // check the lane's verdict names.
        if (onPage !== 0) tell({ url, html, state, items: listed, itemRefs: read.itemRefs, count: action.itemSelector === undefined ? null : items })
      }
      }
      // The limit counts the checkpoint's pages; while they are being passed over the browser is not yet on the last of them,
      // so the step stops at it once they are all shown again, or at the first page read anew.
      if (pages >= max && (replayed >= resumed.length || fresh > 0)) { stoppedBy = 'max'; break }
      if (await unusable(ctx, action.nextSelector) !== null) { stoppedBy = 'end'; break }
      if (!roundFits(ctx, waitMs)) { stoppedBy = 'deadline'; break }
      loadsAtClick = ctx.loadedDocuments().length
      await clickControl(ctx, ctx.page.locator(action.nextSelector).first(), action.nextSelector)
      await afterRound(ctx, waitMs)
      // The next page goes through the same checks as any page a step reaches, before it is read.
      await guard()
    }
  } catch (error) {
    if (!isDeadline(error)) throw error
    stoppedBy = 'deadline'
  }
  if (resumed.length > 0) {
    const event = ctx.trace.find((item) => item.event === 'list_resumed' && item.detail?.step === index)
    if (event?.detail !== undefined) { event.detail.replayed = replayed; event.detail.knownBy = knownBy }
  }
  return { index, type: 'paginate', stoppedBy, rounds: pages, items, itemsRead, ...(resumed.length === 0 ? {} : { resumed: resumed.length }), ...(challenge === undefined ? {} : { challenge }) }
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

/** How long a click waits on a control something else covers (a modal, a consent banner) before the step gives it up. */
const COVERED_GIVE_UP_MS = 5_000

/**
 * A click on the control, within the step's own time (stepTimeout, taken
 * once: at most MAX_ACTION_WAIT_MS, as a click always had). Its checks come
 * first, alone (Playwright's trial: the control's own handlers get no click;
 * a listener the page puts on window ahead of them can still see the trial's
 * mouse events), in tries of at most COVERED_GIVE_UP_MS. A try that saw the
 * control covered at every check, after one that ended covered, fails the
 * step at once, naming what covers it: covered for a whole try, the control
 * is not waited for through the rest of the step's time. Any other timed-out
 * try (not shown yet, still moving, a cover that came late in it) is tried
 * again. Then the click itself, once, with the time left: it waits for a
 * navigation it starts (a slow next page), as a click always did, and is
 * never sent twice.
 */
async function clickControl(ctx: ActionRunContext, control: Locator, selector: string): Promise<void> {
  const started = Date.now()
  const until = started + stepTimeout(ctx)
  let endedCovered = false
  while (until - Date.now() > COVERED_GIVE_UP_MS) {
    try {
      await raceWithSignal(control.click({ trial: true, timeout: COVERED_GIVE_UP_MS }), ctx.execution.signal)
      break
    } catch (error) {
      // A stopped fetch stops here, whatever its reason (a batch's spent budget is a TimeoutError too): never tried again.
      if (ctx.execution.signal?.aborted === true || !isTimeout(error)) throw error
      const cover = coverOf(error)
      if (endedCovered && cover.whole !== null) throw new StepFailure('action_error', `the click on ${selector} could not reach it: ${cover.whole} (covered for ${COVERED_GIVE_UP_MS / 1000} s and more)`)
      endedCovered = cover.last !== null
    }
  }
  try {
    await raceWithSignal(control.click({ timeout: Math.max(1, Math.min(stepTimeout(ctx), until - Date.now())) }), ctx.execution.signal)
  } catch (error) {
    if (ctx.execution.signal?.aborted === true || !isTimeout(error)) throw error
    // The last try's own timeout is a part of the wait: the step says how long the click was waited for in all.
    throw new StepFailure(deadlinePassed(ctx) ? 'deadline_exceeded' : 'action_error', `the click on ${selector} did not land within ${Math.round((Date.now() - started) / 1000)} s: ${message(error)}`)
  }
}

/** A Playwright error's call log, line by line, without the colour codes a terminal that takes colour gets, nor the list marks. */
function callLog(error: unknown): string[] {
  const text = error instanceof Error ? error.message : String(error)
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[[0-9;]*m/g, '').split('\n').map((line) => line.trim().replace(/^- /, ''))
}

/**
 * What covered the control in a trial click that timed out, from Playwright's
 * call log: `last`, what covered it at its last check (null when that check
 * found anything else, or there was none); `whole`, the same when no check of
 * the try found it hidden, disabled or out of view. A check that found it
 * moving ("not stable", as when a page scrolls smoothly to it) does not make a
 * try less covered, but a try that ends on one did not end covered.
 */
export function coverOf(error: unknown): { last: string | null; whole: string | null } {
  const outcomes = callLog(error).filter((line) => /intercepts pointer events$|^element is not (visible|enabled|stable)|^element is outside of the viewport/.test(line))
  const covered = (line: string | undefined) => line !== undefined && line.endsWith('intercepts pointer events')
  const last = covered(outcomes.at(-1)) ? outcomes.at(-1)!.slice(0, 300) : null
  return { last, whole: last !== null && outcomes.every((line) => covered(line) || line === 'element is not stable') ? last : null }
}

function message(error: unknown): string {
  // Playwright appends a call log; the first line says what happened, and a click that never landed says why: what covers
  // the control (a modal, a banner), its last report of it.
  const lines = callLog(error)
  const covered = lines.filter((line) => line.endsWith('intercepts pointer events')).at(-1)
  return `${lines[0]!.slice(0, 300)}${covered === undefined ? '' : ` (${covered.slice(0, 300)})`}`
}

function withoutHash(url: string): string {
  const at = url.indexOf('#')
  return at === -1 ? url : url.slice(0, at)
}
