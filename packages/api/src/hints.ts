/**
 * Agent hints: what a scrape response says about the request itself, in one
 * sentence each, so an agent reading the result knows what to change next
 * time. Not a status and not a warning about the page: a hint is about an
 * option the caller set. Present on the response (`agentHints`) only when
 * there is one.
 */

import type { FetchResult, LadderRunAudit, ScrapeRequest } from '@w2l/contracts'

/** The hint a `fastMode` scrape carries when the http lane asked for the browser lane it was denied. */
export const FAST_MODE_DECLINED_HINT = 'the http lane asked for the browser lane; fastMode declined it; retry without fastMode'

/** Quality events the http lane raises as an offer to the browser lane (see the ladder's QUALITY_ESCALATION_EVENTS). */
const QUALITY_EVENTS: ReadonlySet<string> = new Set(['quality_low_yield', 'quality_client_rendered'])

/**
 * Whether the http lane's result asked for a higher lane: an unresolved hop
 * in `escalations`, or a quality event in its trace.
 */
export function httpLaneAskedForBrowser(result: Pick<FetchResult, 'escalations' | 'trace'>): boolean {
  return result.escalations.some((hop) => hop.improved === null) || result.trace.some((event) => QUALITY_EVENTS.has(event.event))
}

/** The hints of one scrape, in the order they apply; empty when the request left nothing on the table. */
export function agentHintsFor(req: Pick<ScrapeRequest, 'fastMode'>, run: Pick<LadderRunAudit, 'channelsTried'> & { result: Pick<FetchResult, 'escalations' | 'trace' | 'lane'> }): string[] {
  const hints: string[] = []
  if (req.fastMode === true && run.result.lane === 'http' && httpLaneAskedForBrowser(run.result)) hints.push(FAST_MODE_DECLINED_HINT)
  return hints
}
