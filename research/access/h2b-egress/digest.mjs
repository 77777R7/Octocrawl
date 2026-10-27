// H2b per-call digest: one task call's run-set run (--save-responses), the forwarder's counters for that call (its
// /end answer, on stdin) and the CPU sampler's line, as one JSON line {"task": …}. The verdict is run-set's; the
// phases are G4's (research/access/g4-cloudrun/phases.mjs, the final rung's trace timestamps), and the challenge wait
// carries the cap the rung used (O1: 10 s for Cloudflare and bot checks, 0 for a captcha). chromeRungMs is the client
// time from the installed_chrome rung's start to the answer: what the hosted plan's Chrome service would bill.
// Usage: node research/access/h2b-egress/digest.mjs <run dir> <task id> <cpu json file> < <forwarder /end answer>
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const DETECTION = {
  T001: 'cloudflare', T002: 'cloudflare', T047: 'cloudflare', T048: 'cloudflare', T071: 'cloudflare', T076: 'cloudflare', B001: 'cloudflare',
  T005: 'datadome', T034: 'datadome', T038: 'datadome', T045: 'datadome', T046: 'datadome', T049: 'datadome',
  T068: 'cloudflare+datadome', T053: 'no_vendor_header', B008: 'no_vendor_header',
  // The five tasks hosted lost to local on 2026-10-27, robots.txt apart (research/hosted/2026-10-27-parity-window-21edea41.md).
  T051: 'hosted_lost', T072: 'hosted_lost', T006: 'hosted_lost', T007: 'hosted_lost', T011: 'hosted_lost',
}
const [dir, id, cpuFile] = process.argv.slice(2)
const round = (n) => (n === null || n === undefined || Number.isNaN(n) ? null : Math.round(n))
const readJson = async (path) => { try { return JSON.parse(await readFile(path, 'utf8')) } catch { return null } }
let stdin = ''
for await (const chunk of process.stdin) stdin += chunk
// The forwarder's counters count only if they are this task's call: a missing or other call leaves them unknown.
const ended = (() => { try { return JSON.parse(stdin).callEnd ?? null } catch { return null } })()
const forwarder = ended !== null && ended.task === id ? ended : null
const cpu = (await readJson(cpuFile))?.cpu ?? null

/** G4's phases of the final rung (phases.mjs), unchanged. */
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

const line = { id, detection: DETECTION[id] ?? null }
const summary = await readJson(join(dir ?? '', 'summary.json'))
const attempts = (await readFile(join(dir ?? '', 'attempts.jsonl'), 'utf8').catch(() => '')).trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
const attempt = attempts.find((a) => (a.taskId ?? a.id) === id) ?? null
Object.assign(line, {
  runDir: dir, commit: summary?.environment?.commit ?? null, dirty: summary?.environment?.dirty ?? null, earlierExitIp: summary?.environment?.exitIp ?? null,
  verified: attempt?.outcome?.verified === true, falseSuccess: attempt?.outcome?.falseSuccess === true, clientMs: round(attempt?.outcome?.wallMs),
})
const doc = (await readJson(join(dir ?? '', 'responses', `${id}-cold.json`)))?.response ?? null
if (doc === null) {
  // No saved answer (the API never answered): not verified, the ladder's end unknown.
  Object.assign(line, { status: null, read: 'no saved answer' })
} else {
  const tried = doc.channelsTried ?? []
  let gate = null
  for (const event of doc.trace ?? []) if (event.event === 'gate_detected') gate = `${event.detail?.status}:${(event.detail?.signals ?? []).join(',')}`
  const wait = (doc.trace ?? []).findLast((e) => e.event === 'challenge_wait')?.detail ?? null
  const phases = phasesOf(doc)
  const reachedChrome = tried.includes('installed_chrome')
  Object.assign(line, {
    status: doc.status, reason: doc.failureReason ?? doc.blockReason ?? null, route: doc.evidenceRecord?.access?.route ?? null, tried, gate,
    robots: doc.evidenceRecord?.robotsDecision?.decision ?? null,
    challengeWait: wait === null ? null : { ms: round(wait.ms), outcome: wait.outcome ?? null, capMs: wait.capMs ?? null, blockReason: wait.blockReason ?? null },
    reachedChrome,
    verifiedByChrome: line.verified && tried.at(-1) === 'installed_chrome',
    // Upper bound (client time after the rung started, the API's own steps around the ladder included) and lower bound
    // (the rung's last trace event; Chrome's close and profile removal emit none). The cost uses the upper bound.
    chromeRungMs: reachedChrome && line.clientMs !== null && phases.earlierRungsMs !== null && tried.at(-1) === 'installed_chrome' ? Math.max(0, line.clientMs - phases.earlierRungsMs) : (reachedChrome ? null : 0),
    chromeTraceMs: tried.at(-1) === 'installed_chrome' ? round(Math.max(0, ...(doc.trace ?? []).map((e) => e.at ?? 0))) : (reachedChrome ? null : 0),
    ...phases,
  })
}
if (ended !== null && forwarder === null) line.forwarderMismatch = ended.task ?? null
line.exit = forwarder === null ? null : {
  kind: forwarder.exit ?? null, index: forwarder.index ?? null, proxy: forwarder.proxy ?? null, session: forwarder.session ?? null,
  ipStart: forwarder.exitStart ?? null, ipEnd: forwarder.exitEnd ?? null, moved: forwarder.exitMoved ?? null,
}
line.bytes = forwarder === null ? null : {
  up: forwarder.up, down: forwarder.down, total: forwarder.up + forwarder.down, tunnels: forwarder.tunnels, http: forwarder.http,
  statuses: forwarder.statuses, errors: forwarder.errors, refusals: forwarder.refusals, connectMsP50: forwarder.connectMsP50, connectMsMax: forwarder.connectMsMax,
  echoBytes: (forwarder.echo ?? []).reduce((n, e) => n + (e.bytes ?? 0), 0), topHosts: forwarder.topHosts,
}
line.cpu = cpu
console.log(JSON.stringify({ task: line }))
