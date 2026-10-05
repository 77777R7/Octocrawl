import type { AppliedRobotsOverride } from './compliance.js'
import type { FetchWarning, TraceEvent } from './result.js'
import type { AttributeSelector, ListFormatRequest, ScreenshotOptions } from './structured.js'
import type { PageAction } from './actions.js'

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
   * How a PDF response is read (Firecrawl's `parsers`): absent reads every
   * PDF's text layer with W2L's defaults; `[]` reads none (the file is saved
   * as received, without text); one `pdf` entry sets the options. Other
   * files are unaffected.
   */
  parsers?: readonly PdfParser[]
  /**
   * A decision to fetch this one URL although its host's robots.txt
   * disallows it or could not be read. robots.txt is still read and its
   * verdict recorded, Crawl-delay included; the override goes into the
   * trace, the warnings and, in the browser lane, the compliance record. The
   * HTTP and local browser lanes apply it; the provider lane takes none.
   * Set by the engine: a scrape's `robotsOverride` or a batch's
   * `robotsOverrides` entry, else, on a local server, `user_named_url` for
   * every URL a scrape or batch names and `ignore_robots_txt` for a crawl's
   * pages when the crawl asked. A navigation a page's steps make to another
   * URL is checked against robots.txt whatever this says.
   */
  robotsOverride?: AppliedRobotsOverride
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
  /**
   * Carry `images` on a contentful result: every image URL of the whole
   * document as received (the rendered DOM on a browser lane). Set from the
   * requested formats (`images`), not by a caller.
   */
  includeImages?: boolean
  /**
   * Carry `tables` on a contentful result: every data table of the content
   * the Markdown was written from, as data and CSV. Set from the requested
   * formats (`tables`), not by a caller.
   */
  includeTables?: boolean
  /**
   * Carry `attributes` on a contentful result: for each selector, the named
   * attribute's values on the elements it matches in the document as
   * received. Set from the requested formats (an `attributes` entry), not
   * by a caller; the API has checked the selectors (`invalidSelector`).
   */
  attributes?: readonly AttributeSelector[]
  /** The `list` format's request, set from the requested formats, not by a caller; the API has checked its selectors. */
  list?: ListFormatRequest
  /**
   * Whether an `<img>` whose `src` is a `data:` URI is left out of the
   * Markdown, its alt text kept (Firecrawl's `removeBase64Images`). Default
   * true, which every lane always did; false keeps the image as
   * `![alt](data:…)`, which the token count then counts. `html` and
   * `rawHtml` are never rewritten. A rendering choice, not a fetch fact: no
   * trace event or warning.
   */
  removeBase64Images?: boolean
  /**
   * Capture the rendered page as an image (the `screenshot` format): a PNG,
   * or a JPEG at `quality`, of the viewport (the request's `viewport` within
   * the declared screen, else the declared one) or of the document's whole
   * height (`fullPage`, without scrolling first), taken after load,
   * stability and `waitFor` and before the DOM is read, CSS-pixel sized. The
   * local browser lane alone honours it, and the API selects that lane alone
   * for such a request; the http and provider lanes ignore it. Set from the
   * requested formats (a `screenshot` entry), not by a caller.
   */
  screenshot?: ScreenshotOptions
  /**
   * Steps the local browser runs on the page after load, stability and
   * `waitFor`, and before the screenshot format and the DOM are read
   * (`actions`). The local browser lanes alone run them; the API selects
   * those lanes alone for such a request.
   */
  actions?: readonly PageAction[]
}

/** The largest `maxPages` a pdf parser entry may ask for. */
export const MAX_PDF_PAGES = 10_000

/**
 * The `pdf` entry of `parsers`. W2L reads a PDF's text layer and runs no
 * OCR, so `mode` is `fast` or `auto`, both that reader (`ocr` is refused).
 */
export interface PdfParser {
  type: 'pdf'
  mode?: 'fast' | 'auto'
  /** Read at most this many pages, from the first (1 to MAX_PDF_PAGES); default 1000. A document cut by it is `success` with a `page_cap` warning: the cut was asked for. */
  maxPages?: number
  /** Also return each page's Markdown as `pages: [{ pageNumber, markdown }]`. Default false. */
  pages?: boolean
  /** A `<!-- page N -->` line before each page's text. Default true natively, false on `/fc` as on Firecrawl. */
  pageMarkers?: boolean
}
