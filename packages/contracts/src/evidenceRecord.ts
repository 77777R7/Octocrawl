/**
 * Evidence Record v1: the evidence every result carries, stated the same way
 * whichever lane produced it. The published JSON Schema is
 * `schemas/evidence-record.v1.json` in this package; the key lists below and
 * `test/evidenceRecord.test.ts` keep the file and this type in step. Types
 * only: the builder (`toEvidenceRecord`) lives in @w2l/runtime.
 *
 * Unknown is null, never zero or a guess. Every field is always present.
 */

import type { CrawlMode, RobotsUnreachable } from './compliance.js'
import type { BlockReason, BudgetKind, FailureReason, Lane, ResultStatus } from './status.js'

export const EVIDENCE_SCHEMA_VERSION = 'w2l.evidence/1'

/**
 * Where a JSON field's value was read. `pdf` is reserved for the PDF text
 * that file download will add (its locator names the page); no lane emits it
 * yet.
 */
export const FIELD_EVIDENCE_SOURCES = ['jsonld', 'microdata', 'meta', 'hydration', 'dom', 'text', 'inferred', 'model', 'pdf'] as const
export type FieldEvidenceSource = (typeof FIELD_EVIDENCE_SOURCES)[number]

/**
 * `snapshot` is the page's HTML as W2L read it (`W2L_CAPTURE_RAW_DIR`);
 * `screenshot` and `file` (a downloaded file saved as received) are reserved
 * for the lanes that will produce them.
 */
export const EVIDENCE_ARTIFACT_KINDS = ['snapshot', 'screenshot', 'file'] as const
export type EvidenceArtifactKind = (typeof EVIDENCE_ARTIFACT_KINDS)[number]

export interface EvidenceRedirectChain {
  /**
   * Every URL W2L requested for the page, in order: the requested URL first,
   * the final URL last. `[requestedUrl]` when there was no redirect; empty
   * when W2L sent no request for the page.
   */
  urls: readonly string[]
  /**
   * True when every hop is listed. The HTTP lane follows redirects itself and
   * lists each; browser and provider lanes see only where navigation started
   * and ended, so their chain is `[requested, final]` and this is false.
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
  /** Whether a user override replaced the decision. W2L has no override yet, so this is false. */
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
  /** EXTRACTOR_VERSION of @w2l/extract-tf. */
  version: string
  /** The source commit of the running W2L (`W2L_SOURCE_COMMIT`); null when not declared. */
  commit: string | null
}

export interface EvidenceFieldLocation {
  source: FieldEvidenceSource
  /** JSON-LD path, DOM selector, `table[i] tr[j] "label"`, and later `page N`; null when the source gives none. */
  locator: string | null
}

export interface EvidenceArtifact {
  /** Null when W2L cannot tell what the file is. */
  kind: EvidenceArtifactKind | null
  path: string
  sha256: string | null
}

export interface EvidenceIdentity {
  /** The User-Agent observed on the wire; null when the lane did not observe it. */
  userAgent: string | null
  mode: CrawlMode
  /** The contact the User-Agent declares (research mode with `W2L_CONTACT`); null when none. */
  contact: string | null
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
  artifact: keysOf<EvidenceArtifact>()(['kind', 'path', 'sha256']),
  identity: keysOf<EvidenceIdentity>()(['userAgent', 'mode', 'contact']),
} as const
