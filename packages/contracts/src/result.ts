import type { BlockReason, BudgetKind, FailureReason, Lane, ResultStatus } from './status.js'
import type { ComplianceRecord } from './compliance.js'
import type { DocumentExtraction, PageMetadata } from './extractor.js'
import type { StructuredExtractionResult } from './structured.js'
import type { FileDescription } from './file.js'

export interface ResourceTimings {
  /** Every wait in the origin scheduler but a cooldown: the concurrency ceiling and the minimum interval between requests. */
  queueMs?: number
  robotsMs?: number
  cooldownWaitMs?: number
  /**
   * Present when the per-origin concurrency ceiling held this lane's permit
   * back: the milliseconds it waited for a slot, cooldown and pacing
   * excluded (both stay in `cooldownWaitMs` / `queueMs`). Absent when the
   * permit started at once, or when the lane acquired none.
   */
  concurrencyWaitMs?: number
  retryWaitMs?: number
  /** Initial request/headers time, excluding body read and retry sleep. */
  requestMs?: number
  bodyReadMs?: number
  /** Total network work excluding retry sleep. */
  transportMs?: number
  parseMs?: number
  extractMs?: number
  formatMs?: number
  serializeMs?: number
  modelMs?: number
  totalMs: number
}

/** Why the runtime moved from one lane to the next. Logged for the escalation corpus. */
export interface Escalation {
  from: Lane
  to: Lane
  /** Machine-readable trigger, e.g. 'low_text_yield' | 'spa_marker' | 'blocked' */
  trigger: string
  /** Whether the escalation actually improved the outcome. Null until known. */
  improved: boolean | null
}

export interface ResourceUsage {
  wallMs: number
  /** Bytes received on the wire (compressed). */
  bytesWire: number | null
  /** Bytes after decompression. Guarded by a decompressed-size cap. */
  bytesDecompressed: number
  requestCount: number
  attemptCount: number
  /** Actual status-driven retries; not variant-selection navigations. */
  statusRetryCount?: number
  navigationFollowupCount?: number
  /** Token count of the emitted main content. Null if not tokenized. */
  contentTokens: number | null
  browserMs: number
  /**
   * Cost incurred outside this process, paid by the user to a third party
   * (BYO proxy egress, provider browser minutes, model calls).
   * `null` means no external cost path was used — never means "free".
   */
  externalCostUsd: number | null
  /** Stage timings use a monotonic clock. Optional for legacy producers. */
  timings?: ResourceTimings
  /**
   * True when the caller's deadline (a scrape's `timeout`) ended this fetch
   * before it finished: the result is then `partial` with the content
   * fetched so far, or `failed` with `timeout`. Absent otherwise.
   */
  deadlineExceeded?: boolean
}

export interface Meter {
  knownSubtotal: number
  unknown: boolean
}

export interface Evidence {
  /**
   * Final URL after redirects: the last URL requested for the page, whose
   * response `httpStatus` and `contentType` are from. In the browser lane a
   * script or a meta refresh that loaded another document is a redirect; a
   * URL the page set with the history API (pushState, replaceState), which
   * nothing requested, is not: the page keeps it as the base of its links.
   */
  finalUrl: string
  /**
   * The status of the response that answered `finalUrl`: in the browser lane,
   * of the document the page shows when it is read, not of the navigation W2L
   * started. Null when there was none (no request, a transport failure, a
   * document that came without a response).
   */
  httpStatus: number | null
  /**
   * The URLs of a redirect, the requested URL first and `finalUrl` last;
   * empty when nothing redirected.
   */
  redirectChain: readonly string[]
  /**
   * True when `redirectChain` lists every hop the lane requested: the HTTP
   * lane follows each redirect itself, and the browser lane lists each
   * redirect Chromium followed and each document a script or a meta refresh
   * loaded, for a page it shows or a file it displays or downloads. The
   * browser lane says false when a follow-up navigation did not start at the
   * requested URL, a document came without a request, or it cut the chain of
   * a page that kept moving on to its first URL and last 20. Absent when the
   * lane does not say (the provider lane, which sees where its vendor started
   * and ended, and results stored before lanes recorded it).
   */
  redirectChainComplete?: boolean
  /**
   * The `content-type` header of the response `httpStatus` is from, as the
   * server sent it, in every lane (the browser lane reads the rendered page,
   * whatever it says); null when there was no response or no such header.
   */
  contentType: string | null
  /** sha256 of the raw response body. Null only when no body was read. */
  rawBodySha256: string | null
  /** Relative artifact paths (raw body, screenshot, DOM snapshot). */
  artifacts: readonly string[]
  /**
   * UTC ISO time the lane received what it reports: the final response's
   * headers (HTTP), the vendor's answer (provider), the rendered page's
   * capture (browser). Absent when no response was read, and on results
   * stored before lanes recorded it.
   */
  fetchedAt?: string
  /** HTTP validators observed for the representation, when exposed. */
  etag?: string | null
  lastModified?: string | null
  cacheControl?: string | null
  vary?: string | null
  /** A response setting cookies cannot enter the public monitor cache. */
  setsCookie?: boolean
  /**
   * `host:port` of the operator's environment proxy (local mode) that the
   * request for `finalUrl` went through; never its credentials. Null when that
   * request did not use it (NO_PROXY, loopback). Absent when no environment
   * proxy was configured, no request was answered, or the lane does not
   * report its route (the provider lane).
   */
  envProxy?: string | null
}

