/**
 * Vendor capability manifest + product policy.
 *
 * THREE LAYERS, THREE FILES:
 *   1. Transport   — packages/bench/src/vendors/*: talks to the vendor API.
 *   2. Capability  — this module: what each vendor CAN do, declared by the
 *                    vendor adapter, uncoloured by product opinion.
 *   3. Policy      — also this module: which capabilities the PRODUCT will
 *                    ever enable, as a pure function of (offers, policy).
 *
 * Why the split exists. A capability is a fact about the vendor ("can solve
 * captchas", "can persist a profile", "offers a live view"). A policy is a
 * decision about us ("never solve captchas", "persist only when the user
 * authorized this domain", "live view only for handoff"). Hard-coding policy
 * into a vendor adapter is how it dies: add a third vendor, and the product's
 * refusal posture gets re-implemented (or forgotten) a third time. With the
 * split, the refusal set lives once, the authorization surface lives once,
 * and a vendor adapter can only ever declare what it offers — never change
 * what we accept.
 *
 * ADR 0005 (docs/adr/0005-enhanced-access-policy.md, 2026-10-05) sorts every
 * access capability into three classes, kept below as three constants:
 * REFUSED_FOREVER (a principle: no grant or configuration can name one),
 * DEFERRED (an engineering-cost pause: refused as `deferred`, with the ROADMAP
 * Paused row that says when it restarts) and AUTHORIZABLE (off unless a grant
 * names it, and recorded when used). A vendor capability that needs a grant
 * maps to its access capability in VENDOR_CAPABILITY_ACCESS, and that mapping,
 * not the adapter's declaration, decides which grant turns it on.
 */

// ---------------------------------------------------------------------------
// Capability layer: facts about vendors
// ---------------------------------------------------------------------------

/**
 * A capability a vendor may offer. Capabilities that change the ROUTE are
 * accepted by choosing the vendor or by an operational key; capabilities that
 * change what the page sees of the client need an access grant (ADR 0005);
 * cycling identities to outlast a block is refused forever.
 */
export type ProviderCapability =
  /** Runs a real browser engine remotely. Route change. Fine. */
  | 'headless_browser'
  /** Egress from the provider's addresses. Route change. Fine. */
  | 'datacenter_proxy'
  /** Egress from consumer ISP addresses. Route change; sourcing is the
   *  caller's diligence, not something this gate can verify. */
  | 'residential_proxy'
  /** Retries, backoff, queueing. Fine. */
  | 'retry_orchestration'
  /** Reuses a persisted browser profile across sessions (cookies, storage).
   *  Route persistence. Fine — but see policy: only with user authorization. */
  | 'session_persistence'
  /** A human can drive the session live (debug URL, remote view). Fine —
   *  it is the mechanism by which handoff happens. */
  | 'live_view_handoff'
  /** The vendor's stealth: forged navigator/TLS/canvas signals. Needs the
   *  `vendor_stealth` grant. */
  | 'fingerprint_spoofing'
  /** Hides the automation channel from the page. Needs `vendor_stealth`. */
  | 'cdp_patching'
  /** Solves a human-verification challenge. Needs `vendor_captcha_solving`. */
  | 'captcha_solving'
  /** Cycles identities to outlast a ban. Refused forever. */
  | 'identity_rotation'

// ---------------------------------------------------------------------------
// Access capabilities: ADR 0005's three classes
// ---------------------------------------------------------------------------

/**
 * Never enabled, by any grant or configuration (ADR 0005, class 1). These are
 * principles, not costs, so none has a restart condition.
 */
export const REFUSED_FOREVER = [
  {
    capability: 'identity_rotation',
    principle: 'cycling identities to outlast a block, including answering a 429 with another IP and carrying on',
  },
  {
    capability: 'patch_user_chrome',
    principle: "modifying, patching or injecting into the person's own Chrome",
  },
  {
    capability: 'in_session_route_switch',
    principle: 'switching executor or egress inside an established interactive session without saying so',
  },
  {
    capability: 'secrets_in_records',
    principle: 'writing proxy credentials, cookies, solver tokens or a cdpEndpoint into a record or a log',
  },
] as const

export type ForbiddenCapability = (typeof REFUSED_FOREVER)[number]['capability']

/**
 * Paused for engineering cost, not principle (ADR 0005, class 2). Refused at
 * run time as `deferred`, never as `refused`, with the ROADMAP Paused row that
 * says when the item restarts. `row` and `restartWhen` are that row's first and
 * last cells, verbatim; `source` is the row's line in ROADMAP.md. Lines added above the Paused
 * table move it: update `source` then. The row title is the anchor the tests check.
 */
