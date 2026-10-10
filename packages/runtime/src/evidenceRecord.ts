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
  RESULT_STATUS,
  declaredContact,
  type ActionsResult,
  type CrawlMode,
  type AccessCompletion,
  type EvidenceAccess,
  type EvidenceAccessEgress,
  type EvidenceAccessGrant,
  type EvidenceAccessSession,
  type EvidenceVerification,
  type EvidencePaidCall,
  type EvidenceArtifact,
  type EvidenceFieldLocation,
  type EvidencePageActions,
  type EvidenceRecord,
  type EvidenceRequestHeader,
  type EvidenceRobotsDecision,
  type FetchResult,
  type FileDescription,
  type JsonValue,
  type Lane,
  type PageActionType,
  type RobotsOverrideBasis,
  type RobotsUnreachable,
  type ScreenshotEvidence,
  type StructuredExtractionResult,
  type TraceEvent,
} from '@w2l/contracts'
import { EXTRACTOR_VERSION, FILE_TEXT_VERSION, PDF_TEXT_VERSION } from '@w2l/extract-tf'
import { sha256Utf8 } from '@w2l/http-core'
import { readinessOf } from './readiness.js'

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

/**
 * Lanes that request every redirect hop themselves, and so list each; the
 * browser lane says so on its evidence (`redirectChainComplete`).
 */
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
    redirectChain: { urls, complete: evidence.redirectChainComplete ?? EVERY_HOP_LANES.has(result.lane) },
    fetchedAt: evidence.fetchedAt ?? null,
    httpStatus,
    status: result.status,
    reason: result.failureReason ?? result.blockReason ?? result.budgetExceeded ?? null,
    lane: result.lane,
    robotsDecision: robotsDecision(result),
    rawSha256: evidence.rawBodySha256 ?? null,
    contentEncoding: evidence.contentEncoding ?? null,
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
    artifacts: evidence.artifacts.map(path => artifact(path, result.file, result.screenshot ?? undefined, result.actions)),
    proxy: evidence.envProxy ?? null,
    identity: {
      userAgent,
      mode: result.compliance?.mode ?? identityEvent(result.trace)?.mode ?? request.mode,
      contact: userAgent === null ? null : declaredContact(userAgent),
      device: requested ? declaredDevice(result) : null,
      requestHeaders: requested ? sentCustomHeaders(result) : null,
    },
    pageActions: pageActions(result),
    access: evidenceAccess(result),
    verification: evidenceVerification(result),
    readiness: evidenceReadiness(result),
  }
}

/** The result's readiness as the record states it: its state and basis, without the wait (ADR 0007). */
function evidenceReadiness(result: FetchResult): EvidenceRecord['readiness'] {
  const { state, basis } = readinessOf(result)
  return { state, basis: [...basis] }
}

/**
 * How the result was reached, from its lane and the events its lane recorded: the HTTP lane's
 * `transport` (the compatible transport sent the request), the browser lane's `browser_engine`
 * (Patchright; stock Playwright records none) and `session_attached` (a saved login), the person's
 * browser's `user_browser_read`, the provider's `provider_selected`. A result no lane produced (the
 * ladder's own for a rung the deadline cut, that threw or whose identity was refused, a lockdown
 * miss) records no lane identity: its route and client are null. A cache hit states the cost of the
 * fetch it reuses, which its `cache_hit` event carries. A fact the result did not record is null.
 */
/** Statuses a page was read with: the result carries content, or the page verifiably has none. */
const READ_STATUSES: ReadonlySet<string> = new Set(['success', 'partial', 'empty_verified'])