export interface TraceEvent {
  at: number
  lane: Lane
  event: string
  detail?: Record<string, unknown>
}

export interface LadderAttempt {
  channel: string
  result: FetchResult
}

export interface LadderExecutionSummary {
  channelsTried: readonly string[]
  attempts: readonly LadderAttempt[]
  wallMs: number
  browserMs: number
  bytesWire: number | null
  bytesDecompressed: number
  requestCount: number
  attemptCount: number
  contentTokens: number | null
  externalCostUsd: number | null
  externalCost: Meter
  contentTokenMeter: Meter
  artifacts: readonly string[]
  /** Actual caller wait across all ladder work, including routing overhead. */
  totalMs?: number
}

export interface LadderRunAudit {
  channelsTried: readonly string[]
  ladderTrace: readonly { at: number; event: string; channel: string; detail: Record<string, unknown> }[]
  summary: LadderExecutionSummary
}

/**
 * A request for human takeover: the lane hit a captcha or login wall it will
 * not defeat, a live-view door exists, and the task pauses here until a
 * human returns (or the run aborts). Carrying this on the result instead of
 * throwing keeps the decision trail in the signed record: the run did not
 * silently skip the page, it stopped and asked.
 */
export interface HandoffRequest {
  /** The seven-class routing reason, e.g. 'captcha_required'. */
  reason: string
  /** Live view URL for the human, when one was opened. */
  liveViewUrl: string | null
  /** Why this specific result asks for a human, one sentence. */
  rationale: string
}

/** The values of one HTML attribute on the elements one CSS selector names (the `attributes` format). */
export interface AttributeExtraction {
  selector: string
  attribute: string
  /** As written in the HTML, in document order; an element without the attribute is skipped; `[]` when nothing matches. */
  values: readonly string[]
}

/**
 * The `screenshot` format: the rendered page as the browser lane captured it
 * after load, stability and `waitFor`, before the DOM was read, so the image
 * and the Markdown show the same page. The bytes are inline (`base64`) and
 * hash to `sha256`; `path` names the file under W2L_CAPTURE_RAW_DIR when
 * that is set (`<sha256>.png` or `.jpg`, listed in `evidence.artifacts`
 * too), else null. `width` and `height` are CSS pixels (`scale: 'css'`):
 * the viewport's for a viewport capture, the viewport's width and the
 * document's height for `fullPage`; `deviceScaleFactor` is what the context
 * declared, not baked into the image. The page itself is unchanged: nothing
 * is scrolled, clicked or hidden for the capture.
 */
export interface ScreenshotEvidence {
  contentType: 'image/png' | 'image/jpeg'
  width: number
  height: number
  fullPage: boolean
  /** The window the page was laid out in, in CSS pixels: the request's viewport, or the declared one. */
  viewport: { width: number; height: number }
  /** Device pixels per CSS pixel the context declared (2 for the desktop identity, 2.625 for the mobile one). */
  deviceScaleFactor: number
  /** The JPEG quality asked for; null for a PNG. */
  quality: number | null
  bytes: number
  sha256: string
  path: string | null
  base64: string
}

/**
 * A caveat a reader of the result must see without opening the trace. Never
 * a failure reason, which `status` and its reason fields carry.
 */
