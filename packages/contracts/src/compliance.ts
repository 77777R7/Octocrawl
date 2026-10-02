/**
 * Honest-mode identity + provable-compliance record contracts.
 *
 * Two things live here, and they are deliberately separated:
 *
 *  1. `CrawlMode` — the product's mode switch, inverted. Every mode is *true*:
 *     it declares who the crawler is and what compliance it promises. There is
 *     no stealth mode and no "lie a little" tier; the empirical probe showed
 *     the honest arm (aligned client hints) already outperforms the stealth arm
 *     (see packages/bench research notes), so a covert mode would carry §1201
 *     exposure with no performance upside.
 *
 *  2. `ComplianceRecord` — the premium tier: a tamper-evident, signable record
 *     of *what the crawler actually did* (robots.txt decision, the exact
 *     headers it sent, the rate-limit facts), so a third party — publisher,
 *     enterprise buyer, court — can verify the claim rather than take it on
 *     faith. This is the buyer-side attestation cell the market research found
 *     empty: TollBit/x402/RSL/Cloudflare all sell to *publishers*; nobody sells
 *     the crawler a machine-verifiable record of its own compliance.
 *
 * This package stays types-only (no crypto, no I/O). The signing primitive is
 * an abstract `ComplianceSigner` implemented in http-core or a leaf package;
 * contracts only carries the opaque signature triple.
 *
 * Honesty invariant baked into the type: a record's `mode` is the single source
 * of truth for the *declared* identity, and the `sentHeaders` fact records the
 * bytes actually on the wire. A mismatch between the two is detectable from the
 * signed record alone — which is the point.
 */

import type { Lane } from './status.js'
import type { AccessFact } from './access.js'
import type { NetworkPolicy } from './policy.js'

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

/**
 * The honest-mode switch. `mode` names an identity + compliance policy; the
 * runtime derives a `Lane` (execution tier) and a concrete user-agent from it.
 */
export type CrawlMode = 'research' | 'standard' | 'authed' | 'proxy'

/**
 * The two declared browser identities. `desktop` is the one every browser
 * mode has always sent; `mobile` (`mobile: true` on a request) is a second
 * declared identity, Android Chrome with aligned hints and a phone viewport,
 * that passes the same coherence and honesty checks. Neither is a statement
 * about the host: the desktop identity claims macOS on any machine and the
 * mobile one Android on desktop Chromium, each internally coherent.
 */
export type IdentityDevice = 'desktop' | 'mobile'

/** Canonical UA shape per mode. Values live in http-core/bench (ua.ts), not here. */
export interface ModeIdentity {
  mode: CrawlMode
  /**
   * The exact User-Agent string the mode declares. The runtime must send this
   * verbatim — a differing UA is a lie the signed record exposes.
   */
  userAgent: string
  /**
   * Client-hint headers aligned to the UA, e.g. sec-ch-ua / sec-ch-ua-platform
   * / sec-ch-ua-mobile. Alignment — not stealth — is what avoids the
   * HeadlessChrome block signal; an inconsistent set is a bug, not a disguise.
   */
  clientHints: Readonly<Record<string, string>>
  /**
   * Whether the mode claims to respect robots.txt. All four modes are true:
   * login (`authed`) and egress (`proxy`) do not waive robots. The record
   * captures the actual per-decision facts regardless, so a claim here that
   * the record's `robots` contradicts is a verifiable lie.
   */
  respectsRobots: boolean
  /**
   * Which of the two declared browser identities this is: the desktop one
   * (macOS Chrome) or the mobile one (Android Chrome, `mobile: true`). Absent
   * on the research identity, which declares a bot, not a device. The lanes
   * record it (`identity_sent.detail.device`, `identity_declared`); the
   * compliance record (schemaVersion 2) has no field for it and carries the
   * device in its as-sent `sentHeaders` instead.
   */
  device?: IdentityDevice
  /**
   * The lane this mode resolves to. Modes are policy, lanes are execution:
   *   research → browser_local (declared bot identity)
   *   standard → browser_local (plain browser consistency)
   *   authed   → browser_local_authed (owned login state)
   *   proxy    → browser_proxy (BYO egress; compliance responsibility is the
   *              operator's, and the record still captures the facts)
   */
  lane: Lane
}

// ---------------------------------------------------------------------------
// Concrete identities — one per mode, every mode true
// ---------------------------------------------------------------------------

