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
  MAX_ACTION_WAIT_MS,
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
  /** Documents the main frame has loaded so far; a URL changed within the page (pushState) loads none. */
  documentLoads: () => number
}

export interface ActionRun {
  result: ActionsResult
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
  const result: ActionsResult = { screenshots: [], scrapes: [], javascriptReturns: [], pdfs: [] }
  const artifacts: string[] = []
  let checkedUrl = withoutHash(page.url())
  for (const [index, action] of actions.entries()) {
    throwIfExecutionStopped(execution)
    const started = performance.now()
    const loads = ctx.documentLoads()
    const before = { screenshots: result.screenshots.length, scrapes: result.scrapes.length, javascriptReturns: result.javascriptReturns.length, pdfs: result.pdfs.length, artifacts: artifacts.length }
    try {
      const detail = await runStep(action, ctx, result, artifacts)
      // A navigation the step started that the guard stopped: the request never went out, and the page stayed.
      const refused = ctx.takeRefusedNavigation()
      if (refused !== null) throw new StepFailure('navigation_refused', `the step led the page to ${refused.url}, which W2L does not fetch (${refused.reason}); the page stayed where it was`)
      const now = withoutHash(page.url())
      const moved = now !== checkedUrl
      if (moved && ctx.documentLoads() !== loads) {
        // A redirect after the navigation the guard let through: the page is somewhere W2L does not fetch, and what the step read of it is dropped.
        const landed = await ctx.refuseLanded(now)
        if (landed !== null) {
          result.screenshots.length = before.screenshots
          result.scrapes.length = before.scrapes
          result.javascriptReturns.length = before.javascriptReturns
          result.pdfs.length = before.pdfs
          artifacts.length = before.artifacts
          throw new StepFailure('navigation_refused', `the step left the page at ${now}, which W2L does not fetch (${landed}); it is not read`)
        }
      }
      checkedUrl = now
      trace.push({ at: ctx.at(), lane: 'browser_local', event: 'action', detail: { index, type: action.type, outcome: 'ok', ms: Math.round(performance.now() - started), ...detail, ...(moved ? { navigatedTo: now } : {}) } })
    } catch (error) {
      if (execution.signal?.aborted) throw error
      const failure = error instanceof StepFailure ? error : new StepFailure(deadlinePassed(ctx) ? 'deadline_exceeded' : 'action_error', message(error))
      trace.push({ at: ctx.at(), lane: 'browser_local', event: 'action', detail: { index, type: action.type, outcome: 'failed', ms: Math.round(performance.now() - started), code: failure.code, error: failure.message } })
      result.failed = { index, type: action.type, code: failure.code, message: failure.message }
      break
    }
  }
  return { result, artifacts }
}

async function runStep(action: PageAction, ctx: ActionRunContext, result: ActionsResult, artifacts: string[]): Promise<Record<string, unknown>> {
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
  }
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