export interface FetchWarning {
  /**
   * Machine-readable code. `robots_overridden`: a robots.txt rule was set
   * aside by a recorded override. `tls_unverified`: the certificate was not
   * verified at the caller's request (`skipTlsVerification`), so the content
   * cannot be attributed to the host with certainty. `client_rendered_suspected`:
   * the HTTP lane's page looks like a shell for data its scripts fill in
   * (see RenderSignals), so the capture may not be the page a browser shows.
   * `low_content_yield`: a thin http answer stayed the run's answer.
   * `screenshot_unavailable`: the `screenshot` format was asked for and the
   * browser lane rendered the page but could not capture it
   * (`screenshot_failed` in the trace); `screenshot` is null and the page
   * result stands.
   */
  code: string
  message: string
}

/**
 * A page-level fetch outcome. `status` is the single source of truth
 * (see RESULT_STATUS); the reason fields narrow it.
 */
export interface FetchResult {
  /** Earliest permitted next request after a deferred Retry-After, UTC milliseconds. */
  retryAt?: number
  requestedUrl: string
  status: ResultStatus
  /** Set iff status === 'failed'. Duplicate content uses status `duplicate`. */
  failureReason: FailureReason | null
  /** Set iff status === 'blocked'. */
  blockReason: BlockReason | null
  /** Set iff status === 'budget_exceeded'. */
  budgetExceeded: BudgetKind | null
  /** The lane that produced this result. */
  lane: Lane
  escalations: readonly Escalation[]
  /** Set when the result asks for human takeover. Never on a success.
   *  Optional for backward compatibility with existing result producers;
   *  the router and provider lanes always populate it. */
  handoff?: HandoffRequest | null
  /**
   * Vendor session resume material (context/profile/storage) that the
   * provider lane produced, so the ladder can persist it for the next run.
   * Shape is vendor-specific; it is a credential-free continuation token.
   */
  resumeContext?: unknown | null
  /**
   * The page as Markdown: its main content, the whole page when
   * `onlyMainContent` is false, or the elements `includeTags` names, in each
   * case without `excludeTags`. `data:` link and image targets are dropped,
   * the link text and alt text kept. Null unless status is contentful,
   * except on a failed or blocked result that kept a page as evidence, never
   * content: the page an error status carried, or the whole page when the
   * extractor found no main content (`empty_unverified`, and `timeout` when
   * the deadline then ended a later rung).
   */
  markdown: string | null
  /** HTML-derived page/product facts; never reconstructed from Markdown. */
  document?: DocumentExtraction | null
  /**
   * What the page's HTML declares about itself (its `<title>`, description,
   * language, keywords, robots, icon and canonical URL), present with
   * `document`. `metadata.title` is the page's `<title>`; `document.title` is
   * the content's title, usually its first heading.
   */
  metadata?: PageMetadata
  /**
   * The cleaned HTML the Markdown was written from, present only when the
   * `html` format was asked for: the main content; with
   * `onlyMainContent: false` the whole page without what Markdown never
   * shows (scripts, styles, form controls, embedded media) and without the
   * caller's `excludeTags`; with `includeTags` a `<body>` holding the named
   * elements. A lane sets it on a contentful page only; the API returns
   * null for a file and for a page that was not read as content.
   */
  html?: string | null
  /**
   * The page as the lane received it, present only when the `rawHtml` format
   * was asked for: the response body on the HTTP lane, the rendered DOM on a
   * browser lane, scripts and all. Its UTF-8 bytes hash to
   * `evidence.rawBodySha256`. Set and returned as `html` is.
   */
  rawHtml?: string | null
  /** Present only when a JSON format was requested. */
  json?: StructuredExtractionResult | null
  /**
   * Present when the response was a file (PDF, CSV, JSON, text, XLSX, XLS,
   * ZIP) rather than a web page: what it was, its size, SHA-256 and where it
   * was saved, and for a PDF its pages. Such a result has no `document` or
   * `metadata`.
   */
  file?: FileDescription
  /**
   * Outbound http(s) links from the FULL document, collected after extract
   * and before the raw HTML is dropped. Not from `mainHtml` — prune strips
   * nav. Empty / omitted when the fetch never produced HTML. Never the page
   * HTML itself.
   */
  links?: readonly string[]
  /**
   * The image URLs of the FULL document (`img` src and srcset candidates,
   * `picture` sources, lazy-loading attributes, video posters, `image_src`
   * links, og:image and twitter:image), absolute http(s), fragment stripped,
   * each once, in document order; `data:` URIs left out. Present only when
   * the `images` format was asked for (`FetchOptions.includeImages`), on a
   * contentful page: absent for a file and for a page that was not read as
   * content. `[]` for a page without images.
   */
  images?: readonly string[]
  /**
   * The `tables` format: every data table of the content the Markdown was
   * written from (the main content, the whole page with `onlyMainContent:
   * false`, or the `includeTags` selection), one entry per GFM table of the
   * Markdown, in its order. Present only when asked for
   * (`FetchOptions.includeTables`), on a contentful page: absent for a file
   * and for a page that was not read as content. `[]` for a page without one.
   */
  tables?: readonly PageTable[]
  /**
   * A PDF's pages, each as the Markdown has it (without its marker), when a
   * `pdf` parser entry asked for them (`pages: true`) and the text layer was
   * read; absent otherwise.
   */
  pages?: readonly PdfPageMarkdown[]
  /**
   * The `attributes` format: one entry per selector of the request, in its
   * order, with the attribute's values as written in the HTML. Present only
   * when asked for (`FetchOptions.attributes`), on a contentful page, like
   * `images`.
   */
  attributes?: readonly AttributeExtraction[]
  /**
   * The `screenshot` format, present only when asked for
   * (`FetchOptions.screenshot`), on every result the browser lane built from
   * the rendered document: a success or partial page, and an error-status or
   * blocked page kept as evidence. Null when the page rendered but the
   * capture failed (`screenshot_failed` in the trace, a
   * `screenshot_unavailable` warning). Absent when no page rendered (a file,
   * a robots.txt denial, a navigation failure), as the API then answers
   * null. The attempt copies in a run's audit carry null, so the image
   * travels once.
   */
  screenshot?: ScreenshotEvidence | null
  /**
   * The fetch's caveats, present only when it has any: a `robots_overridden`
   * warning first when a recorded override set a robots.txt rule aside, then
   * `tls_unverified` when the fetch skipped certificate verification, then
   * `client_rendered_suspected` when the HTTP lane read the page as a shell
   * its scripts fill in, or `screenshot_unavailable` when the browser lane
   * could not capture the screenshot asked for. Kept on batch items and the
   * compact scrape response too.
   */
  warnings?: readonly FetchWarning[]
  /** True when content was cut to fit a token budget. */
  truncated: boolean
  /** Character offset where truncation occurred; null when not truncated. */
  truncatedAt: number | null
  /**
   * Tamper-evident record of what the fetch actually did (robots.txt decision,
   * exact headers sent, rate-limit facts). Null until a subject wires the
   * record builder in; contentful subjects are expected to produce one per
   * fetch so the premium "provable politeness" tier is not a bolt-on.
   */
  compliance: ComplianceRecord | null
  evidence: Evidence
  usage: ResourceUsage
  trace: readonly TraceEvent[]
}

/**
 * One data table of a page (the `tables` format). `tableIndex` counts the
 * data tables from 0 in document order: table N is the Nth GFM table of the
 * Markdown made from the same request. Cells are plain text: a link is its
 * text, an image its alt text, whitespace collapsed, nothing escaped; a cell
 * that spans rows or columns gives its value to every slot it covers, so
 * every row has `columns` cells and none is shifted.
 */
export interface PageTable {
  tableIndex: number
  /** The table's `<caption>` as plain text; null when it has none (a title written above the table is not one). */
  caption: string | null
  /** The final URL of the page the table was read from (`evidence.finalUrl`). */
  sourceUrl: string
  /** Leading rows in `<thead>` or made of `<th>` cells alone; 0 when none. */
  headerRows: number
  columns: number
  rows: readonly (readonly string[])[]
  /** The rows as RFC 4180 CSV: CRLF line ends, a field quoted when it holds a comma, a quote or a line break, quotes doubled. */
  csv: string
  /** SHA-256 (hex) of the UTF-8 bytes of `csv`. */
  csvSha256: string
}

/** One page of a PDF's text (`pages`): its number in the document, from 1, and its Markdown. */
export interface PdfPageMarkdown {
  pageNumber: number
  markdown: string
}
