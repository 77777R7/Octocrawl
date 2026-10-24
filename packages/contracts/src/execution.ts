import type { AppliedRobotsOverride } from './compliance.js'
import type { FetchWarning, TraceEvent } from './result.js'
import type { AttributeSelector, ListFormatRequest, ScreenshotOptions, StructuredModelGate } from './structured.js'
import type { PageAction } from './actions.js'
import type { VerifyContract } from './verify.js'

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
  /**
   * The task's cookie session (ADR 0005 `egress_sessions`): the cookies a page's responses set,
   * sent again to their site on the task's later pages, by every local rung. Absent: no cookie is
   * kept or sent, as before.
   */
  cookieSession?: CookieSession
  /**
   * Hear of each trace event the moment the HTTP lane records it (robots.txt checked, the response arrived, the
   * page extracted), for a caller that shows progress while the fetch runs. The result's `trace` stays the record;
   * a listener's error never changes the fetch. Absent: nothing is told early.
   */
  onTrace?: (event: TraceEvent) => void
  /**
   * Hear of each page a paginate step reads the moment it is read (ROADMAP PA item 3), for a caller that keeps
   * them in the task's checkpoint: a run cut at page N then resumes from them through `listResume`. A listener's
   * error never changes the fetch. Absent: nothing is told.
   */
  onListPage?: (page: ListPageRead) => void
  /**
   * The pages a paginate step of this URL read before an earlier run was cut, from the task's checkpoint. The
   * browser lane counts them as read: it passes over them on its way along the site's own Next links (the only way
   * to page N+1 when pages have no address of their own), tells and reads the pages after them, and merges every
   * page once. Absent: the list starts from its first page.
   */
  listResume?: { pages: readonly ListPageRead[] }
  /**
   * The run's spend ledger (ROADMAP PA item 4): a rung that costs a third party reserves its price ceiling here before
   * its call and settles after, so a run's concurrent pages, retries and providers share one cap and none overruns it.
   * Absent: nothing is reserved, as before (a run with no third-party rung).
   */
  spend?: SpendLedger
  /**
   * The task's durable record of its paid calls (PA E2, E3): a rung that pays a third party writes the call's `reserved`
   * row here after reserving and before the call goes out, `submitted` once the provider names its session, and the
   * outcome when it settles, so a crash between the call and the page's step leaves the call on the record. Absent (a
   * single scrape with no task store): the ledger alone holds the call, in memory, as before.
   */
  paidCalls?: PaidCallLog
  /**
   * The paid call this fetch is (its `paid_calls` id), set by the ladder for a provider rung's call within a task: a
   * provider that lets the caller name its session (Steel's `sessionId`) names it from this id, so the session can be
   * found again after a crash (PA E4). Absent outside a task.
   */
  paidCallId?: string
  /**
   * Hear of each provider session a paid call opens, the moment the provider names it, so the call's row says which
   * session to ask about after a crash: `providerRequestId` is the id the caller asked the provider to give it, when it
   * asked. Set by the ladder with `paidCallId`; a listener's error is ignored.
   */
  onPaidSession?: (session: { providerSessionId: string; providerRequestId?: string }) => void
  /**
   * Asked before a json model fallback calls the model for a page (hosted Octocrawl's switch, daily cap and credits):
   * a refusal leaves the json as deterministic extraction read it, with a `model_unavailable` issue that gives the
   * reason. Absent: the model is called whenever it is configured, as before.
   */
  modelGate?: StructuredModelGate
}

/**
 * Where a paid call stands in its task's `paid_calls` (PA E2). `reserved`: written before the call went out. `submitted`:
 * the provider named its session. `usage_pending`: the call ended and was charged at a bound (its ceiling, or a measure
 * missing a provider figure) while the provider can still be asked what it cost. `settled`: the charge is known.
 * `unknown`: nobody can say what it cost; it counts at its ceiling and is never released on its own. `released`: the
 * reservation was given back, with evidence that no request went out.
 */
export type PaidCallState = 'reserved' | 'submitted' | 'usage_pending' | 'settled' | 'unknown' | 'released'

/** One row of a task's `paid_calls`: the persistent state of one paid call. EvidencePaidCall is its settled snapshot on the page's record. */
export interface PaidCallRecord {
  /** `{taskId}-{attemptId}-{ordinal}`, fixed before the reservation; usable as the provider's idempotency key where it takes one. */
  paidCallId: string
  taskId: string
  attemptId: string
  url: string
  vendorId: string
  ceilingUsd: number
  state: PaidCallState
  /** What the ledger charged once the call ended (a reported, measured or ceiling charge); null while it is in flight, and for `unknown` and `released`. */
  chargedUsd: number | null
  /** The provider's id for the request, when it gives one; null otherwise. */
  providerRequestId: string | null
  /** The provider's session the call ran in, once named; null before, or when the provider names none. */
  providerSessionId: string | null
  /** Which tariff priced the ceiling (a hash of it); null when not known. */
  tariffVersion: string | null
  /** The access grant's SHA-256; null for a grant not read from text. */
  grantHash: string | null
  /** The latest the call's session could have run until (ISO 8601); null when no deadline was set. */
  deadline: string | null
  createdAt: string
  /** When the row reached `settled`, `unknown` or `released`; null until then. */
  settledAt: string | null
}

