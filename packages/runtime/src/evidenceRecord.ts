/**
 * The one builder of Evidence Record v1 (contracts/src/evidenceRecord.ts and
 * schemas/evidence-record.v1.json). Every result that leaves the API goes
 * through it: full and compact scrape responses, batch items, crawl pages.
 *
 * It reads only what the result recorded, never what the caller's policy
 * says should have happened: a fact the lane did not observe is null.
 */

import {
  EVIDENCE_SCHEMA_VERSION,
  declaredContact,
  type CrawlMode,
  type EvidenceArtifact,
  type EvidenceFieldLocation,
  type EvidenceRecord,
  type EvidenceRobotsDecision,
  type FetchResult,
  type FileDescription,
  type JsonValue,
  type Lane,
  type RobotsUnreachable,
  type StructuredExtractionResult,
  type TraceEvent,
} from '@w2l/contracts'
import { EXTRACTOR_VERSION, FILE_TEXT_VERSION, PDF_TEXT_VERSION } from '@w2l/extract-tf'
import { sha256Utf8 } from '@w2l/http-core'

/** What this response delivered from the result, after format selection. */
export interface EvidenceOutput {
  /** The Markdown as delivered; null or absent when none was. */
  markdown?: string | null
  /** The JSON result as delivered; absent when JSON was not requested. */
  json?: StructuredExtractionResult | null
}

export interface EvidenceRecordOptions {
  /** The running source commit; defaults to `W2L_SOURCE_COMMIT`. */
  sourceCommit?: string | null
}

/** Lanes that request every redirect hop themselves, and so can list each. */
const EVERY_HOP_LANES: ReadonlySet<Lane> = new Set<Lane>(['http'])

export function toEvidenceRecord(
  result: FetchResult,
  request: { mode: CrawlMode },
  output: EvidenceOutput,
  options: EvidenceRecordOptions = {},
): EvidenceRecord {
  const { evidence } = result
  const httpStatus = typeof evidence.httpStatus === 'number' && evidence.httpStatus >= 100 && evidence.httpStatus <= 599 ? evidence.httpStatus : null
  // A lane that refused before any request (robots.txt, DNS, policy) still
  // fills evidence.finalUrl with the requested URL; it was never requested.
  const requested = httpStatus !== null || result.usage.requestCount > 0
  const finalUrl = requested ? evidence.finalUrl : null
  const urls = finalUrl === null ? []
    : evidence.redirectChain.length > 0 ? [...evidence.redirectChain]
      : finalUrl === result.requestedUrl ? [finalUrl] : [result.requestedUrl, finalUrl]
  const userAgent = finalUrl === null ? null : observedUserAgent(result)
  // A web page goes through extract-tf; a file through the PDF text or file text rules.
  const extractor = result.file === undefined ? EXTRACTOR_VERSION : result.file.kind === 'pdf' ? PDF_TEXT_VERSION : FILE_TEXT_VERSION
  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    requestedUrl: result.requestedUrl,
    finalUrl,
    redirectChain: { urls, complete: EVERY_HOP_LANES.has(result.lane) },
    fetchedAt: evidence.fetchedAt ?? null,
    httpStatus,
    status: result.status,
    reason: result.failureReason ?? result.blockReason ?? result.budgetExceeded ?? null,
    lane: result.lane,
    robotsDecision: robotsDecision(result),
    rawSha256: evidence.rawBodySha256 ?? null,
    outputSha256: {
      markdown: typeof output.markdown === 'string' ? sha256Utf8(output.markdown) : null,
      json: output.json === undefined || output.json === null || output.json.data === null ? null : sha256Utf8(canonicalJson(output.json.data as JsonValue)),
    },
    extractor: {
      name: extractor.split('/')[0]!,
      version: extractor,
      commit: options.sourceCommit !== undefined ? options.sourceCommit : sourceCommitFromEnv(),
    },
    fieldEvidence: output.json === undefined || output.json === null ? null : Object.fromEntries(
      output.json.evidence.map((item): [string, EvidenceFieldLocation] => [item.path, { source: item.source, locator: item.evidencePath ?? null }]),
    ),
    artifacts: evidence.artifacts.map(path => artifact(path, result.file)),
    proxy: evidence.envProxy ?? null,
    identity: {
      userAgent,
      mode: result.compliance?.mode ?? identityEvent(result.trace)?.mode ?? request.mode,
      contact: userAgent === null ? null : declaredContact(userAgent),
    },
  }
}

