// H2b report: the record's tables from the executions' log lines (cloud.sh logs), one file per execution named
// w<window>-<job>.jsonl, the windows' robots verdicts (robots-w<window>.jsonl) and prices.json, all in one directory:
//   prices.json  { "res_a": { "perGbUsd": n, "basis": "…" }, "dc": { … } }: each paid plan's price per GB and where it
//                came from (without it that arm's byte cost, and so its $ per page, stays unknown; google has no byte price)
// Percentiles are nearest rank. Unknown stays unknown: a missing price, answer or counter is printed as "unknown".
// A residential exit is someone's own connection, so its address is printed to its /24 alone (a.b.c.x).
// Usage: node research/access/h2b-egress/report.mjs <directory>
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2]
// Cloud Run job rates for asia-southeast1 (Tier 2), read 2026-10-21 (G4's record): per vCPU-second and per GiB-second.
const RATE = { 2: 2 * 0.0000216 + 4 * 0.0000024, 4: 4 * 0.0000216 + 8 * 0.0000024 }
const prices = JSON.parse(readFileSync(join(dir, 'prices.json'), 'utf8'))
const lines = (file) => readFileSync(join(dir, file), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const pct = (values, p) => { const v = values.filter((x) => typeof x === 'number').sort((a, b) => a - b); return v.length === 0 ? null : v[Math.max(0, Math.ceil((p / 100) * v.length) - 1)] }
const fmt = (n, digits = 0) => (n === null || n === undefined || Number.isNaN(n) ? 'unknown' : Number(n).toFixed(digits))
const mb = (bytes) => (bytes === null || bytes === undefined ? 'unknown' : (bytes / 1e6).toFixed(2))

const verdicts = {}
// Each task's site host, from the robots lines (task lines do not carry the URL).
const siteHost = new Map()
for (const file of readdirSync(dir).filter((f) => /^robots-w\d+\.jsonl$/.test(f))) {
  const window = file.match(/w(\d+)/)[1]
  verdicts[window] = lines(file).find((l) => l.robotsVerdict)?.robotsVerdict ?? null
  for (const l of lines(file)) if (l.robots?.id && l.robots.host) siteHost.set(l.robots.id, l.robots.host)
}

const runs = []
for (const file of readdirSync(dir).filter((f) => /^w\d+-.+\.jsonl$/.test(f)).sort()) {
  const [, window, job] = file.match(/^w(\d+)-(.+)\.jsonl$/)
  const log = lines(file)
  const tasks = log.filter((l) => l.task).map((l) => l.task)
  const final = new Map((log.find((l) => l.calls)?.calls ?? []).map((c) => [c.task, c]))
  const arm = job.replace(/-4cpu$/, '').replace('-', '_')
  runs.push({
    window, job, arm, cpus: job.endsWith('4cpu') ? 4 : 2, tasks, final,
    selfcheck: log.find((l) => l.selfcheck)?.selfcheck ?? null, apiControl: log.find((l) => l.apiControl)?.apiControl ?? null,
    image: log.find((l) => l.image)?.image ?? null, marks: log.filter((l) => l.mark).map((l) => l.mark),
  })
}

/** A call's bytes through the exit: the final counters (/calls), else the call's own end. */
const bytesOf = (run, t) => { const c = run.final.get(t.id); return c ? c.up + c.down : (t.bytes ? t.bytes.total : null) }
const allowedIn = (window) => { const v = verdicts[window]; return v === null || v === undefined ? null : new Set(v.disallowed ?? []) }

function summarise(run) {
  const ran = run.tasks.filter((t) => !t.skipped)
  const disallowed = allowedIn(run.window)
  const inSubset = (t) => disallowed !== null && !disallowed.has(t.id)
  const chrome = ran.filter((t) => t.reachedChrome)
  const byChrome = ran.filter((t) => t.verifiedByChrome)
  const perGb = prices[run.arm]?.perGbUsd
  const byteCost = run.arm === 'google' ? 0 : (typeof perGb === 'number' ? perGb : null)
  let cost = 0, costKnown = true
  for (const t of chrome) {
    const seconds = typeof t.chromeRungMs === 'number' ? t.chromeRungMs / 1000 : null
    const bytes = bytesOf(run, t)
    if (seconds === null || bytes === null || byteCost === null) { costKnown = false; continue }
    cost += seconds * RATE[run.cpus] + (bytes / 1e9) * byteCost
  }
  const verifiedBytes = chrome.filter((t) => t.verified).map((t) => bytesOf(run, t))
  const failedBytes = chrome.filter((t) => !t.verified).map((t) => bytesOf(run, t))
  const sum = (a) => a.reduce((n, x) => n + (x ?? 0), 0)
  const clears = ran.filter((t) => t.challengeWait?.outcome === 'cleared').map((t) => `${t.id} ${fmt(t.challengeWait.ms / 1000, 1)} s`)
  const gated = ran.filter((t) => t.challengeWait?.outcome === 'still_gated').length
  const refused = ran.filter((t) => (t.bytes?.refusals ?? []).some((r) => /^\d{3}$/.test(r.status) && r.status !== '200'))
  return {
    run, ran: ran.length, skipped: run.tasks.length - ran.length,
    verified: run.tasks.filter((t) => t.verified).length, falseSuccess: run.tasks.filter((t) => t.falseSuccess).length,
    subsetSize: disallowed === null ? null : run.tasks.filter(inSubset).length,
    subsetVerified: disallowed === null ? null : run.tasks.filter((t) => inSubset(t) && t.verified).length,
    subsetFalse: disallowed === null ? null : run.tasks.filter((t) => inSubset(t) && t.falseSuccess).length,
    reachedChrome: chrome.length, verifiedByChrome: byChrome.length,
    clientP50: pct(ran.map((t) => t.clientMs), 50), clientP95: pct(ran.map((t) => t.clientMs), 95),
    chromeP50: pct(chrome.map((t) => t.chromeRungMs), 50), chromeP95: pct(chrome.map((t) => t.chromeRungMs), 95),
    bytesVerifiedMean: verifiedBytes.length === 0 ? null : sum(verifiedBytes) / verifiedBytes.length,
    bytesFailedMean: failedBytes.length === 0 ? null : sum(failedBytes) / failedBytes.length,
    bytesP50: pct(chrome.map((t) => bytesOf(run, t)), 50), bytesP95: pct(chrome.map((t) => bytesOf(run, t)), 95),
    bytesTotal: sum(chrome.map((t) => bytesOf(run, t))),
    costTotal: costKnown ? cost : null, costPerVerified: costKnown && byChrome.length > 0 ? cost / byChrome.length : null,
    gbPerVerified: byChrome.length > 0 ? sum(chrome.map((t) => bytesOf(run, t))) / 1e9 / byChrome.length : null,
    clears, gated, refused: refused.map((t) => `${t.id} (${t.bytes.refusals.map((r) => `${r.status}${r.reason ? ` ${r.reason}` : ''}`).join(', ')})`),
    moved: ran.filter((t) => t.exit?.moved === true).map((t) => t.id),
    exits: new Set(ran.map((t) => t.exit?.ipStart).filter(Boolean)).size,
    cpuAvg: pct(chrome.map((t) => t.cpu?.avgUtil), 50), cpuPeak: Math.max(...chrome.map((t) => t.cpu?.peakUtil ?? 0)),
    saturated: pct(chrome.map((t) => t.cpu?.saturatedShare), 50), throttled: pct(chrome.map((t) => t.cpu?.throttledShare), 50),
    serviceMean: (() => { const v = chrome.map((t) => t.bytes?.chromeService).filter((x) => typeof x === 'number'); return v.length === 0 ? null : sum(v) / v.length })(),
  }
}

const rows = runs.map(summarise)
const out = []
out.push('| Window | Arm | vCPU | Verified (21) | False successes | Verified, robots-allowed | Reached Chrome | Verified by Chrome | Client p50 / p95 s | Chrome rung p50 / p95 s | MB per call: verified / not / p95 / Chrome\'s own (mean) | Exits | Exit moved | $ per Chrome-verified page | GB per Chrome-verified page |')
out.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
for (const r of rows) {
  out.push(`| ${r.run.window} | ${r.run.arm} | ${r.run.cpus} | ${r.verified} / ${r.run.tasks.length}${r.skipped ? ` (${r.skipped} skipped, robots)` : ''} | ${r.falseSuccess} | ${r.subsetSize === null ? 'unknown' : `${r.subsetVerified} / ${r.subsetSize} (false ${r.subsetFalse})`} | ${r.reachedChrome} | ${r.verifiedByChrome} | ${fmt(r.clientP50 / 1000, 1)} / ${fmt(r.clientP95 / 1000, 1)} | ${fmt(r.chromeP50 / 1000, 1)} / ${fmt(r.chromeP95 / 1000, 1)} | ${mb(r.bytesVerifiedMean)} / ${mb(r.bytesFailedMean)} / ${mb(r.bytesP95)} / ${mb(r.serviceMean)} | ${r.exits} | ${r.moved.length === 0 ? 'none' : r.moved.join(', ')} | ${r.costPerVerified === null ? (r.verifiedByChrome === 0 ? 'n/a (none verified)' : 'unknown') : `$${fmt(r.costPerVerified, 4)}`} | ${fmt(r.gbPerVerified, 4)} |`)
}
out.push('')
out.push('| Window | Arm | vCPU | Challenge clears (cap 10 s) | Still gated after the cap | Refused by the exit | CPU of the job\'s vCPU: median avg / max peak / median share ≥ 90 % / median throttled share |')
out.push('| --- | --- | --- | --- | --- | --- | --- |')
for (const r of rows) out.push(`| ${r.run.window} | ${r.run.arm} | ${r.run.cpus} | ${r.clears.length === 0 ? 'none' : r.clears.join(', ')} | ${r.gated} | ${r.refused.length === 0 ? 'none' : r.refused.join('; ')} | ${fmt(r.cpuAvg, 2)} / ${fmt(r.cpuPeak, 2)} / ${fmt(r.saturated, 2)} / ${fmt(r.throttled, 2)} |`)
out.push('')
// Per task: ✓ with the rung that answered, ✗ with the reason, "robots" for a task the arm did not send.
// A refused tunnel is noted after the reason, as the site's own host or other hosts (Chrome's services, challenge or
// asset hosts). The forwarder keeps a call's first 5 refusals, so with 5 kept and no site among them the site is unknown.
const refusedNote = (t) => {
  const kept = (t.bytes?.refusals ?? []).filter((x) => /^\d{3}$/.test(x.status) || x.status === 'list_exhausted')
  if (kept.length === 0) return ''
  const site = siteHost.get(t.id)
  const own = kept.find((x) => x.host === site)
  if (own) return `; exit refused the site ${own.status}`
  return `; exit refused other hosts${kept.length >= 5 ? ', site unknown' : ''}`
}
const ids = [...new Set(runs.flatMap((r) => r.tasks.map((t) => t.id)))]
out.push(`| Task | ${runs.map((r) => `w${r.window} ${r.arm}${r.cpus === 4 ? ' 4 vCPU' : ''}`).join(' | ')} |`)
out.push(`| --- | ${runs.map(() => '---').join(' | ')} |`)
for (const id of ids) {
  const cells = runs.map((r) => {
    const t = r.tasks.find((x) => x.id === id)
    if (t === undefined) return 'not run'
    if (t.skipped) return 'robots'
    if (t.verified) return `✓ ${t.finalRung ?? t.route ?? ''}${t.challengeWait?.outcome === 'cleared' ? ` (cleared ${fmt(t.challengeWait.ms / 1000, 1)} s)` : ''}`
    const failed = t.challengeWait?.outcome === 'still_gated' ? `gated ${fmt(t.challengeWait.ms / 1000, 0)} s` : (t.reason ?? t.status ?? 'no answer')
    return `✗ ${failed}${refusedNote(t)}`
  })
  out.push(`| ${id} | ${cells.join(' | ')} |`)
}
out.push('')
const shown = (arm, ip) => (typeof ip !== 'string' ? 'unknown' : arm === 'res_a' ? ip.replace(/\.\d+$/, '.x') : ip)
for (const r of rows) {
  const sc = r.run.selfcheck
  out.push(`- w${r.run.window} ${r.run.arm} ${r.run.cpus} vCPU: self-check ${sc === null ? 'missing' : sc.ok ? 'passed' : `failed (${sc.failed.join(', ')})`}; Chrome control exit ${shown(r.run.arm, sc?.egressControl?.ip)}; API control exit ${r.run.apiControl?.ip ?? 'unknown'}; bytes through the exit ${mb(r.bytesTotal)} MB; Chrome-rung cost ${r.costTotal === null ? 'unknown' : `$${fmt(r.costTotal, 4)}`}.`)
}
console.log(out.join('\n'))