function evidenceAccess(result: FetchResult): EvidenceAccess {
  const event = (name: string) => result.trace.find((e) => e.event === name)?.detail
  const text = (value: unknown) => (typeof value === 'string' && value !== '' ? value : null)
  const hit = event('cache_hit')
  const stored = hit?.externalCostUsd
  const externalCostUsd = hit === undefined ? result.usage.externalCostUsd ?? null : typeof stored === 'number' ? stored : null
  const read = READ_STATUSES.has(result.status)
  // W2L's own lanes record the proxy they leave through and the task session they read with; a vendor and the person's browser do not say.
  const own = (r: EvidenceAccess['route']) => r === 'http' || r === 'http_compat' || r === 'browser' || r === 'enhanced_browser' || r === 'authed_browser'
  const laneEvent = (name: string) => [...result.trace].reverse().find((e) => e.event === name && sameLaneFamily(e.lane, result.lane))?.detail
  const egress = (r: EvidenceAccess['route']): EvidenceAccessEgress | null => {
    if (!own(r)) return null
    const proxy = laneEvent('egress_proxy')
    // No proxy event: direct only when a page response proves a request was sent; a lane that stopped before one
    // (robots, an address check, a deadline) leaves the egress unknown.
    if (proxy === undefined) return typeof result.evidence.httpStatus === 'number' ? { proxy: null, source: 'direct', switchedFrom: null, exit: null } : null
    // The task may have moved twice before this page was read; the last move names where it came from.
    const moved = [...result.trace].reverse().find((e) => e.event === 'egress_switched')?.detail
    const source = proxy.source === 'environment' ? 'environment' : 'pool'
    // Where the pool egress leaves from, when the engine asked its echo URL (egress_exit) for this very proxy.
    const seen = source === 'pool' ? [...result.trace].reverse().find((e) => e.event === 'egress_exit' && e.detail?.proxy === proxy.proxy)?.detail : undefined
    const ip = text(seen?.ip)
    const observedAt = text(seen?.observedAt)
    const exit = ip === null || observedAt === null ? null : { ip, country: text(seen?.country), observedAt }
    return { proxy: text(proxy.proxy), source, switchedFrom: text(moved?.from), exit }
  }
  const session = (r: EvidenceAccess['route']): EvidenceAccessSession | null => {
    const id = own(r) ? text(laneEvent('session_cookies')?.session) : null
    return id === null ? null : { id }
  }
  const paid = paidCalls(result.trace)
  const route = (r: EvidenceAccess['route'], executor: string | null, executorVersion: string | null = null, profile: string | null = null, completion: AccessCompletion = 'unattended'): EvidenceAccess =>
    ({ route: r, executor, executorVersion, profile, externalCostUsd, completion: read && r !== null ? completion : null, egress: egress(r), session: session(r), paidCalls: paid.calls, grant: paid.grant })
  const laneRan = result.trace.some((e) => e.event === 'identity_sent' || e.event === 'identity_declared' || e.event === 'provider_selected')
  if (!laneRan) return route(null, null)
  // A page read in the person's Chrome: handed to them when it showed a check and they acted in its tab; theirs alone
  // otherwise, a check that cleared without a step of theirs included.
  const userBrowser = (detail: Record<string, unknown>) => route('user_browser', text(detail.browser), null, null, detail.sawGate != null && detail.act != null ? 'handed_to_person' : 'user_browser')
  switch (result.lane) {
    case 'http': {
      const transport = event('transport')
      return transport === undefined ? route('http', 'undici') : route('http_compat', text(transport.library), text(transport.version), text(transport.profile))
    }
    case 'browser_local':
    case 'browser_proxy': {
      const engine = event('browser_engine')
      if (event('session_attached') !== undefined) return route('authed_browser', 'playwright', null, null, 'authorized_session')
      return engine !== undefined && engine.engine === 'patchright' ? route('enhanced_browser', 'patchright', text(engine.version)) : route('browser', 'playwright')
    }
    case 'browser_local_authed': {
      const handed = event('user_browser_read')
      // A handoff's page: the person got through what stopped W2L.
      return handed === undefined ? route('authed_browser', 'playwright', null, null, 'authorized_session') : route('user_browser', text(handed.browser), null, null, 'handed_to_person')
    }
    case 'my_browser': {
      const opened = event('user_browser_read')
      return opened === undefined ? route(null, null) : userBrowser(opened)
    }
    case 'provider':
      return route('vendor', text(event('provider_selected')?.provider))
  }
}

