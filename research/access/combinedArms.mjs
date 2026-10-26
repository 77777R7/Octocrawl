// The parts of the combined-grant windows (k1-window.mjs, combinedReport.mjs) that need no machine to decide, kept apart
// so they can be tested (packages/runtime/test/combinedArms.test.ts): which arms a report lists and which pairs it
// compares, the ic_compat grant's capabilities, the window's cap on Steel spend (--steel-cap), what a saved response says
// of its Steel calls, and the exit of the ic_compat measurement (ROADMAP current phase, decision 17, stage L item 1).

/** The arms a combined-grant report knows, in the order its tables list them. */
export const REPORT_ARMS = ['standard', 'installed_chrome', 'ic_compat', 'combined', 'firecrawl']

/** The arms a report lists: those any of its windows ran (each manifest's `arms`), in REPORT_ARMS order. */
export function reportArms(...armLists) {
  const ran = new Set(armLists.flat())
  return REPORT_ARMS.filter((a) => ran.has(a))
}

/**
 * The comparisons a report makes, arm against baseline, when both ran: the combined-grant measurement's three (#716),
 * then the ic_compat arm against installed_chrome alone and against the combined grant.
 */
export const PAIRS = [['installed_chrome', 'standard'], ['combined', 'standard'], ['combined', 'installed_chrome'], ['ic_compat', 'installed_chrome'], ['ic_compat', 'combined']]

export function pairsFor(arms) {
  return PAIRS.filter(([a, base]) => arms.includes(a) && arms.includes(base))
}

/** The ic_compat arm's capabilities: installed_chrome and compatible_transport, and no route that spends money. */
export const IC_COMPAT_CAPABILITIES = ['compatible_transport', 'installed_chrome']

/** Why a grant's capabilities are not the ic_compat arm's; null when they are exactly its two. */
export function icCompatRefusal(capabilities) {
  const named = [...(capabilities ?? [])].sort()
  return named.join() === IC_COMPAT_CAPABILITIES.join() ? null : `must name installed_chrome and compatible_transport, nothing else (it names ${named.join(', ') || 'none'})`
}

/**
 * Whether a run of `pages` may start under the window's Steel cap: what the ledger charged the window's earlier pages,
 * each page it did not report counted at the ceiling, plus `pages` at the ceiling, stays within `capUsd`. The ceiling
 * is the most one page can be charged (one Steel call a page at the tariff's price ceiling); null refuses.
 */
export function steelCapAllows({ charged, pages, capUsd, pageCeilingUsd }) {
  if (pageCeilingUsd === null) return { ok: false, spentUsd: null, worstUsd: null }
  const spentUsd = charged.reduce((sum, usd) => sum + (typeof usd === 'number' ? usd : pageCeilingUsd), 0)
  const worstUsd = spentUsd + pages * pageCeilingUsd
  return { ok: worstUsd <= capUsd, spentUsd, worstUsd }
}

/**
 * Each Steel call of one saved response (the provider rungs of its ladder summary): whether its session was created and
 * how long that took, the error of a call whose session never was, each release (confirmed by a release call, by
 * Steel's own state when no call was, or not at all) and the ledger's charge and its basis. Null when the response holds
 * no ladder summary: its calls are unknown, not none.
 */
