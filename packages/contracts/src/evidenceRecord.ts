/**
 * Evidence Record v1: the evidence every result carries, stated the same way
 * whichever lane produced it. The published JSON Schema is
 * `schemas/evidence-record.v1.json` in this package; the key lists below and
 * `test/evidenceRecord.test.ts` keep the file and this type in step. Types
 * only: the builder (`toEvidenceRecord`) lives in @w2l/runtime.
 *
 * Unknown is null, never zero or a guess. Every field is always present.
 *
 * Versioning: `w2l.evidence/1` changes only additively. A later revision of
 * the schema file accepts every record an earlier one accepted: a field added
 * later is optional in the schema (EVIDENCE_RECORD_ADDED_KEYS), though W2L
 * writes it on every record from then on; enums only gain values; no field
 * changes its meaning. A change that cannot follow this rule gets a new
 * schemaVersion (`w2l.evidence/2`) and a new schema file.
 */

import type { CrawlMode, RobotsUnreachable } from './compliance.js'
import type { BlockReason, BudgetKind, FailureReason, Lane, ResultStatus } from './status.js'

export const EVIDENCE_SCHEMA_VERSION = 'w2l.evidence/1'

/**
 * Where a JSON field's value was read. `fetch` is the fetch's own value (its
 * final or requested URL), not read from the page. `pdf`: a `Label: value`
 * line of a PDF's text, whose locator names the page and the label.
 */
export const FIELD_EVIDENCE_SOURCES = ['jsonld', 'microdata', 'meta', 'hydration', 'dom', 'text', 'inferred', 'model', 'fetch', 'pdf'] as const
export type FieldEvidenceSource = (typeof FIELD_EVIDENCE_SOURCES)[number]

/**
 * `snapshot` is the page's HTML as W2L read it (`W2L_CAPTURE_RAW_DIR`);
 * `file` is a file (PDF, CSV, ...) saved as received; `screenshot` is the
 * browser lane's capture for the `screenshot` format, saved under
 * `W2L_CAPTURE_RAW_DIR` as `<sha256>.png` or `.jpg`, with its size and type.
 */
export const EVIDENCE_ARTIFACT_KINDS = ['snapshot', 'screenshot', 'file'] as const
export type EvidenceArtifactKind = (typeof EVIDENCE_ARTIFACT_KINDS)[number]

export interface EvidenceRedirectChain {
  /**
   * Every URL W2L requested for the page, in order: the requested URL first,
   * the final URL last, with each redirect between (in the browser lane, a
   * document a script or a meta refresh loaded is one). `[requestedUrl]` when
   * there was no redirect; empty when W2L sent no request for the page.
   */
  urls: readonly string[]
  /**
   * True when every hop is listed. The HTTP lane follows redirects itself and
   * lists each; the browser lane lists each redirect Chromium followed and
   * each document a script or a meta refresh loaded, and is false only when a
   * follow-up navigation did not start at the requested URL, a document came
   * without a request, or the chain of a page that kept moving on was cut to
   * its first URL and last 20. The provider lane sees only where its vendor
   * started and ended, so its chain is `[requested, final]` and this is false.
   */
  complete: boolean
}

export interface EvidenceRobotsDecision {
  /** `no_robots`: robots.txt was requested and the site has none (a 4xx, or a body that is not text/plain). */
  decision: 'allowed' | 'disallowed' | 'no_robots'
  robotsUrl: string | null
  /** SHA-256 of the robots.txt bytes parsed; null when none was parsed. */
  robotsSha256: string | null
  /** Why robots.txt could not be fetched (then `decision` is `disallowed`, RFC 9309 §2.3.1.4); null when it was. */
  unreachable: RobotsUnreachable | null
  crawlDelayMs: number | null
  /** Whether the fetch went ahead under a recorded robots override although `decision` is `disallowed`; the reason is in the trace, the warnings and, in the browser lane, the compliance record. */
  userOverride: boolean
}

export interface EvidenceOutputSha256 {
  /** SHA-256 of the UTF-8 bytes of the delivered `markdown`; null when none was delivered. */
  markdown: string | null
  /** SHA-256 of the canonical JSON of the delivered `json.data`; null when JSON was not requested or has no data. */
  json: string | null
}

export interface EvidenceExtractor {
  name: string
  /** EXTRACTOR_VERSION of @w2l/extract-tf for a web page; PDF_TEXT_VERSION for a PDF; FILE_TEXT_VERSION for another file. */
  version: string
  /** The source commit of the running W2L (`W2L_SOURCE_COMMIT`); null when not declared. */
  commit: string | null
}

export interface EvidenceFieldLocation {
  source: FieldEvidenceSource
  /** JSON-LD path, DOM selector, `table[i] tr[j] "label"`, `h1[0]`, a result field such as `finalUrl`, or `page N "label"` for a PDF; null when the source gives none. */
  locator: string | null
}

