import type { RobotsOverride } from './compliance.js'

/** In-process cancellation and an absolute UTC deadline. Never serialize signal. */
export interface ExecutionContext {
  signal?: AbortSignal
  deadlineAt?: number
  /** Persist publisher cooldown immediately, before an interruptible inline wait. */
  onRetryAfter?: (url: string, retryAt: number) => void
}

/**
 * What the caller asked a lane to capture from one page. It changes the
 * content a lane emits, never the Evidence (hashes, status rules).
 */
export interface FetchOptions {
  /** false: Markdown of the whole page body, header, navigation and footer kept. Default true. */
  onlyMainContent?: boolean
  /** Milliseconds a browser rung waits after load and stability before capture. Default 0. */
  waitFor?: number
  /**
   * The caller's own `timeout`, when it set one. The deadline itself is the
   * ExecutionContext's; this says the caller chose it, so a lane waits for a
   * slow server (HTTP headers and body, browser navigation) until that
   * deadline instead of stopping at its default caps.
   */
  timeout?: number
  /**
   * Bytes a file (PDF, CSV, XLSX, ZIP, JSON, text) may have, below the
   * operator's cap (`NetworkPolicy.maxFileBytes`); a larger file is failed
   * with `body_too_large` and not saved. Web pages keep `maxBodyBytes`.
   */
  maxFileBytes?: number
  /**
   * A recorded decision to fetch this one URL although its host's robots.txt
   * disallows it. robots.txt is still read and its verdict recorded; the
   * override goes into the trace, the warnings and, in the browser lane, the
   * compliance record. An unreachable robots.txt is not set aside.
   * Set per URL by the caller (a scrape's `robotsOverride`, a batch's
   * `robotsOverrides` entry), never by a batch or crawl for every page.
   */
  robotsOverride?: RobotsOverride
}
