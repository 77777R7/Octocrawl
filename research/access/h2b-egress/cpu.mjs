// H2b CPU sampler for one task call: started before the call, stopped with SIGTERM after it, then prints one JSON line
// {"cpu": …}. Every 500 ms it reads /proc/stat (every CPU of the instance) and each process's /proc/<pid>/stat, grouped
// by what the process is: the installed Chrome (/opt/google/chrome), the bundled Chromium (/ms-playwright), node (the
// API, run-set, the forwarder, this sampler), other. The machine total is exact; the per-group seconds are lower bounds,
// because a process's CPU between its last sample and its exit is not seen. Without /proc (macOS) it prints null.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'

const INTERVAL_MS = 500
if (!existsSync('/proc/stat')) {
  console.log(JSON.stringify({ cpu: null, reason: 'no /proc on this machine' }))
  process.exit(0)
}
let tick = 100
try { tick = Number(execFileSync('getconf', ['CLK_TCK']).toString().trim()) || 100 } catch {}

function machine() {
  const lines = readFileSync('/proc/stat', 'utf8').split('\n')
  const [, ...values] = lines[0].trim().split(/\s+/)
  const [user, nice, system, idle, iowait, irq, softirq, steal] = values.map(Number)
  return { busy: user + nice + system + irq + softirq + (steal ?? 0), total: user + nice + system + idle + iowait + irq + softirq + (steal ?? 0), cpus: lines.filter((l) => /^cpu\d+ /.test(l)).length }
}

function groupOf(pid) {
  try {
    const command = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0')[0]
    if (command.includes('/opt/google/chrome/')) return 'chrome'
    if (command.includes('/ms-playwright/')) return 'chromium'
    if (/(^|\/)node$/.test(command)) return 'node'
    return 'other'
  } catch { return null }
}

function processes() {
  const out = new Map()
  for (const name of readdirSync('/proc')) {
    if (!/^\d+$/.test(name)) continue
    try {
      const stat = readFileSync(`/proc/${name}/stat`, 'utf8')
      const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
      out.set(name, Number(fields[11]) + Number(fields[12]))
    } catch {}
  }
  return out
}

const started = Date.now()
const first = machine()
let last = first
const baseline = processes()
const seen = new Map(baseline)
const groups = new Map()
const byGroup = { chrome: 0, chromium: 0, node: 0, other: 0 }
const utilisation = []

function sample() {
  const now = machine()
  if (now.total > last.total) utilisation.push((now.busy - last.busy) / (now.total - last.total))
  last = now
  for (const [pid, ticks] of processes()) {
    // A process that was running before the call counts from the call's start; one that started during it, from zero.
    const before = seen.get(pid) ?? 0
    if (!groups.has(pid)) groups.set(pid, groupOf(pid))
    const group = groups.get(pid)
    if (group !== null && ticks > before) byGroup[group] += (ticks - before) / tick
    seen.set(pid, ticks)
  }
}

const timer = setInterval(sample, INTERVAL_MS)
process.once('SIGTERM', () => {
  clearInterval(timer)
  sample()
  const round = (n) => Math.round(n * 100) / 100
  const busySeconds = (last.busy - first.busy) / tick
  console.log(JSON.stringify({ cpu: {
    wallMs: Date.now() - started, cpus: first.cpus, tick, busySeconds: round(busySeconds),
    avgUtil: last.total > first.total ? round((last.busy - first.busy) / (last.total - first.total)) : null,
    peakUtil: utilisation.length === 0 ? null : round(Math.max(...utilisation)),
    saturatedShare: utilisation.length === 0 ? null : round(utilisation.filter((u) => u >= 0.9).length / utilisation.length),
    secondsByGroup: Object.fromEntries(Object.entries(byGroup).map(([k, v]) => [k, round(v)])), samples: utilisation.length,
  } }))
  process.exit(0)
})