export interface EvidenceArtifact {
  /** Null when W2L cannot tell what the file is. */
  kind: EvidenceArtifactKind | null
  path: string
  sha256: string | null
  /** Size of the saved file in bytes; null when unknown. Added to v1 for files (EVIDENCE_RECORD_ADDED_KEYS). */
  bytes: number | null
  /** The Content-Type the file was received with; null when unknown or none was sent. Added to v1 for files. */
  contentType: string | null
}

export interface EvidenceIdentity {
  /** The User-Agent observed on the wire; null when the lane did not observe it. */
  userAgent: string | null
  mode: CrawlMode
  /** The contact the User-Agent declares (research mode with `W2L_CONTACT`); null when none. */
  contact: string | null
  /**
   * The device the answering lane's identity declared (`mobile` for a
   * request with `mobile: true`); null when W2L sent no request for the page,
   * in mode `research` (a bot declares no device) or when the lane recorded
   * none (the provider lane). Added to v1 (EVIDENCE_RECORD_ADDED_KEYS).
   */
  device: 'desktop' | 'mobile' | null
  /**
   * The caller's custom headers (`headers`) the answering lane sent, names
   * lower-cased and sorted, each with the SHA-256 of its value, never the
   * value: a value may be a key the caller would not publish with the data,
   * as the scrape record keeps names only. Empty when it sent none; null when
   * W2L sent no request for the page. Added to v1 (EVIDENCE_RECORD_ADDED_KEYS).
   */
  requestHeaders: readonly EvidenceRequestHeader[] | null
}

/** One custom request header as sent: its name and the SHA-256 (hex) of its value's UTF-8 bytes. */
export interface EvidenceRequestHeader {
  name: string
  valueSha256: string
}

export interface EvidenceRecord {
  schemaVersion: typeof EVIDENCE_SCHEMA_VERSION
  requestedUrl: string
  /** The last URL W2L requested for the page; null when it sent none (robots.txt disallow, DNS failure, policy). */
  finalUrl: string | null
  redirectChain: EvidenceRedirectChain
  /** UTC ISO 8601 time the response W2L reports was received; null when there was none. */
  fetchedAt: string | null
  httpStatus: number | null
  status: ResultStatus
  /** The failure, block or budget reason; null for other statuses. */
  reason: FailureReason | BlockReason | BudgetKind | null
  lane: Lane
  /** Null when no robots.txt decision was made for this result. */
  robotsDecision: EvidenceRobotsDecision | null
  /** `evidence.rawBodySha256`: the body W2L read (see the schema for what each lane reads). */
  rawSha256: string | null
  outputSha256: EvidenceOutputSha256
  extractor: EvidenceExtractor
  /** JSON Pointer into `json.data` → where that value was read; null when JSON was not requested. */
  fieldEvidence: Readonly<Record<string, EvidenceFieldLocation>> | null
  artifacts: readonly EvidenceArtifact[]
  /** `host:port` of the operator's environment proxy the request went through; null when it went direct or the lane does not report its route. */
  proxy: string | null
  identity: EvidenceIdentity
}

/** The argument must list every key of T once: a missing or unknown key fails to compile. */
type EveryKey<T, K extends readonly PropertyKey[]> =
  [Exclude<keyof T, K[number]>, Exclude<K[number], keyof T>] extends [never, never] ? unknown : never
const keysOf = <T>() => <const K extends readonly (keyof T)[]>(keys: K & EveryKey<T, K>): K => keys

/** Field order of the record and of each nested object, as in the schema file. */
export const EVIDENCE_RECORD_KEYS = {
  record: keysOf<EvidenceRecord>()(['schemaVersion', 'requestedUrl', 'finalUrl', 'redirectChain', 'fetchedAt', 'httpStatus', 'status', 'reason', 'lane', 'robotsDecision', 'rawSha256', 'outputSha256', 'extractor', 'fieldEvidence', 'artifacts', 'proxy', 'identity']),
  redirectChain: keysOf<EvidenceRedirectChain>()(['urls', 'complete']),
  robotsDecision: keysOf<EvidenceRobotsDecision>()(['decision', 'robotsUrl', 'robotsSha256', 'unreachable', 'crawlDelayMs', 'userOverride']),
  outputSha256: keysOf<EvidenceOutputSha256>()(['markdown', 'json']),
  extractor: keysOf<EvidenceExtractor>()(['name', 'version', 'commit']),
  fieldEvidence: keysOf<EvidenceFieldLocation>()(['source', 'locator']),
  artifact: keysOf<EvidenceArtifact>()(['kind', 'path', 'sha256', 'bytes', 'contentType']),
  identity: keysOf<EvidenceIdentity>()(['userAgent', 'mode', 'contact', 'device', 'requestHeaders']),
  requestHeader: keysOf<EvidenceRequestHeader>()(['name', 'valueSha256']),
} as const

/**
 * Keys added to v1 after it was first published: optional in the schema, so
 * that records written before them stay valid, though W2L always writes them.
 */
export const EVIDENCE_RECORD_ADDED_KEYS: Partial<Record<keyof typeof EVIDENCE_RECORD_KEYS, readonly string[]>> = {
  artifact: ['bytes', 'contentType'],
  identity: ['device', 'requestHeaders'],
}
