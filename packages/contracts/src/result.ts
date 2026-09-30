import type { BlockReason, BudgetKind, FailureReason, Lane, ResultStatus } from './status.js'
import type { ComplianceRecord } from './compliance.js'
import type { DocumentExtraction } from './extractor.js'
import type { StructuredExtractionResult } from './structured.js'

export interface ResourceTimings {
  queueMs?: number
  robotsMs?: number
  cooldownWaitMs?: number
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
}

export interface Meter {
  knownSubtotal: number
  unknown: boolean
}

export interface Evidence {
  /** Final URL after redirects. */
  finalUrl: string
  httpStatus: number | null
  redirectChain: readonly string[]
  contentType: string | null
  /** sha256 of the raw response body. Null only when no body was read. */
  rawBodySha256: string | null
  /** Relative artifact paths (raw body, screenshot, DOM snapshot). */
  artifacts: readonly string[]
  /** HTTP validators observed for the representation, when exposed. */
  etag?: string | null
  lastModified?: string | null
  cacheControl?: string | null
  vary?: string | null
  /** A response setting cookies cannot enter the public monitor cache. */
  setsCookie?: boolean
}

export interface TraceEvent {
  at: number
  lane: Lane
  event: string
  detail?: Record<string, unknown>
}

export const FILE_KIND = ['pdf', 'csv', 'xlsx', 'xls', 'zip', 'json'] as const
export type FileKind = (typeof FILE_KIND)[number]

/** A response kept as the file it was, byte for byte, beside any text read from it. */
export interface FileEvidence {
  kind: FileKind
  contentType: string | null
  /** Size as received, before any decoding. */
  bytes: number
  sha256: string
  /** Where the bytes were written, or null when saving is disabled. */
  path: string | null
  /** From Content-Disposition, else the last URL path segment; null when neither names one. */
  filename: string | null
  /** PDF only: what the text layer held. */
  pdf?: { pages: number; textPages: number; textChars: number }
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

/**
 * A caveat on a contentful result: the content is returned, and the reader
 * should know what W2L could not vouch for.
 */
export interface FetchWarning {
  /** Machine-readable code, e.g. `low_confidence_extraction`, `client_rendered_suspected`. */
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
   * Extracted main content as Markdown. Null unless status is contentful,
   * or the failure is an `http_error` whose response body was readable: an
   * error page is then returned as evidence, with an `http_error` warning.
   */
  markdown: string | null
  /** Caveats on a contentful result; absent or empty when there are none. */
  warnings?: readonly FetchWarning[]
  /** HTML-derived page/product facts; never reconstructed from Markdown. */
  document?: DocumentExtraction | null
  /** Present only when a JSON format was requested. */
  json?: StructuredExtractionResult | null
  /** Present when the response was a file (PDF, CSV, XLSX, ZIP, JSON) kept as received. */
  file?: FileEvidence | null
  /**
   * Outbound http(s) links from the FULL document, collected after extract
   * and before the raw HTML is dropped. Not from `mainHtml` — prune strips
   * nav. Empty / omitted when the fetch never produced HTML. Never the page
   * HTML itself.
   */
  links?: readonly string[]
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
