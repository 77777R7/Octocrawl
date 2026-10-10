import type { PageActionType } from './actions.js'
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

import type { CrawlMode, RobotsOverrideBasis, RobotsUnreachable } from './compliance.js'
import type { BlockReason, BudgetKind, FailureReason, Lane, ResultStatus } from './status.js'
import type { ReadinessState } from './result.js'

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

/**
 * The route that produced a result (ADR 0005): `http` (W2L's HTTP client, undici), `http_compat` (the
 * browser-compatible HTTP transport, impit), `browser` (the local headless browser), `enhanced_browser`
 * (the local browser on Patchright), `authed_browser` (the local browser with the user's saved login),
 * `user_browser` (the person's own browser after a handoff), `vendor` (a third-party browser service).
 */
export const ACCESS_ROUTES = ['http', 'http_compat', 'browser', 'enhanced_browser', 'authed_browser', 'user_browser', 'vendor'] as const
export type AccessRoute = (typeof ACCESS_ROUTES)[number]

/**
 * How a result was reached, read from the result's own trace. Added to v1 with enhanced access
 * (EVIDENCE_RECORD_ADDED_KEYS).
 */
export interface EvidenceAccess {
  /** Null when no lane produced the result (a run cut before a rung answered, a rung that threw, a lockdown miss). */
  route: AccessRoute | null
  /** The client that sent the requests: undici, impit, playwright, patchright, the person's browser, or the vendor's id; null when the result does not say. */
  executor: string | null
  /** The executor's version as the lane reported it; null when it reported none. */
  executorVersion: string | null
  /** The browser profile the HTTP transport sent (impit's); null on every other route. Its TLS fingerprint was not observed. */
  profile: string | null
  /** Third-party spend of the run that produced the result: 0 when no paid service was called, null when a called service stated no price. */
  externalCostUsd: number | null
  /**
   * How the page was read, counted apart (ROADMAP PA items 7 and 8): `unattended` (W2L's own lanes, no session of the
   * person's), `authorized_session` (with the person's saved login), `user_browser` (in the person's own Chrome, on a
   * site they allowed, without a step of theirs), `handed_to_person` (in their Chrome, after they got through a check).
   * Null when no page was read: the result is not success, partial or empty_verified, or no lane produced it. Added with
   * the my-browser lane: optional, so that records written before it stay valid.
   */
  completion?: AccessCompletion | null
  /**
   * The egress the page left through (ROADMAP PA item 3): the proxy's `host:port` and whether it came from the
   * operator's pool (`W2L_EGRESS_PROXIES`) or the environment variables, or `direct` with no proxy when W2L's own lane
   * recorded none and a page response shows a request was sent. `switchedFrom` names the pool egress the task last
   * moved off before this page was read here (`egress_switched`); null otherwise. Null when nothing says where the
   * requests left from: a vendor's service, the person's own browser, no lane at all, or a lane that stopped before
   * a page request (robots.txt, an address check, a deadline). Added with the egress pool: optional, so that earlier
   * records stay valid.
   */
  egress?: EvidenceAccessEgress | null
  /**
   * The task cookie session the page was read with (`egress_sessions`): its id alone, never its cookies. Null when
   * the page was read with none. Added with the egress pool: optional, so that earlier records stay valid.
   */
  session?: EvidenceAccessSession | null
  /**
   * Every paid provider call the page was read with (ROADMAP PA item 4), in order: the provider, what the spend ledger
   * reserved and charged, the price the provider stated, and what Octocrawl made of what came back. Null when no
   * provider was called. Added with the spend ledger: optional, so that earlier records stay valid.
   */
  paidCalls?: readonly EvidencePaidCall[] | null
  /** The access grant the paid calls were made under; null when no provider was called. Added with `paidCalls`. */
  grant?: EvidenceAccessGrant | null
}

/** One paid provider call (ROADMAP PA item 4). A provider's own word on the page is never its outcome. */
export interface EvidencePaidCall {
  /** The provider's id, as the access grant's tariffs name it (`browserbase`, `steel`). */
  provider: string
  /** The rung that made the call; a retry after the person's handoff is `provider(retry)`. */
  rung: string
  /** The ADR 0005 capabilities the provider's session was created with: `vendor_remote_browser`, and solving or stealth when the grant named them. */
  capabilities: readonly string[]
  /** What the ledger reserved before the call: its price ceiling, from the grant's tariff. */
  ceilingUsd: number
  /**
   * What the ledger charged: the price the provider stated, else its sessions' measured time under the grant's tariff
   * (`sessionMs`), else the ceiling (a call that threw or was cut, or a session whose release went unconfirmed, included).
   */
  chargedUsd: number
  /** The price the provider stated for the call; null when it stated none (Browserbase and Steel state none per call). */
  reportedCostUsd: number | null
  /**
   * How long the call's provider sessions lasted, from just before each was created to the provider's confirmation of its
   * release, when the charge is what that time costs under the tariff; null when the charge is not measured.
   */
  sessionMs?: number | null
  /**
   * What Octocrawl made of the page the call returned, by its own checks (a block page, an empty or unverified read, an
   * identity it did not send): never the provider's word that it succeeded. Null when the call returned no page (it
   * threw, or the deadline cut it).
   */
  outcome: ResultStatus | null
  /** Why the outcome is not a read page, as the record's own `reason`; null otherwise. */
  reason: FailureReason | BlockReason | BudgetKind | null
  /** The record's own page is this call's. */
  answer: boolean
}