export const DEFERRED = [
  {
    capability: 'own_browser_engine',
    source: 'ROADMAP.md:242',
    row: 'An own browser fork or engine, and broad custom-fingerprint research',
    restartWhen: "A maintained project stops working for a class of tasks that PA's set shows matters",
  },
  {
    capability: 'own_fingerprint_patches',
    source: 'ROADMAP.md:242',
    row: 'An own browser fork or engine, and broad custom-fingerprint research',
    restartWhen: "A maintained project stops working for a class of tasks that PA's set shows matters",
  },
  {
    capability: 'own_captcha_model',
    source: 'ROADMAP.md:243',
    row: 'An in-house CAPTCHA model',
    restartWhen: 'Only if solver cost or coverage blocks paying users',
  },
  {
    capability: 'own_residential_network',
    source: 'ROADMAP.md:244',
    row: 'An own residential IP network',
    restartWhen: 'Not restarted; PA uses providers',
  },
  {
    capability: 'camoufox',
    source: 'ROADMAP.md:245',
    row: 'A second stealth engine (Camoufox)',
    restartWhen: 'Patchright leaves a clear class of PA tasks unsolved',
  },
  {
    capability: 'hosted_browser_cluster',
    source: 'ROADMAP.md:246',
    row: 'Hosted API and hosted MCP at scale',
    restartWhen: "P5's hosted-scale item, once P3 has exited; or earlier when users ask for runs while their computer is off and will pay more for it",
  },
] as const

export type DeferredCapability = (typeof DEFERRED)[number]['capability']

/**
 * Off unless a grant names them, and recorded when used (ADR 0005, class 3).
 * `tier` is the lowest grant tier that may name one: `standard` adds no
 * third-party cost, `enhanced` may. `thirdPartyCost` marks the ones a grant
 * may name only together with a run budget.
 */
export const AUTHORIZABLE = [
  { capability: 'compatible_transport', tier: 'standard', thirdPartyCost: false },
  { capability: 'egress_sessions', tier: 'standard', thirdPartyCost: false },
  { capability: 'enhanced_browser', tier: 'enhanced', thirdPartyCost: false },
  { capability: 'vendor_remote_browser', tier: 'enhanced', thirdPartyCost: true },
  { capability: 'vendor_unlock_html', tier: 'enhanced', thirdPartyCost: true },
  { capability: 'vendor_captcha_solving', tier: 'enhanced', thirdPartyCost: true },
  { capability: 'vendor_stealth', tier: 'enhanced', thirdPartyCost: true },
  { capability: 'third_party_captcha_solver', tier: 'enhanced', thirdPartyCost: true },
] as const

export type AuthorizableCapability = (typeof AUTHORIZABLE)[number]['capability']

export type AccessCapability = ForbiddenCapability | DeferredCapability | AuthorizableCapability

/** What one capability name comes to under a grant. */
export type AccessVerdict =
  | { capability: string; decision: 'granted' }
  | { capability: string; decision: 'not_granted'; reason: string }
  | { capability: string; decision: 'refused'; reason: string }
  | { capability: string; decision: 'deferred'; source: string; restartWhen: string; reason: string }
  | { capability: string; decision: 'unknown'; reason: string }

/**
 * Classify one capability name against the names a grant lists. Pure. The
 * class is checked before the grant, so naming a refused or deferred
 * capability in the grant changes nothing.
 */
export function evaluateAccessCapability(capability: string, granted: readonly string[] = []): AccessVerdict {
  const forever = REFUSED_FOREVER.find((e) => e.capability === capability)
  if (forever !== undefined) {
    return { capability, decision: 'refused', reason: `${capability} is never enabled (ADR 0005): ${forever.principle}` }
  }
  const deferred = DEFERRED.find((e) => e.capability === capability)
  if (deferred !== undefined) {
    return {
      capability,
      decision: 'deferred',
      source: deferred.source,
      restartWhen: deferred.restartWhen,
      reason: `${capability} is deferred (ADR 0005; ${deferred.source}, "${deferred.row}"); it restarts when: ${deferred.restartWhen}`,
    }
  }
  if (AUTHORIZABLE.some((e) => e.capability === capability)) {
    return granted.includes(capability)
      ? { capability, decision: 'granted' }
      : { capability, decision: 'not_granted', reason: `${capability} is off unless a grant names it (ADR 0005)` }
  }
  return { capability, decision: 'unknown', reason: `${capability} is not an access capability ADR 0005 names` }
}

/**
 * The access capability that governs a vendor capability, for the ones that
 * need more than choosing the vendor. Policy owns this table: an adapter that
 * declared `captcha_solving` with another enableKey, or none, still needs the
 * `vendor_captcha_solving` grant.
 */
export const VENDOR_CAPABILITY_ACCESS: Readonly<Partial<Record<ProviderCapability, AccessCapability>>> = {
  fingerprint_spoofing: 'vendor_stealth',
  cdp_patching: 'vendor_stealth',
  captcha_solving: 'vendor_captcha_solving',
  identity_rotation: 'identity_rotation',
}

/**
 * One capability a vendor declares. `enableKey` says how the policy turns it
 * on (or null when the vendor exposes no off switch and we accept it by
 * choosing the vendor at all, e.g. headless_browser).
 */