/** `W2L_SOURCE_COMMIT` when it is a commit hash (7 to 40 hex digits), else unknown. */
function sourceCommitFromEnv(): string | null {
  const value = process.env.W2L_SOURCE_COMMIT?.trim().toLowerCase() ?? ''
  return /^[0-9a-f]{7,40}$/.test(value) ? value : null
}

/**
 * RFC 8785 canonical JSON for the values W2L emits: object keys sorted by
 * UTF-16 code units at every level, no whitespace, JSON.stringify for strings
 * and numbers. Undefined members are left out, as JSON.stringify does.
 */
function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(item => canonicalJson(item ?? null)).join(',')}]`
  const members = Object.keys(value).sort().filter(key => value[key] !== undefined)
  return `{${members.map(key => `${JSON.stringify(key)}:${canonicalJson(value[key]!)}`).join(',')}}`
}

/**
 * The signed record's robots decision when the lane minted one, else the
 * lane's `robots_checked` trace event. A decision of `no_robots` with no
 * robots.txt URL is the placeholder of a lane that never consulted it.
 */
function robotsDecision(result: FetchResult): EvidenceRobotsDecision | null {
  const signed = result.compliance?.robots
  if (signed !== undefined) {
    if (signed.decision === 'no_robots' && signed.robotsUrl === null) return null
    return {
      decision: signed.decision,
      robotsUrl: signed.robotsUrl,
      robotsSha256: signed.robotsSha256,
      unreachable: signed.unreachable ?? null,
      crawlDelayMs: signed.crawlDelayMs ?? null,
      userOverride: false,
    }
  }
  const detail = [...result.trace].reverse().find(event => event.event === 'robots_checked')?.detail
  const decision = detail?.decision
  if (decision !== 'allowed' && decision !== 'disallowed' && decision !== 'no_robots') return null
  const robotsUrl = typeof detail?.robotsUrl === 'string' ? detail.robotsUrl : null
  if (decision === 'no_robots' && robotsUrl === null) return null
  return {
    decision,
    robotsUrl,
    robotsSha256: typeof detail?.robotsSha256 === 'string' ? detail.robotsSha256 : null,
    unreachable: typeof detail?.unreachable === 'string' ? detail.unreachable as RobotsUnreachable : null,
    crawlDelayMs: typeof detail?.crawlDelayMs === 'number' ? detail.crawlDelayMs : null,
    userOverride: false,
  }
}

/** The HTTP lane's `identity_sent` event: the mode and the headers it sent. */
function identityEvent(trace: readonly TraceEvent[]): { mode: CrawlMode; userAgent: string | null } | null {
  const detail = trace.find(event => event.event === 'identity_sent')?.detail
  if (detail === undefined) return null
  const headers = Array.isArray(detail.headers) ? detail.headers as { name?: unknown; value?: unknown }[] : []
  const userAgent = headers.find(header => header.name === 'user-agent')?.value
  return { mode: detail.mode as CrawlMode, userAgent: typeof userAgent === 'string' ? userAgent : null }
}

/**
 * The User-Agent on the wire: from the signed record's sent headers, else
 * the HTTP lane's identity event. A provider that did not report what its
 * browser sent leaves it unknown, whatever it declared.
 */
function observedUserAgent(result: FetchResult): string | null {
  if (result.trace.some(event => event.event === 'identity_unobserved')) return null
  const signed = result.compliance?.sentHeaders.headers.find(header => header.name === 'user-agent')?.value
  return signed ?? identityEvent(result.trace)?.userAgent ?? null
}

/**
 * The file the result describes (`file.path`), saved as received; a raw
 * snapshot, saved as `<sha256 of its bytes>.html` (bench captureRawHtml),
 * whose size and type are not recorded; any other file is not known here.
 */
function artifact(path: string, file: FileDescription | undefined): EvidenceArtifact {
  if (file !== undefined && file.path === path) return { kind: 'file', path, sha256: file.sha256, bytes: file.bytes, contentType: file.contentType }
  const hash = /(?:^|[\\/])([0-9a-f]{64})\.html$/.exec(path)?.[1]
  return hash === undefined ? { kind: null, path, sha256: null, bytes: null, contentType: null } : { kind: 'snapshot', path, sha256: hash, bytes: null, contentType: null }
}