export function steelCalls(response) {
  const attempts = response?.summary?.attempts
  if (!Array.isArray(attempts)) return null
  return attempts.filter((a) => a.channel === 'provider').map((a) => {
    const trace = Array.isArray(a.result?.trace) ? a.result.trace : []
    const created = trace.find((e) => e.event === 'session_created')
    const failed = trace.find((e) => e.event === 'provider_failed')
    const settled = trace.filter((e) => e.event === 'spend_settled').at(-1)?.detail ?? null
    return {
      created: created !== undefined,
      createMs: typeof created?.detail?.ms === 'number' ? created.detail.ms : null,
      createError: created === undefined && failed !== undefined ? String(failed.detail?.error ?? 'unknown') : null,
      gated: trace.some((e) => e.event === 'provider_gate'),
      refused: trace.some((e) => e.event === 'provider_refused'),
      releases: trace.filter((e) => e.event === 'session_released').map((e) => {
        const d = e.detail ?? {}
        const byCall = Array.isArray(d.releaseAttempts) ? d.releaseAttempts.some((x) => x.confirmed === true) : null
        return { released: d.released === true, by: d.released !== true ? null : byCall === false ? 'state' : byCall === true ? 'call' : 'unknown', calls: Array.isArray(d.releaseAttempts) ? d.releaseAttempts.length : null, state: d.releaseState?.status ?? null }
      }),
      chargedUsd: typeof settled?.chargedUsd === 'number' ? settled.chargedUsd : null,
      basis: settled?.basis ?? null,
    }
  })
}

const count = (xs) => { const n = {}; for (const x of xs) n[x] = (n[x] ?? 0) + 1; return n }

/**
 * A window's Steel calls in counts, from steelCalls of each of its responses (null: a response without a summary). An
 * engine before the provider's step events (O7, #723) traced neither a session's creation nor its release: a call that
 * reached the gate without a session_created event says so, and then the session and release counts are null (unknown).
 * An unread response (no saved file or no summary) may hold calls: then `complete` is false, every count is a lower
 * bound, and the ledger's total is null.
 */
export function steelTally(perResponse) {
  const calls = perResponse.filter((c) => c !== null).flat()
  const traced = calls.every((c) => c.created || !c.gated)
  const created = calls.filter((c) => c.created)
  const failed = calls.filter((c) => !c.created && c.createError !== null)
  const releases = calls.flatMap((c) => c.releases)
  const createMs = created.map((c) => c.createMs).filter((x) => x !== null).sort((x, y) => x - y)
  const charged = calls.map((c) => c.chargedUsd)
  const known = (x) => (traced ? x : null)
  const unread = perResponse.filter((c) => c === null).length
  return {
    responses: perResponse.length,
    unread,
    complete: unread === 0,
    calls: calls.length,
    refused: calls.filter((c) => c.refused).length,
    traced,
    created: known(created.length),
    createMs: !traced || createMs.length === 0 ? null : { p50: createMs[Math.floor(0.5 * createMs.length)], max: createMs.at(-1) },
    createFailed: known(failed.length),
    createErrors: known(count(failed.map((c) => c.createError))),
    createdWithoutRelease: known(created.filter((c) => c.releases.length === 0).length),
    releases: known(releases.length),
    releasedBy: known(count(releases.filter((r) => r.released).map((r) => r.by))),
    unconfirmed: known(releases.filter((r) => !r.released).length),
    unconfirmedStates: known(count(releases.filter((r) => !r.released).map((r) => r.state ?? 'unread'))),
    basis: count(calls.map((c) => c.basis ?? 'unknown')),
    chargedUsd: unread > 0 || charged.some((x) => x === null) ? null : charged.reduce((s, x) => s + x, 0),
  }
}

/**
 * The exit of the ic_compat measurement in one window, on one task set: ic_compat verifies at least the combined arm's
 * count less `margin`, with no more false successes. A task an arm did not run counts as not verified in its own count,
 * but what it would have answered is unknown: each side of the exit is unknown when the tasks not run could decide it.
 */
export function exitOf(icCompat, combined, margin = 2) {
  const icNotRun = icCompat.planned - icCompat.attempted, combinedNotRun = combined.planned - combined.attempted
  const needed = combined.verified - margin
  const verified = icCompat.verified >= needed + combinedNotRun ? true : icCompat.verified + icNotRun < needed ? false : null
  const falseSuccess = icCompat.fs + icNotRun <= combined.fs ? true : icCompat.fs > combined.fs + combinedNotRun ? false : null
  return { needed, verified, falseSuccess, met: verified === false || falseSuccess === false ? false : verified === null || falseSuccess === null ? null : true }
}
