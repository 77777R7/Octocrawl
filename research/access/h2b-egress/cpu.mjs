// H2b CPU sampler for one task call: started before the call, stopped with SIGTERM after it, then prints one JSON line
// {"cpu": …}. Every 500 ms it reads /proc/stat (every CPU of the instance) and each process's /proc/<pid>/stat, grouped
// by what the process is: the installed Chrome (/opt/google/chrome), the bundled Chromium (/ms-playwright), node (the
// API, run-set, the forwarder, this sampler), other. The machine total is exact; the per-group seconds are lower bounds,
// because a process's CPU between its last sample and its exit is not seen. Without /proc (macOS) it prints null.
// Utilisation is against the job's vCPU (H2B_CPUS), not the CPUs the instance shows: a 2 vCPU gen2 job shows 5. Steal
// time is kept apart from busy time, and the cgroup's CPU limit and throttling are read where the instance has them.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'

const INTERVAL_MS = 500
const jobCpus = Number(process.env.H2B_CPUS) || null
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
  return { busy: user + nice + system + irq + softirq, steal: steal ?? 0, total: user + nice + system + idle + iowait + irq + softirq + (steal ?? 0), cpus: lines.filter((l) => /^cpu\d+ /.test(l)).length }
}

const readText = (path) => { try { return readFileSync(path, 'utf8') } catch { return null } }
/** The cgroup's CPU limit (cgroup v2 cpu.max, else v1's quota and period), in CPUs; null when it sets none. */
function cgroupLimit() {
  const v2 = readText('/sys/fs/cgroup/cpu.max')?.trim().split(/\s+/)
  if (v2 !== undefined) return v2[0] === 'max' ? null : Number(v2[0]) / Number(v2[1])
  const quota = Number(readText('/sys/fs/cgroup/cpu/cpu.cfs_quota_us') ?? readText('/sys/fs/cgroup/cpu,cpuacct/cpu.cfs_quota_us'))
  const period = Number(readText('/sys/fs/cgroup/cpu/cpu.cfs_period_us') ?? readText('/sys/fs/cgroup/cpu,cpuacct/cpu.cfs_period_us'))
  return quota > 0 && period > 0 ? quota / period : null
}
/** The cgroup's throttling counters (v2 cpu.stat, else v1's), or null where the instance has none. */
function throttling() {
  const text = readText('/sys/fs/cgroup/cpu.stat') ?? readText('/sys/fs/cgroup/cpu/cpu.stat') ?? readText('/sys/fs/cgroup/cpu,cpuacct/cpu.stat')
  if (text === null) return null
  const stat = Object.fromEntries(text.trim().split('\n').map((line) => line.split(' ')).map(([k, v]) => [k, Number(v)]))
  if (stat.nr_periods === undefined) return null
  return { periods: stat.nr_periods, throttled: stat.nr_throttled ?? 0, throttledSeconds: stat.throttled_usec !== undefined ? stat.throttled_usec / 1e6 : (stat.throttled_time ?? 0) / 1e9 }
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
const limit = cgroupLimit()
const firstThrottle = throttling()
// The denominator: the job's vCPU, else the cgroup's limit, else the CPUs shown.
const capacity = jobCpus ?? limit ?? first.cpus
let last = first
let lastAt = started
const baseline = processes()
const seen = new Map(baseline)
const groups = new Map()
const byGroup = { chrome: 0, chromium: 0, node: 0, other: 0 }
const utilisation = []

function sample() {
  const now = machine()
  const at = Date.now()
  if (at > lastAt) utilisation.push((now.busy - last.busy) / tick / ((at - lastAt) / 1000) / capacity)
  last = now
  lastAt = at
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
  const wallMs = Date.now() - started
  const busySeconds = (last.busy - first.busy) / tick
  const lastThrottle = throttling()
  const throttle = firstThrottle === null || lastThrottle === null ? null : {
    periods: lastThrottle.periods - firstThrottle.periods, throttled: lastThrottle.throttled - firstThrottle.throttled,
    seconds: round(lastThrottle.throttledSeconds - firstThrottle.throttledSeconds),
  }
  console.log(JSON.stringify({ cpu: {
    wallMs, cpus: first.cpus, jobCpus, cgroupLimit: limit, capacity, tick, busySeconds: round(busySeconds), stealSeconds: round((last.steal - first.steal) / tick),
    avgUtil: wallMs > 0 ? round(busySeconds / (wallMs / 1000) / capacity) : null,
    peakUtil: utilisation.length === 0 ? null : round(Math.max(...utilisation)),
    saturatedShare: utilisation.length === 0 ? null : round(utilisation.filter((u) => u >= 0.9).length / utilisation.length),
    throttle, throttledShare: throttle === null || throttle.periods === 0 ? null : round(throttle.throttled / throttle.periods),
    secondsByGroup: Object.fromEntries(Object.entries(byGroup).map(([k, v]) => [k, round(v)])), samples: utilisation.length,
  } }))
  process.exit(0)
})