/**
 * The declared-bot identity (`research`). No client hints: a UA that says
 * "compatible; w2l-research" must not simultaneously claim to be Chromium via
 * sec-ch-ua — that contradiction is the inconsistency the probe showed gets a
 * request blocked, and it is exactly the lie the signed record exposes.
 */
const RESEARCH_UA_COMMENT = 'compatible; w2l-research/0.1; +https://github.com/77777R7/w2l; research benchmark, one request per page'
export const RESEARCH_USER_AGENT = `Mozilla/5.0 (${RESEARCH_UA_COMMENT})`

/** Longest operator contact (`W2L_CONTACT`) the research User-Agent declares. */
export const MAX_CONTACT_LENGTH = 200

/**
 * Why a contact cannot go into the research User-Agent, or null when it can.
 * It becomes part of the User-Agent comment, so it is printable ASCII without
 * parentheses or backslashes, and never names a browser product: the
 * research identity is a declared bot.
 */
function contactIssue(contact: string): string | null {
  if (contact.length === 0 || contact.length > MAX_CONTACT_LENGTH) return `must be 1 to ${MAX_CONTACT_LENGTH} characters`
  if (!/^[\x20-\x7e]+$/.test(contact)) return 'must be printable ASCII'
  if (/[()\\]/.test(contact)) return 'must not contain parentheses or backslashes, which would end the User-Agent comment'
  if (/(?:Chrome|Chromium)\/|HeadlessChrome/.test(contact)) return 'must not name a browser product: research mode declares a bot'
  return null
}

/** The name research mode declares to SEC.gov, before the contact, in SEC's `<Company or name> <email>` format. */
export const SEC_DECLARED_NAME = 'W2L Research'

/** The robots.txt product token of both research User-Agent formats (RFC 9309 §2.2.1). */
export const RESEARCH_PRODUCT_TOKEN = 'w2l-research'

/**
 * Whether a host is sec.gov or one of its subdomains. SEC's fair-access
 * policy prescribes the declared User-Agent `<Company or name> <email>`, and
 * SEC.gov answers 403 to the research format even when it declares a contact.
 */
export function isSecHost(host: string): boolean {
  const name = host.toLowerCase().replace(/\.$/, '')
  return name === 'sec.gov' || name.endsWith('.sec.gov')
}

/**
 * The research-mode User-Agent. With the operator's contact (`W2L_CONTACT`,
 * such as a name and email address or a URL), it ends `; contact: <contact>)`:
 * publishers such as the SEC ask automated clients to declare one. To an SEC
 * host (`host`, see isSecHost) it is SEC's own format instead,
 * `W2L Research <contact>`.
 */
export function researchUserAgent(contact: string | null = null, host: string | null = null): string {
  if (contact === null) return RESEARCH_USER_AGENT
  const issue = contactIssue(contact)
  if (issue !== null) throw new Error(`W2L_CONTACT ${issue}.`)
  if (host !== null && isSecHost(host)) return `${SEC_DECLARED_NAME} ${contact}`
  return `Mozilla/5.0 (${RESEARCH_UA_COMMENT}; contact: ${contact})`
}

/** The contact a research-mode User-Agent declares, in either format (see researchUserAgent); null for any other User-Agent. */
export function declaredContact(userAgent: string): string | null {
  const prefix = `Mozilla/5.0 (${RESEARCH_UA_COMMENT}; contact: `
  if (userAgent.startsWith(prefix) && userAgent.endsWith(')')) return userAgent.slice(prefix.length, -1)
  const sec = userAgent.startsWith(`${SEC_DECLARED_NAME} `) ? userAgent.slice(SEC_DECLARED_NAME.length + 1) : null
  return sec !== null && contactIssue(sec) === null ? sec : null
}

/** Whether a User-Agent is one research mode declares, in either format. */
export function isResearchUserAgent(userAgent: string): boolean {
  return /\bw2l-research\b/.test(userAgent) || userAgent.startsWith(`${SEC_DECLARED_NAME} `)
}

/**
 * The text robots.txt `User-agent` lines are matched against for a
 * User-Agent W2L sends. SEC's format names no product token, so the research
 * token is added: a group for w2l-research governs research requests to
 * SEC.gov as it does on every other host.
 */
export function robotsAgent(userAgent: string): string {
  return userAgent.startsWith(`${SEC_DECLARED_NAME} `) ? `${userAgent} ${RESEARCH_PRODUCT_TOKEN}` : userAgent
}