/** A task's paid-call journal, as a rung sees it. */
export interface PaidCallLog {
  /** The next call's row, state `reserved`, its id fixed now: the caller writes it once its reservation fits. */
  open(call: { url: string; vendorId: string; ceilingUsd: number; tariffVersion?: string | null; grantHash?: string | null; deadline?: string | null }): PaidCallRecord
  /** Write the row as it now is. A call goes out only after its `reserved` row is written. */
  write(call: PaidCallRecord): Promise<void>
}

/**
 * A spend ledger: the cap a run (or one page of it) may spend on third parties, what is settled and what is reserved.
 * A paid call reserves its price ceiling first and is not made when the ceiling does not fit.
 */
export interface SpendLedger {
  /** Reserve `ceilingUsd` against this ledger's cap and every enclosing one; null when it does not fit. */
  reserve(ceilingUsd: number): SpendReservation | null
  /** A ledger over the same totals whose own reservations are also capped at `capUsd` (one page's `perRequestUsd`); null: no cap of its own. */
  child(capUsd: number | null): SpendLedger
  /** Spend settled so far, in US dollars: each call at its reported price, or at its ceiling when none was reported. */
  readonly settledUsd: number
  /** Ceilings reserved by calls not yet settled. */
  readonly reservedUsd: number
  /** The cap; null: none. */
  readonly capUsd: number | null
}

/** One reserved call. */
export interface SpendReservation {
  /** The call was made: settle at the price the provider reported, or at the ceiling when it reported none. Returns what was charged. */
  settle(reportedUsd: number | null): number
  /** The call was not made: give the reservation back. */
  release(): void
}

/** One page a paginate step read: what `onListPage` tells and `listResume` gives back. */
export interface ListPageRead {
  /** Index of the paginate step among the request's actions. */
  step: number
  /** 1-based position among the pages the step read, the resumed ones included. */
  page: number
  /** The URL the browser showed when the page was read. */
  url: string
  html: string
  /** The page's state key as the lane computed it (its URL and its items or words), to know the page again on a resume. */
  state: string
  /** The hash of the elements `itemSelector` matched, or null without one. */
  items: string | null
  /** The hash of the links and sources inside those elements alone, which a changed price or date leaves as it was; null without `itemSelector` or when no item has one. */
  itemRefs: string | null
  /** How many elements `itemSelector` matched on the page; null without one. */
  count: number | null
}

/** A cookie as a browser context takes and gives it (Playwright's shape). */
export interface ContextCookie {
  name: string
  value: string
  domain: string
  path: string
  /** Seconds since the epoch; -1 for a session cookie. */
  expires: number
  httpOnly: boolean
  secure: boolean
  sameSite: 'Strict' | 'Lax' | 'None'
}

/**
 * One task's cookies, matched to a URL by RFC 6265 (domain, path, secure, expiry). Values never
 * leave it into a record or a trace: a lane reports the session's `id` and counts.
 */
export interface CookieSession {
  /** An opaque id for the record, unrelated to any cookie value. */
  readonly id: string
  /** The `Cookie` header for a request to this URL; empty when none applies. */
  cookieHeader(url: string): Promise<string>
  /** Keep the `Set-Cookie` lines a response to this URL carried; returns how many were kept. */
  store(url: string, setCookies: readonly string[]): Promise<number>
  /** The cookies a browser context loading this URL should start with. */
  browserCookies(url: string): Promise<ContextCookie[]>
  /**
   * Keep what a browser context changed: given the cookies it started with and the ones it holds
   * after the page, store the new and changed ones and delete the ones it dropped, unless another
   * page of the task changed that cookie meanwhile. Unchanged cookies are left as the session has them.
   */
  storeBrowserChanges(startedWith: readonly ContextCookie[], held: readonly ContextCookie[]): Promise<{ kept: number; removed: number }>
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
  /** Read each selected list record's table columns too (`FetchResult.listColumns`): set when a JSON schema reads a list with an `itemSelector`, not by a caller. */
  listColumns?: boolean
  /**
   * The request's task contract (ADR 0006), for the browser lanes' wait for the region the task needs (ADR 0007): its
   * checks run on the live page until they hold, within a bound. It does not shape a successful result's content, so
   * the page cache's key leaves it out, as the verification does.
   */
  verify?: VerifyContract
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