/**
 * The paid provider calls the page was read with (ROADMAP PA item 4), from the `paid_calls` events the ladder puts on its
 * answer, a read given up for another egress first; for a cache hit, those of the fetch it reuses. A call recorded in
 * any other shape is left out, never guessed at. Null, and no grant, when there are none.
 */
function paidCalls(trace: readonly TraceEvent[]): { calls: EvidencePaidCall[] | null; grant: EvidenceAccessGrant | null } {
  const usd = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0
  const text = (value: unknown): value is string => typeof value === 'string' && value !== ''
  const calls: EvidencePaidCall[] = []
  let grant: EvidenceAccessGrant | null = null
  for (const event of trace) {
    if (event.event !== 'paid_calls') continue
    for (const call of Array.isArray(event.detail?.calls) ? (event.detail.calls as Record<string, unknown>[]) : []) {
      const { provider, rung, capabilities, ceilingUsd, chargedUsd, reportedCostUsd, sessionMs, outcome, reason, answer } = call
      if (!text(provider) || !text(rung) || !Array.isArray(capabilities) || !capabilities.every(text) || !usd(ceilingUsd) || !usd(chargedUsd)) continue
      if (!(reportedCostUsd === null || usd(reportedCostUsd)) || !(outcome === null || (RESULT_STATUS as readonly unknown[]).includes(outcome)) || !(reason === null || text(reason)) || typeof answer !== 'boolean') continue
      // A measured session time is a whole number of milliseconds; anything else (a trace from before it was kept) is null.
      const measured = typeof sessionMs === 'number' && Number.isInteger(sessionMs) && sessionMs >= 0 ? sessionMs : null
      calls.push({ provider, rung, capabilities, ceilingUsd, chargedUsd, reportedCostUsd, sessionMs: measured, outcome: outcome as EvidencePaidCall['outcome'], reason: reason as EvidencePaidCall['reason'], answer })
    }
    const named = event.detail?.grant as Record<string, unknown> | null | undefined
    if (named != null && text(named.tier) && (named.sha256 === null || (typeof named.sha256 === 'string' && /^[0-9a-f]{64}$/.test(named.sha256))) && (named.attestedAt === null || text(named.attestedAt))) {
      grant = { sha256: named.sha256 as string | null, tier: named.tier, attestedAt: named.attestedAt as string | null }
    }
  }
  return calls.length === 0 ? { calls: null, grant: null } : { calls, grant }
}

/** The steps that ran on the page, from the lane's own `action` trace events; null when the request had none. */
function pageActions(result: FetchResult): EvidencePageActions | null {
  if (result.actions === undefined) return null
  const ran = result.trace
    .filter((event) => event.event === 'action')
    .map((event) => ({ type: event.detail?.type as PageActionType, outcome: event.detail?.outcome === 'ok' ? 'ok' as const : 'failed' as const }))
  // The result's own verdict on the steps wins: a navigation stopped after a step's event was written fails that step.
  const failed = result.actions.failed
  const steps = failed === undefined ? ran : [...ran.slice(0, failed.index), { type: failed.type, outcome: 'failed' as const }]
  return { steps, scriptRan: ran.some((step) => step.type === 'executeJavascript') }
}

/** The lanes whose identity events a result's own lane answers for: the browser lanes record theirs as `browser_local`. */
function sameLaneFamily(a: Lane, b: Lane): boolean {
  return a === b || (a.startsWith('browser') && b.startsWith('browser'))
}

/** The device the answering lane's identity declared (`identity_sent` on the HTTP lane, `identity_declared` on browser lanes); null when it recorded none. */
function declaredDevice(result: FetchResult): 'desktop' | 'mobile' | null {
  const event = [...result.trace].reverse().find(item => (item.event === 'identity_sent' || item.event === 'identity_declared') && sameLaneFamily(item.lane, result.lane))
  const device = event?.detail?.device
  return device === 'desktop' || device === 'mobile' ? device : null
}