/** The operator's contact from `W2L_CONTACT`, trimmed; null when unset or blank. The error never repeats the value. */
export function operatorContact(env: Readonly<Record<string, string | undefined>>): string | null {
  const contact = (env['W2L_CONTACT'] ?? '').trim()
  if (contact === '') return null
  const issue = contactIssue(contact)
  if (issue !== null) throw new Error(`W2L_CONTACT ${issue}.`)
  return contact
}

/** An operator policy whose research-mode requests declare `W2L_CONTACT`, when it is set. */
export function withOperatorContact(policy: NetworkPolicy, env: Readonly<Record<string, string | undefined>>): NetworkPolicy {
  const contact = operatorContact(env)
  return contact === null ? policy : { ...policy, contact }
}

/**
 * Floor used when no real browser version is known. Subjects driving real
 * Chromium MUST pass the actual `browser.version()` major instead — declaring
 * a Chrome version you are not running is an inconsistency, not a feature.
 */
export const CHROME_MAJOR_FLOOR = 128

/** Full Chrome UA for a given major, in the shape the probe's D arm used. */
export function browserUserAgent(chromeMajor: number): string {
  return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeMajor}.0.0.0 Safari/537.36`
}

/**
 * Client-hint headers aligned to the UA. The sec-ch-ua / sec-ch-ua-mobile /
 * sec-ch-ua-platform triple must quote the same major as the UA, and the
 * platform token must match what navigator.platform reports — an unaligned set
 * is the bug, not a disguise.
 *
 * `accept-language` is deliberately NOT here: it is not a client hint, it is
 * a normal header the browser derives from the context `locale`, and Chromium
 * normalizes it (dropping the `;q=` weight). Declaring it as a hint would
 * guarantee a declared-vs-sent mismatch on every fetch — so it stays under
 * `locale`/`BROWSER_FINGERPRINT`, where it is a setting, not a claim.
 */
export function browserClientHints(chromeMajor: number): Readonly<Record<string, string>> {
  return {
    'sec-ch-ua': `"Chromium";v="${chromeMajor}", "Google Chrome";v="${chromeMajor}", "Not;A=Brand";v="24"`,
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
  }
}

/**
 * The mobile Chrome UA of the second declared identity (`mobile: true`): a
 * Pixel 7 on Android 14, the same Chrome major as the desktop UA. Android on
 * desktop Chromium the way the desktop identity is macOS on any host:
 * internally coherent, not a statement about the machine.
 */
export function mobileBrowserUserAgent(chromeMajor: number): string {
  return `Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeMajor}.0.0.0 Mobile Safari/537.36`
}

/** Client hints aligned to the mobile UA: the same brands and major, `sec-ch-ua-mobile: ?1`, platform Android. */
export function mobileBrowserClientHints(chromeMajor: number): Readonly<Record<string, string>> {
  return {
    'sec-ch-ua': `"Chromium";v="${chromeMajor}", "Google Chrome";v="${chromeMajor}", "Not;A=Brand";v="24"`,
    'sec-ch-ua-mobile': '?1',
    'sec-ch-ua-platform': '"Android"',
  }
}

/**
 * The user-agent metadata Chromium derives its own client hints from
 * (`Emulation.setUserAgentOverride.userAgentMetadata`): the brands of
 * `sec-ch-ua` in the same order, the platform of `sec-ch-ua-platform`, the
 * mobile flag of `sec-ch-ua-mobile`. The browser lane sets it on every page
 * so that the hints Chromium generates itself, on a redirect hop and on the
 * page's own requests, where a context's extra headers do not reach, are the
 * declared ones rather than the headless shell's (`HeadlessChrome`), and so
 * that `navigator.userAgentData` says the same as the wire.
 */
export interface BrowserUserAgentMetadata {
  brands: readonly { brand: string; version: string }[]
  fullVersionList: readonly { brand: string; version: string }[]
  platform: string
  platformVersion: string
  architecture: string
  model: string
  mobile: boolean
}

/** The metadata behind the declared identity's client hints (browserClientHints, mobileBrowserClientHints), for a Chrome major and device. */
export function browserUserAgentMetadata(chromeMajor: number, device: IdentityDevice = 'desktop'): BrowserUserAgentMetadata {
  const brands = [
    { brand: 'Chromium', version: String(chromeMajor) },
    { brand: 'Google Chrome', version: String(chromeMajor) },
    { brand: 'Not;A=Brand', version: '24' },
  ]
  return {
    brands,
    fullVersionList: brands.map(({ brand, version }) => ({ brand, version: `${version}.0.0.0` })),
    platform: device === 'mobile' ? 'Android' : 'macOS',
    platformVersion: device === 'mobile' ? '14.0.0' : '10.15.7',
    architecture: device === 'mobile' ? '' : 'x86',
    model: device === 'mobile' ? 'Pixel 7' : '',
    mobile: device === 'mobile',
  }
}

/** The `sec-ch-ua` value Chromium serializes from `brands`, so the metadata and the declared hint can be compared. */
export function serializeBrands(brands: readonly { brand: string; version: string }[]): string {
  return brands.map(({ brand, version }) => `"${brand}";v="${version}"`).join(', ')
}

/**
 * Fingerprint context fields that must match the UA for a consistent browser
 * identity: applied to the Playwright context by the subject, kept here so
 * the values are single-sourced with the UA rather than drifted per subject.
 */
export interface BrowserFingerprint {
  locale: string
  timezoneId: string
  viewport: { width: number; height: number }
  screen: { width: number; height: number }
  deviceScaleFactor: number
  /** Whether the context reports a mobile device (`navigator.maxTouchPoints`, the viewport meta); false for the desktop identity. */
  isMobile: boolean
  hasTouch: boolean
}

/** The desktop identity's fingerprint. */
export const BROWSER_FINGERPRINT: Readonly<BrowserFingerprint> = {
  locale: 'en-US',
  timezoneId: 'America/Los_Angeles',
  viewport: { width: 1280, height: 800 },
  screen: { width: 1920, height: 1080 },
  deviceScaleFactor: 2,
  isMobile: false,
  hasTouch: false,
}

/** The mobile identity's fingerprint: a 412x915 phone viewport at 2.625 device pixels per CSS pixel, touch, the same locale and time zone. */
export const MOBILE_BROWSER_FINGERPRINT: Readonly<BrowserFingerprint> = {
  locale: 'en-US',
  timezoneId: 'America/Los_Angeles',
  viewport: { width: 412, height: 915 },
  screen: { width: 412, height: 915 },
  deviceScaleFactor: 2.625,
  isMobile: true,
  hasTouch: true,
}

/** The fingerprint of a declared browser identity; the desktop one for an identity that declares no device (research). */
export function browserFingerprintFor(device: IdentityDevice | undefined): Readonly<BrowserFingerprint> {
  return device === 'mobile' ? MOBILE_BROWSER_FINGERPRINT : BROWSER_FINGERPRINT
}

/**
 * The identity for a mode. `standard`, `authed`, and `proxy` share one
 * consistent-browser identity (they differ only in execution lane — session,
 * egress), the desktop one unless `device` asks for the mobile one;
 * `research` is the declared bot with no client hints and no device,
 * declaring the operator's `contact` when there is one, in the format the
 * page's `host` asks for (see researchUserAgent).
 */
export function modeIdentity(mode: CrawlMode, chromeMajor: number = CHROME_MAJOR_FLOOR, contact: string | null = null, host: string | null = null, device: IdentityDevice = 'desktop'): ModeIdentity {
  const userAgent = device === 'mobile' ? mobileBrowserUserAgent(chromeMajor) : browserUserAgent(chromeMajor)
  const clientHints = device === 'mobile' ? mobileBrowserClientHints(chromeMajor) : browserClientHints(chromeMajor)
  switch (mode) {
    case 'research':
      return { mode, userAgent: researchUserAgent(contact, host), clientHints: {}, respectsRobots: true, lane: 'browser_local' }
    case 'standard':
      return { mode, userAgent, clientHints, respectsRobots: true, lane: 'browser_local', device }
    case 'authed':
      return { mode, userAgent, clientHints, respectsRobots: true, lane: 'browser_local_authed', device }
    case 'proxy':
      return { mode, userAgent, clientHints, respectsRobots: true, lane: 'browser_proxy', device }
  }
}

/**
 * The product token the hosted public preview adds to the standard
 * User-Agent, so a site owner can see the preview in their logs and address
 * it in robots.txt with `User-agent: octocrawl-preview` (or `octocrawl`).
 * Groups match by substring of the whole User-Agent (http-core
 * matchRobotsGroup); `*` still applies when no group names it. The token used
 * to be `W2L-Preview/1.0`, so a group for `w2l-preview` or `w2l` no longer
 * governs the preview.
 */
export const PREVIEW_PRODUCT_TOKEN = 'OctoCrawl-Preview/1.0 (+https://octocrawl.dev)'

/**
 * The hosted preview's identity: the standard identity with
 * PREVIEW_PRODUCT_TOKEN appended. The client hints stay as they are: they
 * describe the Chrome that sends the request, and the token names no browser.
 * Only the standard identity takes the token.
 */
export function previewIdentity(identity: ModeIdentity): ModeIdentity {
  if (identity.mode !== 'standard') throw new Error(`the preview product token is for the standard identity, not ${identity.mode}`)
  return { ...identity, userAgent: `${identity.userAgent} ${PREVIEW_PRODUCT_TOKEN}` }
}

/** All four identities, for the subject layer to enumerate without a switch. */
export const MODE_IDENTITIES: Readonly<Record<CrawlMode, ModeIdentity>> = {
  research: modeIdentity('research'),
  standard: modeIdentity('standard'),
  authed: modeIdentity('authed'),
  proxy: modeIdentity('proxy'),
}

// ---------------------------------------------------------------------------
// Compliance facts
// ---------------------------------------------------------------------------

/** Why robots.txt could not be fetched: a 5xx, a network failure, or the lookup's own deadline. */
export type RobotsUnreachable = 'server_error' | 'network_error' | 'timeout'

/**
 * A caller's recorded decision to fetch one URL although its host's
 * robots.txt disallows it: a researcher fetching a report the publisher links
 * publicly from a CDN host whose rules address crawlers. It is never a blanket
 * switch; it names one URL, carries a reason, and everything about it (the
 * rule it set aside, the reason, who recorded it) goes into the trace, the
 * result's warnings and, in a lane that mints one, the compliance record, so
 * the fetch stays citable.
 */
export interface RobotsOverride {
  /** Why this URL may be fetched despite the rule, in the caller's words. */
  reason: string
  /** Who recorded the decision, when the caller wants that on the record. */
  recordedBy?: string
}

/**
 * The outcome of consulting robots.txt for a single target URL. One record per
 * fetch. `consulted` distinguishes "we checked and it said X" from "there was
 * nothing to check" — a record that skips the check must say so, never pretend.
 */
export interface RobotsDecision {
  /** The robots.txt URL consulted, e.g. `https://site.example/robots.txt`. */
  robotsUrl: string | null
  /** sha256 of the robots.txt bytes actually parsed, for drift verification. */
  robotsSha256: string | null
  /**
   * Which user-agent group matched. Null when robots.txt was absent or had no
   * group for this UA — recorded as a fact, not an assumption.
   */
  matchedUserAgentGroup: string | null
  /** The compiled rules that fired for this path, most-specific first. */
  appliedRules: readonly { pattern: string; allow: boolean }[]
  /** Final decision: allowed, disallowed, or no-robots (nothing consulted). */
  decision: 'allowed' | 'disallowed' | 'no_robots'
  /** When disallowed, whether the fetch was skipped because of it. */
  skippedFetch: boolean
  crawlDelayMs?: number | null
  /**
   * Set only when robots.txt could not be fetched. RFC 9309 §2.3.1.4 then
   * requires assuming a complete disallow: `decision` is `disallowed` with no
   * rules and no robots.txt hash, and this reason tells it apart from a
   * disallow the publisher wrote. A 4xx is not unreachable: it means no
   * robots.txt, and `decision` is `no_robots`.
   */
  unreachable?: RobotsUnreachable
  /**
   * Present when a disallow the publisher wrote was set aside by a recorded
   * decision: the fetch went ahead (`skippedFetch: false`) and this says on
   * whose word. Never set for an unreachable robots.txt.
   */
  override?: RobotsOverride
}

