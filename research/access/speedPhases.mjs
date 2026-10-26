// Where one answer's time went, from the response run-set.mjs saved (--save-responses): each rung the ladder ran
// (summary.attempts), its phases, its robots.txt read and its waits for a check. Pure, so it can be tested
// (packages/runtime/test/speedPhases.test.ts); speedReport.mjs reads the files and writes the records.
//
// Timed (the trace says how long): http's usage.timings (robots, request + body, retry and cooldown waits, extraction);
// a browser rung's challenge_wait.ms, region_wait.waitedMs and loading_wait.waitedMs; each rung's startedAt/endedAt and
// usage.wallMs; and, from O7 on, the provider's steps (session_created, cdp_connected, ua_probed, page_opened, navigate,
// settled, gate_read, region_read, page_read: each its detail.ms) and session_released (releaseMs, usageMs).
// Inferred (from the gaps between events): a browser rung's launch (to identity_declared), robots.txt (identity_declared
// to robots_checked), navigation (navigate to the first wait or render) and settle; the provider's robots.txt and gate
// (provider_selected to provider_gate); before O7, the provider's session time outside the lane (the rung's clock less
// its usage.wallMs, which holds the session's creation, connection, UA probe and release) and its time in the page; a
// provider call that failed before its gate (a session never created) as before_gate.

/** A robots.txt read that took this long or more went to the network; a cache hit answers at once. Inferred: no event says which. */
export const ROBOTS_FETCH_MS = 30
const BROWSER = new Set(['browser_local', 'installed_chrome', 'browser_proxy', 'browser_local_authed'])
const PROVIDER_PAGE_STEPS = ['page_opened', 'navigate', 'settled', 'gate_read', 'region_read', 'page_read']

const sum = (xs) => xs.reduce((s, x) => s + x, 0)
const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0)

/** Each rung of the answer in order, with its phases; null when the response holds no ladder summary (an API before it, or no response). */
export function attemptsOf(response) {
  const attempts = response?.summary?.attempts
  return Array.isArray(attempts) ? attempts.map(attemptOf) : null
}

