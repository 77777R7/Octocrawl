// G4 per-task digest of a run-set run (--save-responses): verdict, gate, channels and the time breakdown, one JSON line
// per task, then one line with the run's summary. The phases come from the final rung's trace timestamps (`at`, ms
// since the rung started) and the waits' own durations; the code emits no duration for cold start, navigation,
// capture or cleanup, so those are differences between events, and cleanup (browser close, profile delete) is not
// measured at all: it stays null, never 0.
// Usage: node research/access/g4-cloudrun/phases.mjs [run dir]   (default: the latest under .w2l/access/runs)
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const DETECTION = {
  T001: 'cloudflare', T002: 'cloudflare', T047: 'cloudflare', T048: 'cloudflare', T071: 'cloudflare', T076: 'cloudflare', B001: 'cloudflare',
  T005: 'datadome', T034: 'datadome', T038: 'datadome', T045: 'datadome', T046: 'datadome', T049: 'datadome',
  T068: 'cloudflare+datadome', T053: 'no_vendor_header', B008: 'no_vendor_header',
}
const root = '.w2l/access/runs'
const dir = process.argv[2] ?? join(root, (await readdir(root)).sort().at(-1))
const summary = JSON.parse(await readFile(join(dir, 'summary.json'), 'utf8'))
const attempts = (await readFile(join(dir, 'attempts.jsonl'), 'utf8')).trim().split('\n').filter(Boolean).map((line) => JSON.parse(line))
const round = (n) => (n === null || n === undefined || Number.isNaN(n) ? null : Math.round(n))

function phasesOf(doc) {
  const trace = doc.trace ?? []
  const first = (name) => trace.find((e) => e.event === name)
  const last = (name) => trace.findLast((e) => e.event === name)
  const engine = first('browser_engine')
  const rung = engine?.detail?.engine ?? null
  const started = (doc.ladderTrace ?? []).filter((e) => e.event === 'ladder_channel_started')
  const tried = doc.channelsTried ?? []
  const rungStart = started[tried.length - 1]?.at ?? null
  if (engine === undefined) return { finalRung: tried.at(-1) ?? null, earlierRungsMs: round(rungStart) }
  const navigate = first('navigate')
  const challenge = last('challenge_wait')
  const region = last('region_wait')
  const rendered = first('rendered')
  const stored = first('cache_stored')
  const challengeStart = challenge ? challenge.at - (challenge.detail?.ms ?? 0) : null
  const regionStart = region ? region.at - (region.detail?.waitedMs ?? 0) : null
  const navEnd = challengeStart ?? regionStart ?? rendered?.at ?? null
  return {
    finalRung: tried.at(-1) ?? null,
    browser: rung,
    chrome: engine.detail?.version ?? null,
    earlierRungsMs: round(rungStart),
    coldStartMs: round(engine.at - (first('browser_start')?.at ?? 0)),
    preNavigationMs: navigate ? round(navigate.at - engine.at) : null,
    navigationMs: navigate && navEnd !== null ? round(navEnd - navigate.at) : null,
    // The rung waits only when it saw a waitable gate, and then always emits challenge_wait: no event is a measured 0.
    challengeWaitMs: rung === 'installed_chrome' ? (challenge ? round(challenge.detail?.ms) : (rendered ? 0 : null)) : null,
    challengeOutcome: challenge?.detail?.outcome ?? null,
    settleMs: regionStart !== null ? round(regionStart - (challenge ? challenge.at : navEnd)) : null,
    regionWaitMs: region ? round(region.detail?.waitedMs) : null,
    captureMs: rendered && region ? round(rendered.at - region.at) : null,
    extractMs: stored && rendered ? round(stored.at - rendered.at) : null,
    serializeMs: doc.usage?.timings?.serializeMs === undefined ? null : Math.round(doc.usage.timings.serializeMs * 1000) / 1000,
    cleanupMs: null,
    rungMs: round(doc.usage?.wallMs),
  }
}

const out = []
for (const attempt of attempts) {
  const id = attempt.taskId ?? attempt.id
  const line = { id, detection: DETECTION[id] ?? null, verified: attempt.outcome?.verified === true, falseSuccess: attempt.outcome?.falseSuccess === true, clientMs: round(attempt.outcome?.wallMs) }
  try {
    const doc = JSON.parse(await readFile(join(dir, 'responses', `${id}-cold.json`), 'utf8')).response
    const tried = doc.channelsTried ?? []
    let gate = null
    for (const event of doc.trace ?? []) if (event.event === 'gate_detected') gate = `${event.detail?.status}:${(event.detail?.signals ?? []).join(',')}`
    Object.assign(line, {
      status: doc.status, reason: doc.failureReason ?? doc.blockReason ?? null, route: doc.evidenceRecord?.access?.route ?? null, tried, gate,
      // K3's confounder: not verified, and the ladder ended at browser_local without starting installed_chrome.
      stoppedAtBrowserLocal: line.verified === false && tried.at(-1) === 'browser_local' && !tried.includes('installed_chrome'),
      ...phasesOf(doc),
    })
  } catch (error) {
    // No saved answer (the API never answered): not verified, the ladder's end unknown.
    Object.assign(line, { status: null, read: String(error?.message ?? error).slice(0, 160), stoppedAtBrowserLocal: null })
  }
  out.push(line)
  console.log(JSON.stringify({ task: line }))
}
console.log(JSON.stringify({ run: { dir, commit: summary.environment?.commit, dirty: summary.environment?.dirty, exitIp: summary.environment?.exitIp, proxyEnv: summary.environment?.proxyEnv, grant: summary.environment?.grant, totals: summary.totals, denominator: summary.denominator, stoppedAtBrowserLocal: out.filter((l) => l.stoppedAtBrowserLocal === true).length, noAnswer: out.filter((l) => l.status === null).length } }))