/** The access grant paid calls were made under: enough to name it, not a copy. */
export interface EvidenceAccessGrant {
  /** SHA-256 of the grant's text as Octocrawl read it (`shasum -a 256 grant.json`); null for a grant not read from text. */
  sha256: string | null
  /** The grant's tier. */
  tier: string
  /** When its attestation says the operator accepted the providers' terms and costs; null when it has none. */
  attestedAt: string | null
}

export const ACCESS_EGRESS_SOURCES = ['pool', 'environment', 'direct'] as const
export type AccessEgressSource = (typeof ACCESS_EGRESS_SOURCES)[number]

export interface EvidenceAccessEgress {
  /** The proxy's `host:port`, never its credentials; null when the request went direct. */
  proxy: string | null
  source: AccessEgressSource
  /** The pool egress the task last left before this page was read here; null when it did not move. */
  switchedFrom: string | null
  /**
   * Where the pool egress leaves from, as the operator's echo URL (`W2L_EGRESS_ECHO_URL`) saw it through that proxy.
   * Null when no echo URL is set, the echo did not answer, or the egress is not the pool's. Added after `egress`:
   * optional, so that earlier records stay valid.
   */
  exit?: EvidenceAccessEgressExit | null
}

export interface EvidenceAccessEgressExit {
  /** The address the echo service saw the request come from. */
  ip: string
  /** Its two-letter country code, when the echo service gives one; null otherwise. */
  country: string | null
  /** When the echo was asked (UTC ISO); an exit is asked again after ten minutes. */
  observedAt: string
}

export interface EvidenceAccessSession {
  /** The session's id, as `session_cookies` traces it. */
  id: string
}

export const ACCESS_COMPLETIONS = ['unattended', 'authorized_session', 'user_browser', 'handed_to_person'] as const
export type AccessCompletion = (typeof ACCESS_COMPLETIONS)[number]

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
  /** Whether the fetch went ahead although `decision` is `disallowed`; on whose word is `overrideBasis`, and the reason is in the trace, the warnings and, in the browser lane, the compliance record. */
  userOverride: boolean
  /** On whose word the disallow was set aside (`RobotsOverrideBasis`); null when it was not. Optional in the v1 schema file, written on every record. */
  overrideBasis: RobotsOverrideBasis | null
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

/** The steps a request ran on the page before it was read. */
export interface EvidencePageActions {
  steps: readonly EvidencePageActionStep[]
  /** Whether an `executeJavascript` step ran in the page. */
  scriptRan: boolean
}

export interface EvidencePageActionStep {
  type: PageActionType
  outcome: 'ok' | 'failed'
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
  /**
   * The Content-Encoding the body was read from, as the HTTP lane received it
   * (lower-cased codings in applied order, `x-gzip` read as `gzip`), or
   * `identity` when it had none: what was decoded before `rawSha256` was
   * taken. Null when no body was read, and in the browser and provider lanes.
   * Added to v1 later (EVIDENCE_RECORD_ADDED_KEYS).
   */
  contentEncoding: string | null
  outputSha256: EvidenceOutputSha256
  extractor: EvidenceExtractor
  /** JSON Pointer into `json.data` → where that value was read; null when JSON was not requested. */
  fieldEvidence: Readonly<Record<string, EvidenceFieldLocation>> | null
  artifacts: readonly EvidenceArtifact[]
  /** `host:port` of the operator's environment proxy the request went through; null when it went direct or the lane does not report its route. */
  proxy: string | null
  identity: EvidenceIdentity
  /**
   * The request's `actions` that ran on the page before it was read, in order,
   * with their outcome; null when the request had none. The hashes above are
   * of the page as the steps left it, and `scriptRan` says when a script of
   * the caller's ran in it, so its content may be the script's.
   */
  pageActions: EvidencePageActions | null
  /** How the result was reached (EvidenceAccess). Added to v1 later (EVIDENCE_RECORD_ADDED_KEYS). */
  access: EvidenceAccess
  /** The result judged against the request's task contract (ADR 0006). Added to v1 later (EVIDENCE_RECORD_ADDED_KEYS). */
  verification: EvidenceVerification
  /** Whether the page was ready for its task when it was read (Readiness, ADR 0007). Added to v1 later (EVIDENCE_RECORD_ADDED_KEYS). */
  readiness: EvidenceReadiness
}

