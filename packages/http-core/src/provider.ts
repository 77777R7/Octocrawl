/**
 * Provider gate: the policy that decides whether we may hand a URL to a
 * third-party fetching provider (Browserbase, Steel, Scrapling, …).
 *
 * The strategic reason providers exist here at all: we will never self-develop
 * a C++-level anti-detection layer. When a target's defences exceed what an
 * honest client can pass, the answer is to route to a vendor whose whole
 * business is that fight, and for our system to do scheduling and acceptance —
 * not to grow a stealth layer of our own.
 *
 * The compliance reason this module exists: routing does not launder robots.
 * If a provider fetches on our behalf under a UA the target bans, we did not
 * avoid the violation — we arranged it, and we paid someone to carry it out.
 * That is worse than doing it ourselves, because the record would show a
 * clean local UA while the request on the wire carried a banned one.
 *
 * So the gate is mandatory and it is evaluated against the UA the provider
 * ACTUALLY SENDS, which the provider must declare. Three consequences, all
 * enforced below rather than left to the caller:
 *
 *  1. A provider that will not declare its UA cannot be used. "We don't
 *     disclose that" is not a missing feature, it is a refusal to let the
 *     decision be checked, and an unverifiable claim is not a basis for a
 *     compliance record. There is deliberately no override flag.
 *
 *  2. The declared UA is evaluated with OUR robots implementation against the
 *     target's own robots.txt. We do not accept the provider's assurance that
 *     it is allowed; `appliedRules` goes into the record so the publisher can
 *     re-run the decision themselves.
 *
 *  3. A provider capability that changes what the target sees of the client
 *     — solving CAPTCHAs, patching CDP, forging fingerprints — is refused
 *     unless the run's grant names the access capability that governs it
 *     (ADR 0005), and cycling identities is refused under any grant. Both are
 *     decided before robots is consulted. Changing whose machine runs the
 *     browser does not change what the browser is doing, so the vendor gets
 *     exactly the grant our own executors would need.
 *
 * Pure policy, zero dependencies, no clock and no network — the caller
 * supplies the robots document it already fetched.
 */

import { evaluateRobots, type RobotsTxt } from './robots.js'
import type { ProviderCapability } from './vendor.js'
import { evaluateAccessCapability, VENDOR_CAPABILITY_ACCESS } from './vendor.js'

// ---------------------------------------------------------------------------
// Provider declarations
// ---------------------------------------------------------------------------

/**
 * Capability taxonomy and the product's refusal posture now live in
 * `vendor.ts` (three-layer split: transport / capability / policy). Re-export
 * here so existing imports keep working; the gate below consumes the same
 * types.
 */
export type { ProviderCapability } from './vendor.js'