/** The caller's custom headers the answering lane sent (`request_headers_added`), sorted by name, each value as its SHA-256; empty when it sent none. */
function sentCustomHeaders(result: FetchResult): EvidenceRequestHeader[] {
  const event = [...result.trace].reverse().find(item => item.event === 'request_headers_added' && sameLaneFamily(item.lane, result.lane))
  const headers = Array.isArray(event?.detail?.headers) ? event.detail.headers as { name?: unknown; value?: unknown }[] : []
  return headers
    .filter((header): header is { name: string; value: string } => typeof header.name === 'string' && typeof header.value === 'string')
    .map(({ name, value }) => ({ name: name.toLowerCase(), valueSha256: sha256Utf8(value) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** `W2L_SOURCE_COMMIT` when it is a commit hash (7 to 40 hex digits), else unknown. */
export function sourceCommitFromEnv(): string | null {
  const value = process.env.W2L_SOURCE_COMMIT?.trim().toLowerCase() ?? ''
  return /^[0-9a-f]{7,40}$/.test(value) ? value : null
}

/** The result's verification without the checks' sentences (EvidenceVerification): a result that carries none was not verified. */
function evidenceVerification(result: FetchResult): EvidenceVerification {
  const v = result.verification
  if (v === undefined || v.status === 'not_requested') return { status: 'not_requested', verifier: null, contractSha256: null, reason: null, failed: [] }
  return { status: v.status, verifier: v.verifier, contractSha256: v.contractSha256, reason: v.reason, failed: v.checks.filter((check) => check.passed === false).map((check) => check.type) }
}

/**
 * RFC 8785 canonical JSON for the values W2L emits: object keys sorted by
 * UTF-16 code units at every level, no whitespace, JSON.stringify for strings
 * and numbers. Undefined members are left out, as JSON.stringify does.
 */
export function canonicalJson(value: JsonValue): string {
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
      // An override set the disallow aside; the record carries it and on whose word.
      userOverride: signed.override !== undefined,
      overrideBasis: signed.override === undefined ? null : signed.override.basis ?? 'robots_override',
    }
  }
  const detail = [...result.trace].reverse().find(event => event.event === 'robots_checked')?.detail
  const overridden = result.trace.find(event => event.event === 'robots_overridden')
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
    // The HTTP lane mints no record; its trace says when an override set the disallow aside, and on whose word.
    userOverride: overridden !== undefined,
    overrideBasis: overridden === undefined ? null : overrideBasisOf(overridden.detail?.basis),
  }
}

/** A `robots_overridden` event's basis; an event written before bases existed was the caller's recorded override. */
function overrideBasisOf(value: unknown): RobotsOverrideBasis {
  return value === 'user_named_url' || value === 'ignore_robots_txt' ? value : 'robots_override'
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
 * The file the result describes (`file.path`), saved as received; the
 * screenshot it carries (`screenshot.path`), with its size and type; a raw
 * snapshot, saved as `<sha256 of its bytes>.html` (bench captureRawHtml),
 * whose size and type are not recorded; any other file is not known here.
 */
function artifact(path: string, file: FileDescription | undefined, screenshot: ScreenshotEvidence | undefined, actions?: ActionsResult): EvidenceArtifact {
  if (file !== undefined && file.path === path) return { kind: 'file', path, sha256: file.sha256, bytes: file.bytes, contentType: file.contentType }
  const shot = [...(screenshot === undefined ? [] : [screenshot]), ...(actions?.screenshots ?? [])].find((item) => item.path === path)
  if (shot !== undefined) return { kind: 'screenshot', path, sha256: shot.sha256, bytes: shot.bytes, contentType: shot.contentType }
  // A pdf step's file: no kind of v1 names a printed page, so it is listed with its hash and type.
  const pdf = actions?.pdfs.find((item) => item.path === path)
  if (pdf !== undefined) return { kind: null, path, sha256: pdf.sha256, bytes: pdf.bytes, contentType: pdf.contentType }
  const hash = /(?:^|[\\/])([0-9a-f]{64})\.html$/.exec(path)?.[1]
  return hash === undefined ? { kind: null, path, sha256: null, bytes: null, contentType: null } : { kind: 'snapshot', path, sha256: hash, bytes: null, contentType: null }
}