/** One rung: { channel, status, clockMs, wallMs, phases, robots, challengeWaits, timedSteps }. */
export function attemptOf(a) {
  const res = a.result ?? {}
  const trace = Array.isArray(res.trace) ? res.trace : []
  const clockMs = Date.parse(a.endedAt) - Date.parse(a.startedAt)
  const wallMs = typeof res.usage?.wallMs === 'number' ? res.usage.wallMs : null
  const first = (name) => trace.find((e) => e.event === name)
  const all = (name) => trace.filter((e) => e.event === name)
  const waited = (name, key) => sum(all(name).map((e) => num(e.detail?.[key])))
  const phases = {}
  let robotsMs = null
  let timedSteps = false
  const challengeWaits = all('challenge_wait').map((e) => ({ rung: a.channel, blockReason: e.detail?.blockReason ?? null, outcome: e.detail?.outcome ?? null, ms: e.detail?.ms ?? null, capMs: e.detail?.capMs ?? null }))
  if (a.channel === 'http' || a.channel === 'http_compat') {
    const t = res.usage?.timings ?? {}
    robotsMs = typeof t.robotsMs === 'number' ? t.robotsMs : null
    phases.robots = num(t.robotsMs)
    phases.request = num(t.requestMs) + num(t.bodyReadMs)
    phases.retry_wait = num(t.retryWaitMs) + num(t.cooldownWaitMs)
    phases.extract = num(t.parseMs) + num(t.extractMs) + num(t.formatMs)
  } else if (a.channel === 'provider') {
    const gate = first('provider_gate')?.at
    robotsMs = typeof gate === 'number' ? gate : null
    phases.robots_gate = num(gate)
    const session = ['session_created', 'cdp_connected', 'ua_probed'].map((n) => sum(all(n).map((e) => num(e.detail?.ms))))
    const page = PROVIDER_PAGE_STEPS.map((n) => sum(all(n).map((e) => num(e.detail?.ms) + num(e.detail?.judgeMs))))
    const released = all('session_released')
    timedSteps = trace.some((e) => e.event === 'session_created' || e.event === 'page_opened')
    if (timedSteps) {
      ;['session_created', 'cdp_connected', 'ua_probed'].forEach((n, i) => { phases[n] = session[i] })
      PROVIDER_PAGE_STEPS.forEach((n, i) => { phases[n] = page[i] })
      phases.release = sum(released.map((e) => num(e.detail?.releaseMs) + num(e.detail?.usageMs) + num(e.detail?.liveUsageMs)))
    }
    phases.loading_wait = waited('loading_wait', 'waitedMs')
    phases.region_wait = waited('region_wait', 'waitedMs')
    // Outside the lane's clock: before O7 the session's creation, connection, UA probe and release, untimed.
    phases.outside_lane = wallMs === null ? 0 : Math.max(0, clockMs - wallMs)
    const last = Math.max(0, ...trace.map((e) => num(e.at)))
    // A call that failed before its gate (the session was never created or connected) spent its time there, not in a page.
    if (typeof gate !== 'number') phases.before_gate = last
    else if (!timedSteps) phases.in_page = Math.max(0, last - gate - phases.loading_wait - phases.region_wait)
  } else if (BROWSER.has(a.channel)) {
    const declared = first('identity_declared')?.at ?? first('browser_engine')?.at ?? null
    const robots = first('robots_checked')?.at ?? null
    const nav = first('navigate')?.at ?? null
    phases.launch = num(declared)
    if (robots !== null) { robotsMs = Math.max(0, robots - num(declared)); phases.robots = robotsMs }
    phases.challenge_wait = waited('challenge_wait', 'ms')
    phases.loading_wait = waited('loading_wait', 'waitedMs')
    phases.region_wait = waited('region_wait', 'waitedMs')
    if (nav !== null) {
      // Each wait's start is its event's time less its length; navigation ends at the first wait or render after it.
      const ends = [...all('challenge_wait').map((e) => num(e.at) - num(e.detail?.ms)), ...all('loading_wait').map((e) => num(e.at) - num(e.detail?.waitedMs)), ...all('region_wait').map((e) => num(e.at) - num(e.detail?.waitedMs)), ...['rendered', 'navigate_failed', 'layout'].flatMap((n) => all(n).map((e) => num(e.at)))].filter((x) => x >= nav)
      phases.navigation = (ends.length === 0 ? nav : Math.min(...ends)) - nav
      const rendered = (all('rendered').at(-1) ?? all('navigate_failed').at(-1))?.at ?? Math.max(nav, ...trace.map((e) => num(e.at)))
      phases.settle_other = Math.max(0, rendered - nav - phases.navigation - phases.challenge_wait - phases.loading_wait - phases.region_wait)
      phases.after_render = wallMs === null ? 0 : Math.max(0, wallMs - rendered)
    }
  }
  return {
    channel: a.channel,
    status: res.status ?? null,
    blockReason: res.blockReason ?? null,
    failureReason: res.failureReason ?? null,
    clockMs,
    wallMs,
    phases,
    robots: robotsMs === null ? null : { ms: robotsMs, fetched: robotsMs >= ROBOTS_FETCH_MS },
    challengeWaits,
    timedSteps,
  }
}

/** The answer's http rung as O6 left it: its request time, and whether the ladder took the header-timeout fallback (and promised it). */
export function headersOf(response) {
  const http = response?.summary?.attempts?.find((a) => a.channel === 'http')
  const fallback = (response?.ladderTrace ?? []).find((e) => e.event === 'ladder_headers_timeout_fallback')
  return {
    requestMs: typeof http?.result?.usage?.timings?.requestMs === 'number' ? http.result.usage.timings.requestMs : null,
    httpStatus: http?.result?.status ?? null,
    httpFailure: http?.result?.failureReason ?? null,
    fallback: fallback === undefined ? null : { remainingMs: fallback.detail?.remainingMs ?? null, promised: fallback.detail?.promised === true },
    rungs: (response?.summary?.attempts ?? []).map((a) => a.channel),
  }
}