/** A result's verification against its task contract, without the checks' sentences: enough to know whether the task was done and which checks failed. */
export interface EvidenceVerification {
  status: 'passed' | 'failed' | 'not_requested'
  /** The verifier's version; null when no contract was given. */
  verifier: string | null
  /** SHA-256 of the contract's canonical JSON; null when no contract was given. */
  contractSha256: string | null
  reason: 'checks_failed' | 'page_not_read' | 'empty_not_allowed' | null
  /** The type of each check that failed, in the contract's order. */
  failed: string[]
}

/** The result's readiness (Readiness in result.ts): its state and the signal codes it was read from, without the wait. */
export interface EvidenceReadiness {
  state: ReadinessState
  basis: readonly string[]
}

/** The argument must list every key of T once: a missing or unknown key fails to compile. */
type EveryKey<T, K extends readonly PropertyKey[]> =
  [Exclude<keyof T, K[number]>, Exclude<K[number], keyof T>] extends [never, never] ? unknown : never
const keysOf = <T>() => <const K extends readonly (keyof T)[]>(keys: K & EveryKey<T, K>): K => keys

/** Field order of the record and of each nested object, as in the schema file. */
export const EVIDENCE_RECORD_KEYS = {
  record: keysOf<EvidenceRecord>()(['schemaVersion', 'requestedUrl', 'finalUrl', 'redirectChain', 'fetchedAt', 'httpStatus', 'status', 'reason', 'lane', 'robotsDecision', 'rawSha256', 'contentEncoding', 'outputSha256', 'extractor', 'fieldEvidence', 'artifacts', 'proxy', 'identity', 'pageActions', 'access', 'verification', 'readiness']),
  redirectChain: keysOf<EvidenceRedirectChain>()(['urls', 'complete']),
  robotsDecision: keysOf<EvidenceRobotsDecision>()(['decision', 'robotsUrl', 'robotsSha256', 'unreachable', 'crawlDelayMs', 'userOverride', 'overrideBasis']),
  outputSha256: keysOf<EvidenceOutputSha256>()(['markdown', 'json']),
  extractor: keysOf<EvidenceExtractor>()(['name', 'version', 'commit']),
  fieldEvidence: keysOf<EvidenceFieldLocation>()(['source', 'locator']),
  artifact: keysOf<EvidenceArtifact>()(['kind', 'path', 'sha256', 'bytes', 'contentType']),
  identity: keysOf<EvidenceIdentity>()(['userAgent', 'mode', 'contact', 'device', 'requestHeaders']),
  pageActions: keysOf<EvidencePageActions>()(['steps', 'scriptRan']),
  pageActionStep: keysOf<EvidencePageActionStep>()(['type', 'outcome']),
  requestHeader: keysOf<EvidenceRequestHeader>()(['name', 'valueSha256']),
  access: keysOf<EvidenceAccess>()(['route', 'executor', 'executorVersion', 'profile', 'externalCostUsd', 'completion', 'egress', 'session', 'paidCalls', 'grant']),
  accessEgress: keysOf<EvidenceAccessEgress>()(['proxy', 'source', 'switchedFrom', 'exit']),
  accessEgressExit: keysOf<EvidenceAccessEgressExit>()(['ip', 'country', 'observedAt']),
  accessSession: keysOf<EvidenceAccessSession>()(['id']),
  accessPaidCall: keysOf<EvidencePaidCall>()(['provider', 'rung', 'capabilities', 'ceilingUsd', 'chargedUsd', 'reportedCostUsd', 'sessionMs', 'outcome', 'reason', 'answer']),
  accessGrant: keysOf<EvidenceAccessGrant>()(['sha256', 'tier', 'attestedAt']),
  verification: keysOf<EvidenceVerification>()(['status', 'verifier', 'contractSha256', 'reason', 'failed']),
  readiness: keysOf<EvidenceReadiness>()(['state', 'basis']),
} as const

/**
 * Keys added to v1 after it was first published: optional in the schema, so
 * that records written before them stay valid, though W2L always writes them.
 */
export const EVIDENCE_RECORD_ADDED_KEYS: Partial<Record<keyof typeof EVIDENCE_RECORD_KEYS, readonly string[]>> = {
  record: ['contentEncoding', 'pageActions', 'access', 'verification', 'readiness'],
  artifact: ['bytes', 'contentType'],
  identity: ['device', 'requestHeaders'],
  robotsDecision: ['overrideBasis'],
  access: ['completion', 'egress', 'session', 'paidCalls', 'grant'],
  accessEgress: ['exit'],
  accessPaidCall: ['sessionMs'],
}
