/**
 * The request's `actions`, run on the local browser's page after load,
 * stability and `waitFor`, and before the screenshot format and the DOM are
 * read, one at a time in the order given. Every step leaves an `action`
 * trace event with its index, type, outcome and time. A step that fails
 * stops the pipeline: `failed` names it, and the page stays as it stood
 * (unless the step led it somewhere W2L does not fetch, which is cleared).
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
  /** Why W2L would not fetch this URL (robots.txt, the egress policy), or null when it would. */
  refuseNavigation: (url: string) => Promise<string | null>
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
    try {
      const detail = await runStep(action, ctx, result, artifacts)
      // A step that moved the page goes through the checks every fetch does.
      const now = withoutHash(page.url())
      const moved = now !== checkedUrl
      if (moved) {
        const refusal = await ctx.refuseNavigation(now)
        if (refusal !== null) {
          // The page W2L does not fetch is not read: the page is cleared.
          await page.goto('about:blank').catch(() => {})
          throw new StepFailure('navigation_refused', `the step led to ${now}, which W2L does not fetch: ${refusal}`)
        }
        checkedUrl = now
      }
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
      const count = await raceWithSignal(matches.count(), signal)
      if (count === 0) throw new StepFailure('selector_not_found', `no element matched ${action.selector}`)
      const targets = action.all === true ? count : 1
      for (let i = 0; i < targets; i++) {
        await raceWithSignal(matches.nth(i).click({ timeout: stepTimeout(ctx) }), signal)
      }
      await ctx.settle(Math.min(SETTLE_AFTER_STEP_MS, timeLeft(ctx)))
      return { selector: action.selector, matched: count, clicked: targets }
    }
    case 'write':
      await raceWithSignal(page.keyboard.type(action.text), signal)
      return { characters: action.text.length }
    case 'press':
      await raceWithSignal(page.keyboard.press(action.key), signal)
      await ctx.settle(Math.min(SETTLE_AFTER_STEP_MS, timeLeft(ctx)))
      return { key: action.key }
    case 'scroll': {
      const sign = action.direction === 'down' ? 1 : -1
      if (action.selector !== undefined) {
        const target = page.locator(action.selector).first()
        if (await raceWithSignal(page.locator(action.selector).count(), signal) === 0) throw new StepFailure('selector_not_found', `no element matched ${action.selector}`)
        await raceWithSignal(target.evaluate((element, s) => { element.scrollBy(0, s * element.clientHeight) }, sign), signal)
      } else {
        await raceWithSignal(page.evaluate((s) => { window.scrollBy(0, s * window.innerHeight) }, sign), signal)
      }
      await ctx.settle(Math.min(SETTLE_AFTER_STEP_MS, timeLeft(ctx)))
      return { direction: action.direction, ...(action.selector === undefined ? {} : { selector: action.selector }), scrollY: await page.evaluate(() => Math.round(window.scrollY)) }
    }
    case 'screenshot': {
      const viewport = action.viewport ?? ctx.viewport
      if (action.viewport !== undefined) await page.setViewportSize(action.viewport)
      try {
        const capture = await captureScreenshot(page, action, viewport, ctx.deviceScaleFactor, execution, ctx.trace, ctx.at)
        if (capture.screenshot === null) throw new StepFailure('action_error', capture.warning?.message ?? 'the screenshot could not be captured')
        result.screenshots.push(capture.screenshot)
        artifacts.push(...capture.artifacts)
        return { sha256: capture.screenshot.sha256, bytes: capture.screenshot.bytes }
      } finally {
        if (action.viewport !== undefined) await page.setViewportSize(ctx.viewport).catch(() => {})
      }
    }
    case 'scrape': {
      const html = await raceWithSignal(page.content(), signal)
      const url = page.url()
      result.scrapes.push({ url, html })
      return { url, characters: html.length }
    }
    case 'executeJavascript': {
      let value: unknown
      try {
        // A function body, as Firecrawl takes it (`return` gives the value), awaited. Evaluated through the
        // DevTools protocol, so the page's Content-Security-Policy does not stop it.
        value = await raceWithSignal(page.evaluate(`(async () => {\n${action.script}\n})()`), signal)
      } catch (error) {
        if (signal?.aborted) throw error
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
      const buffer = await raceWithSignal(page.pdf({ format, landscape, scale, printBackground: true }), signal)
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