/**
 * What actually went on the wire. Sorted by header name, lowercased names.
 * Captured as-sent — including any header that would contradict the mode.
 */
export interface SentHeadersFact {
  /** Exact request headers, lowercased names, sorted. Empty when not captured. */
  headers: readonly { name: string; value: string }[]
}

/**
 * The rate-limit facts for this fetch relative to the preceding fetch to the
 * same host. The record asserts the *measured* facts; non-compliance is
 * recorded honestly as `compliant: false`, never omitted.
 */
export interface RateLimitFact {
  /** Same-host previous request timestamp, epoch ms. Null on first request. */
  previousRequestAtMs: number | null
  /** Delay actually observed before this request, ms. Null on first request. */
  observedDelayMs: number | null
  /** The policy minimum delay for this host at the time. */
  requiredDelayMs: number
  /** True iff observedDelayMs >= requiredDelayMs (or first request). */
  compliant: boolean
  /** Requests to this host within the last second, for burst verification. */
  recentSameHostCount: number
}

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

/** A single fetch's compliance record. Tamper-evident via the content hash. */
export interface ComplianceRecord {
  /** Schema version, bumped on breaking shape change. v2 added `access`. */
  schemaVersion: 2
  /** Opaque id, unique per fetch. */
  recordId: string
  /** The mode under which the fetch ran. Bind's the declared identity. */
  mode: CrawlMode
  /** The URL that was requested (pre-redirect). */
  requestedUrl: string
  /** Final URL after redirects; null if the fetch never completed. */
  finalUrl: string | null
  /** ISO timestamp of the request. */
  requestedAt: string
  robots: RobotsDecision
  sentHeaders: SentHeadersFact
  rateLimit: RateLimitFact
  /**
   * Whose network and whose session this fetch used, and who accepted
   * responsibility for that. Credential-free by construction (see access.ts:
   * proxy passwords and cookie values appear only as hashes). Always present —
   * operator-owned access is stated explicitly, because "we did not record
   * this" and "this was ours" are different claims.
   */
  access: AccessFact
  /**
   * Hash of the previous record in the run's chain, hex. Null for the first
   * record. Chaining makes deletion or reordering of a run's history evident.
   */
  prevRecordHash: string | null
  /** sha256 of the canonical serialization of everything above. */
  contentHash: string
  /**
   * Opaque signature triple, produced by a `ComplianceSigner`. Absent until a
   * signer is configured — an unsigned record is still a record, just not a
   * verifiable one. contracts does not import crypto; the signer lives in a
   * leaf package.
   */
  signature: {
    scheme: string
    keyId: string
    value: string
  } | null
}

