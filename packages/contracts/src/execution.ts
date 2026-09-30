import type { RobotsOverride } from './compliance.js'

/** In-process cancellation and an absolute UTC deadline. Never serialize signal. */
/** Per-request page handling, carried with the budget so every lane sees it. */
export interface PageOptions {
  /**
   * Return only the main content region (the default). False returns the
   * cleaned page body, navigation and footer included, the way a reader
   * saves a whole page.
   */
  onlyMainContent?: boolean
  /** Extra wait on the browser lane after the page settled, before the DOM is read. */
  waitForMs?: number
  /**
   * A recorded decision to fetch this one URL although its host's robots.txt
   * disallows it. robots.txt is still read and its verdict recorded; the
   * override goes into the trace, the warnings and the compliance record.
   */
  robotsOverride?: RobotsOverride
}

export interface ExecutionContext {
  signal?: AbortSignal
  deadlineAt?: number
  /** Persist publisher cooldown immediately, before an interruptible inline wait. */
  onRetryAfter?: (url: string, retryAt: number) => void
  page?: PageOptions
}
