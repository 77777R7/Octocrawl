import type { RobotsOverride } from './compliance.js'
import type { FetchWarning, TraceEvent } from './result.js'

/** In-process cancellation and an absolute UTC deadline. Never serialize signal. */
export interface ExecutionContext {
  signal?: AbortSignal
  deadlineAt?: number
  /** Persist publisher cooldown immediately, before an interruptible inline wait. */
  onRetryAfter?: (url: string, retryAt: number) => void
  /**
   * Hear of a recorded robots override the moment a lane applies it, before
   * its request goes out: the ladder keeps the override on the run's answer
   * when that lane never returns (a deadline) or another rung's result answers.
   */
  onRobotsOverride?: (applied: RobotsOverrideApplied) => void
}

/** What a lane reports when it sets a robots.txt rule aside under a recorded override. */
export interface RobotsOverrideApplied {
  /** The lane's `robots_checked`, `robots_disallowed` and `robots_overridden` trace events, in that order. */
  trace: readonly TraceEvent[]
  /** The `robots_overridden` warning the lane's own result carries. */
  warning: FetchWarning
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
   * compliance record. An unreachable robots.txt is not set aside. The HTTP
   * and local browser lanes apply it; the provider lane takes none.
   * Set per URL by the caller (a scrape's `robotsOverride`, a batch's
   * `robotsOverrides` entry), never by a batch or crawl for every page.
   */
  robotsOverride?: RobotsOverride
  /**
   * CSS selectors naming the only elements to keep. The content is those
   * elements, in document order, copied from the page before anything is
   * cleaned away, so a named navigation stays; `onlyMainContent` no longer
   * chooses the content. Nothing matching is an empty answer. The page's
   * type, title and metadata are still read from the whole page. The API
   * refuses a selector the extractor does not match (@w2l/extract-tf
   * `invalidSelector`) and a list of more parts than it matches for one
   * list (`MAX_SELECTOR_PARTS`); a lane given either reads it as naming
   * nothing.
   */
  includeTags?: readonly string[]
  /**
   * CSS selectors removed, with everything inside them, before the content
   * is taken: from the main content, from the whole page
   * (`onlyMainContent: false`) and from an `includeTags` selection alike.
   * The same selectors as `includeTags`.
   */
  excludeTags?: readonly string[]
  /**
   * Extra request headers, lower-cased names, validated by the API
   * (`readHeaders`): never the User-Agent, a client hint, a credential or a
   * transport header. The HTTP and local browser lanes send them with the
   * requested URL and its same-origin hops and subresources, after the
   * declared identity, and record them (`request_headers_added`). Both lanes
   * fetch a redirect hop to another origin with the identity alone and say so
   * (`custom_headers_withheld`); on the browser lane the headers are added per
   * request through Chromium's request interception, which judges every hop
   * and every file the page loads by its own origin, so a navigation the page
   * makes to another origin gets none either. robots.txt is fetched with the
   * identity alone. Everything here is on the record.
   */
  headers?: Readonly<Record<string, string>>
  /**
   * Fetch as the declared mobile Chrome identity (Android User-Agent, mobile
   * client hints, 412x915 viewport, touch) instead of the desktop one. A
   * second declared identity, not a disguise: it passes the same coherence
   * and honesty checks, and robots.txt is evaluated against its User-Agent.
   * Default false. Refused with research mode, which declares a bot.
   */
  mobile?: boolean
  /**
   * Local only: load a site whose certificate does not verify (self-signed,
   * expired, wrong name). The lanes relax verification for this one fetch
   * and its robots.txt lookup, say so in the trace
   * (`tls_verification_skipped`) and in a `tls_unverified` warning. Default
   * false: a certificate failure is `failed` / `tls_error`. A hosted engine
   * refuses the option.
   */
  skipTlsVerification?: boolean
  /**
   * Abort requests to a bundled list of ad-serving hosts on the local
   * browser lane (`ads_blocked`), and remove ad and cookie-banner elements
   * before extraction on every lane. Default true; false keeps them in the
   * Markdown and `html`. The hosted browser's host allowlist stays in force
   * whatever this says.
   */
  blockAds?: boolean
  /**
   * Carry `html` on a contentful result: the cleaned HTML its Markdown was
   * written from. Set from the requested formats (`html`), not by a caller.
   */
  includeHtml?: boolean
  /**
   * Carry `rawHtml` on a contentful result: the page as the lane received
   * it. Set from the requested formats (`rawHtml`), not by a caller.
   */
  includeRawHtml?: boolean
}