/**
 * A whole run's compliance ledger: the ordered chain of per-fetch records.
 * `records[i].prevRecordHash` must equal `records[i-1].contentHash`.
 */
export interface ComplianceLedger {
  runId: string
  /** The mode policy in effect for this run, for record-set verification. */
  mode: CrawlMode
  records: readonly ComplianceRecord[]
}

/**
 * Abstract signer. Implemented where keys live (leaf package); `contracts`
 * stays crypto-free so this interface is the seam, not a dependency.
 */
export interface ComplianceSigner {
  readonly scheme: string
  readonly keyId: string
  /** Produce a signature over `contentHash` (hex). */
  sign(contentHash: string): Promise<{ value: string }>
  /** Verify a signature produced by a possibly-different signer. */
  verify(contentHash: string, signature: string): Promise<boolean>
}

// ---------------------------------------------------------------------------
// Honesty check
// ---------------------------------------------------------------------------

/**
 * Whether the identity a mode *declared* matches the headers that were
 * actually sent. This is the load-bearing check: a record that declares
 * `userAgent: chromeUA` while the wire carried the default `HeadlessChrome`
 * UA is a lie, and the whole point of the record is that such a lie is
 * detectable from the signed bytes alone.
 */
export interface HonestyVerdict {
  honest: boolean
  /** Human-readable mismatches, empty when honest. Never silent on a miss. */
  mismatches: readonly string[]
}

/**
 * Compare a declared identity against the actual sent headers. `sentHeaders`
 * is the as-sent fact the record already carries; the declared `userAgent` and
 * `clientHints` come from the mode. A mismatch is reported, not papered over —
 * the fix is to align the context, not to widen the check.
 */
export function checkIdentityHonesty(
  identity: ModeIdentity,
  sent: SentHeadersFact,
): HonestyVerdict {
  const byName = new Map(sent.headers.map((h) => [h.name.toLowerCase(), h.value]))
  const mismatches: string[] = []

  const sentUa = byName.get('user-agent')
  if (sentUa === undefined) {
    mismatches.push('user-agent: not sent')
  } else if (sentUa !== identity.userAgent) {
    mismatches.push(`user-agent: declared "${identity.userAgent}" but sent "${sentUa}"`)
  }

  for (const [name, declared] of Object.entries(identity.clientHints)) {
    const sentValue = byName.get(name.toLowerCase())
    if (sentValue === undefined) {
      mismatches.push(`${name}: declared but not sent`)
    } else if (sentValue !== declared) {
      mismatches.push(`${name}: declared "${declared}" but sent "${sentValue}"`)
    }
  }

  return { honest: mismatches.length === 0, mismatches }
}