export interface CapabilityOffer {
  capability: ProviderCapability
  /**
   * Whether the vendor ships with this capability ON by default, so the
   * adapter must send an explicit opt-out (Browserbase solveCaptchas, Steel
   * fingerprint injection) rather than trusting a default. The adapter is
   * responsible for the wire-side switch; this field is the declaration that
   * makes the refusal auditable.
   */
  vendorDefaultOn: boolean
  /** Policy key that may enable it. Null = always accepted when offered. */
  enableKey: string | null
}

// ---------------------------------------------------------------------------
// Policy layer: decisions about us
// ---------------------------------------------------------------------------

/**
 * What the operator (or user) has authorized, per run: operational keys and
 * ADR 0005 access capabilities. Naming a REFUSED_FOREVER or DEFERRED
 * capability enables nothing; the decision lists it under `declined`.
 * `authorized` may be omitted: an empty authorization is the default.
 */
export interface VendorPolicy {
  authorized?: readonly string[]
}

/** The default: no persistence, no live view. Safe for any public URL. */
export const DEFAULT_VENDOR_POLICY: VendorPolicy = { authorized: [] }

export interface EnabledCapability {
  capability: ProviderCapability
  enableKey: string | null
  /** True when the vendor defaults it ON and the adapter must opt out. */
  optOutRequired: boolean
}

export interface PolicyDecision {
  /** What this run is allowed to use, after policy. */
  enabled: readonly EnabledCapability[]
  /** Authorized vendor keys this vendor did not offer, for the audit trail. */
  unauthorized: readonly string[]
  /**
   * Grant-gated capabilities the vendor offers that the grant did not name.
   * The adapter keeps each of them off on the wire.
   */
  withheld: readonly ProviderCapability[]
  /** Authorized names no grant can turn on: refused forever, deferred, or unknown. */
  declined: readonly AccessVerdict[]
  /** The permanent refusals (REFUSED_FOREVER), for the declaration and the audit trail. */
  refused: readonly ForbiddenCapability[]
}

/**
 * Operational policy keys. `session_persistence` and `live_view_handoff`
 * require user authorization per target domain (see governance);
 * `residential_proxy` and `retry_orchestration` are operator choices, also
 * never on by default.
 */
export const OPERATIONAL_POLICY_KEYS = [
  'session_persistence',
  'live_view_handoff',
  'residential_proxy',
  'retry_orchestration',
] as const

/** Every name `VendorPolicy.authorized` can usefully hold. */
export const AUTHORIZABLE_POLICY_KEYS: readonly string[] = [
  ...OPERATIONAL_POLICY_KEYS,
  ...AUTHORIZABLE.map((e) => e.capability),
]

/**
 * Evaluate product policy against a vendor's capability offers.
 * Pure function: same offers + policy => same decision. The vendor adapter
 * passes this decision down to its session body builder; nothing else in the
 * vendor layer reads policy directly.
 */
export function evaluateVendorPolicy(
  offers: readonly CapabilityOffer[],
  policy: VendorPolicy = DEFAULT_VENDOR_POLICY,
): PolicyDecision {
  const authorized = [...new Set(policy.authorized ?? [])]
  const operational: readonly string[] = OPERATIONAL_POLICY_KEYS

  const declined = authorized
    .filter((key) => !operational.includes(key))
    .map((key) => evaluateAccessCapability(key, authorized))
    .filter((v) => v.decision === 'refused' || v.decision === 'deferred' || v.decision === 'unknown')

  const enabled: EnabledCapability[] = []
  const withheld: ProviderCapability[] = []

  for (const offer of offers) {
    const access = VENDOR_CAPABILITY_ACCESS[offer.capability]
    if (access !== undefined) {
      // The adapter's enableKey is not consulted: which grant turns this on is
      // policy, and a forever-refused capability has no grant at all.
      if (evaluateAccessCapability(access, authorized).decision === 'granted') {
        enabled.push({ capability: offer.capability, enableKey: access, optOutRequired: offer.vendorDefaultOn })
      } else {
        withheld.push(offer.capability)
      }
      continue
    }
    if (offer.enableKey === null) {
      enabled.push({ capability: offer.capability, enableKey: null, optOutRequired: offer.vendorDefaultOn })
      continue
    }
    if (authorized.includes(offer.enableKey)) {
      enabled.push({
        capability: offer.capability,
        enableKey: offer.enableKey,
        optOutRequired: offer.vendorDefaultOn,
      })
    }
  }

  // Requested-but-unavailable is itself worth reporting: it is the audit
  // trail's way of saying "you asked for handoff, this vendor cannot give it".
  const vendorKeys = new Set<string>([...operational, ...Object.values(VENDOR_CAPABILITY_ACCESS)])
  const offered = new Set<string | null | undefined>(offers.flatMap((o) => [o.enableKey, VENDOR_CAPABILITY_ACCESS[o.capability]]))
  const declinedKeys = new Set(declined.map((v) => v.capability))
  const unauthorized = authorized.filter((key) => vendorKeys.has(key) && !declinedKeys.has(key) && !offered.has(key))

  return { enabled, unauthorized, withheld, declined, refused: REFUSED_FOREVER.map((e) => e.capability) }
}
