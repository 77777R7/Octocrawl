/**
 * Shared L0 wiring for product HTTP subjects. The bundle is asserted before
 * any bytes leave; the same object is what we send and what honesty checks.
 */

import {
  checkIdentityHonesty,
  headerRefusal,
  headersFromIdentity,
  identityBundleFrom,
  modeIdentity,
  type CrawlMode,
  type IdentityDevice,
  type ModeIdentity,
  type SentHeadersFact,
  type TraceEvent,
} from '@w2l/contracts'

export interface PreparedHttpIdentity {
  mode: CrawlMode
  identity: ModeIdentity
  /** Every header the lane sends to the requested origin: the caller's custom headers first, the identity's after them, so the identity is never overridden. */
  headers: Record<string, string>
  /** The identity's own headers (User-Agent, client hints): all a cross-origin hop or robots.txt gets. */
  identityHeaders: Record<string, string>
  /** The custom headers among `headers`, lower-cased, as sent (`request_headers_added`). */
  customHeaders: Record<string, string>
  sentHeaders: SentHeadersFact
}

/**
 * The caller's custom headers a lane sends, lower-cased: never one that
 * names the identity, a credential or the transport (headerRefusal). The API
 * refused those already; a lane called directly gets the same rule.
 */
export function wireHeaders(headers: Readonly<Record<string, string>> | undefined): Record<string, string> {
  const sent: Record<string, string> = {}
  for (const [name, value] of Object.entries(headers ?? {})) {
    const lower = name.toLowerCase()
    if (headerRefusal(lower) === null) sent[lower] = value
  }
  return sent
}

/**
 * The identity for requests to `host`: research mode declares its contact in
 * the format the host asks for (researchUserAgent); `device` picks the
 * desktop or the mobile browser identity. `headers` are the caller's custom
 * headers, sent before the identity's so they can never override it.
 */
export function prepareHttpIdentity(mode: CrawlMode = 'standard', contact: string | null = null, host: string | null = null, device: IdentityDevice = 'desktop', headers?: Readonly<Record<string, string>>): PreparedHttpIdentity {
  const identity = modeIdentity(mode, undefined, contact, host, device)
  const customHeaders = wireHeaders(headers)
  const identityHeaders = headersFromIdentity(identityBundleFrom(identity))
  const sent = { ...customHeaders, ...identityHeaders }
  const sentHeaders: SentHeadersFact = {
    headers: Object.entries(sent)
      .map(([name, value]) => ({ name: name.toLowerCase(), value }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }
  return { mode, identity, headers: sent, identityHeaders, customHeaders, sentHeaders }
}

/** Record the declared wire identity and whether it matched what we sent. */
export function recordHttpIdentity(
  prepared: PreparedHttpIdentity,
  trace: TraceEvent[],
  at: number,
): boolean {
  trace.push({
    at,
    lane: 'http',
    event: 'identity_sent',
    detail: { mode: prepared.mode, ...(prepared.identity.device === undefined ? {} : { device: prepared.identity.device }), headers: prepared.sentHeaders.headers },
  })
  const honesty = checkIdentityHonesty(prepared.identity, prepared.sentHeaders)
  if (!honesty.honest) {
    trace.push({
      at,
      lane: 'http',
      event: 'identity_mismatch',
      detail: { mismatches: honesty.mismatches },
    })
    return false
  }
  return true
}