export interface ProviderDeclaration {
  /** Stable id for the record, e.g. `browserbase`. */
  id: string
  /**
   * The User-Agent the provider actually puts on the wire. Not what we would
   * like it to send, and not a family name — the string a publisher would see
   * in their access log, because that is what their robots.txt binds.
   *
   * Null means the provider does not disclose it, which disqualifies it.
   */
  declaredUserAgent: string | null
  capabilities: readonly ProviderCapability[]
  /**
   * The access capabilities (ADR 0005) the run's grant names. A capability in
   * `capabilities` that VENDOR_CAPABILITY_ACCESS maps to one is refused unless
   * it is here. Omitted means no grant.
   */
  grants?: readonly string[]
  /** Whether the provider will pass through our own UA if we ask. */
  honoursCallerUserAgent: boolean
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

export type ProviderRefusal =
  /** The provider will not say what UA it sends. */
  | 'undeclared_user_agent'
  /** The provider offers a capability ADR 0005 refuses under any grant. */
  | 'refused_capability'
  /** The provider offers a capability whose access capability the grant does not name. */
  | 'ungranted_capability'
  /** The target's robots.txt bans the UA the provider sends. */
  | 'robots_disallowed'
  /** The target's robots.txt could not be fetched, which is a complete disallow. */
  | 'robots_unreachable'

export interface ProviderGateVerdict {
  allowed: boolean
  refusal: ProviderRefusal | null
  /** Human-readable, and meant to be shown to the operator verbatim. */
  reason: string
  /** The UA the decision was made about, so the record is self-describing. */
  evaluatedUserAgent: string | null
  /** The robots group token that governed, e.g. `*` or `scrapy`. */
  matchedUserAgentGroup: string | null
  /** Rules that fired, most-specific first — the publisher's re-check path. */
  appliedRules: readonly { pattern: string; allow: boolean }[]
  /** Capabilities that caused a refusal, when that is the reason. */
  refusedCapabilities: readonly ProviderCapability[]
}

/**
 * Decide whether `provider` may fetch `path` on this target.
 *
 * `robots` is the target's parsed robots.txt, or null when the site published
 * none. Null is a full allow per RFC 9309 §2.3.1.3 — but null cannot tell
 * "no robots.txt" from "we failed to fetch it", so a fetch failure is passed
 * as `unreachable` instead: a complete disallow per §2.3.1.4. That
 * distinction is load-bearing: treating a network failure as permission is
 * how a crawler quietly starts ignoring rules it never read.
 */
export function evaluateProviderGate(
  provider: ProviderDeclaration,
  robots: RobotsTxt | null,
  path: string,
  unreachable: 'server_error' | 'network_error' | 'timeout' | null = null,
): ProviderGateVerdict {
  const base = {
    evaluatedUserAgent: provider.declaredUserAgent,
    matchedUserAgentGroup: null,
    appliedRules: [] as readonly { pattern: string; allow: boolean }[],
    refusedCapabilities: [] as readonly ProviderCapability[],
  }

  // Capability check first: it does not depend on the URL, so there is no
  // point asking robots about a route we will not take under this grant.
  const verdicts = provider.capabilities.flatMap((c) => {
    const access = VENDOR_CAPABILITY_ACCESS[c]
    return access === undefined ? [] : [{ capability: c, verdict: evaluateAccessCapability(access, provider.grants ?? []) }]
  })
  const blocked = verdicts.filter((v) => v.verdict.decision !== 'granted')
  if (blocked.length > 0) {
    const forever = blocked.some((v) => v.verdict.decision === 'refused')
    return {
      ...base,
      allowed: false,
      refusal: forever ? 'refused_capability' : 'ungranted_capability',
      reason:
        `Provider ${provider.id} offers ${blocked.map((v) => v.capability).join(', ')}: ` +
        blocked.map((v) => ('reason' in v.verdict ? v.verdict.reason : v.capability)).join('; ') +
        '. Changing whose machine runs the browser does not change what the browser is doing.',
      refusedCapabilities: blocked.map((v) => v.capability),
    }
  }

  if (provider.declaredUserAgent === null) {
    return {
      ...base,
      allowed: false,
      refusal: 'undeclared_user_agent',
      reason:
        `Provider ${provider.id} does not declare the User-Agent it sends, so its ` +
        "requests cannot be evaluated against the target's robots.txt. An " +
        'unverifiable claim is not a basis for a compliance record.',
    }
  }

  if (unreachable !== null) {
    return {
      ...base,
      allowed: false,
      refusal: 'robots_unreachable',
      reason:
        `The target's robots.txt could not be fetched (${unreachable}). RFC 9309 requires ` +
        'assuming a complete disallow until it can be read.',
    }
  }

  if (robots === null) {
    return {
      ...base,
      allowed: true,
      refusal: null,
      reason: `No robots.txt published; ${provider.declaredUserAgent} is unrestricted here.`,
    }
  }

  const match = evaluateRobots(robots, provider.declaredUserAgent, path)
  const appliedRules = match.appliedRules.map((r) => ({ pattern: r.pattern, allow: r.allow }))

  if (!match.allowed) {
    return {
      ...base,
      allowed: false,
      refusal: 'robots_disallowed',
      matchedUserAgentGroup: match.matchedAgent,
      appliedRules,
      reason:
        `The target's robots.txt disallows ${path} for ${provider.declaredUserAgent} ` +
        `(group "${match.matchedAgent ?? '*'}"). Routing through ${provider.id} would not ` +
        'avoid that violation, it would arrange it.' +
        (provider.honoursCallerUserAgent
          ? ' This provider can pass through our UA; re-evaluate under that identity instead of this one.'
          : ''),
    }
  }

  return {
    ...base,
    allowed: true,
    refusal: null,
    matchedUserAgentGroup: match.matchedAgent,
    appliedRules,
    reason: `robots.txt allows ${path} for ${provider.declaredUserAgent} (group "${match.matchedAgent ?? '*'}").`,
  }
}
