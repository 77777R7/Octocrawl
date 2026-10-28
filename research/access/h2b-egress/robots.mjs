// H2b robots.txt pre-check: what a hosted server decides for each task URL before it fetches anything (a hosted server
// obeys robots.txt for every URL), read with the product's own robots cache and decision, the standard identity's
// User-Agent, and this instance's own egress (no proxy). One JSON line per task: {"robots": {id, decision, …}}.
// A robots.txt that could not be fetched counts as disallowed (RFC 9309 §2.3.1.4, as the product holds); it is asked
// once more after 10 s with a fresh cache, so one slow answer does not drop a task from a whole window.
// Each window runs this once on Cloud Run before its rounds start (round.sh, arm "robots"); the residential rounds then
// leave out the tasks it disallows, as hosted would, and the google round sends every task, as G4 did, the record
// reporting the robots-allowed subset apart.
// Run from the repository root: H2B_TASKS=T001,T002 node --import tsx research/access/h2b-egress/robots.mjs
import { readFileSync } from 'node:fs'
import { RobotsOriginCache } from '../../../packages/bench/src/robotsLookup.ts'
import { modeIdentity } from '../../../packages/contracts/src/compliance.ts'

const ids = (process.env.H2B_TASKS ?? '').split(',').filter(Boolean)
const tasks = JSON.parse(readFileSync('research/access/tasks.v1.json', 'utf8'))
const list = Array.isArray(tasks) ? tasks : tasks.tasks
const userAgent = modeIdentity('standard').userAgent

async function decide(cache, id) {
  const url = list.find((task) => task.id === id)?.url
  if (url === undefined) return { id, decision: null, error: 'no such task' }
  const started = Date.now()
  try {
    const decision = cache.decision(await cache.lookup(url, userAgent), url, userAgent)
    return {
      id, host: new URL(url).hostname, decision: decision.decision, group: decision.matchedUserAgentGroup, rules: decision.appliedRules,
      robotsSha256: decision.robotsSha256, unreachable: decision.unreachable ?? null, ms: Date.now() - started,
    }
  } catch (error) {
    return { id, decision: null, error: String(error?.message ?? error).slice(0, 200), ms: Date.now() - started }
  }
}

const first = new RobotsOriginCache()
const results = new Map()
for (const id of ids) results.set(id, { ...(await decide(first, id)), attempts: 1 })
await first.teardown()
const again = ids.filter((id) => results.get(id).unreachable !== null || results.get(id).decision === null)
if (again.length > 0) {
  await new Promise((resolve) => setTimeout(resolve, 10_000))
  const second = new RobotsOriginCache()
  for (const id of again) results.set(id, { ...(await decide(second, id)), attempts: 2, firstUnreachable: results.get(id).unreachable })
  await second.teardown()
}
for (const id of ids) console.log(JSON.stringify({ robots: results.get(id) }))
const disallowed = ids.filter((id) => results.get(id).decision !== 'allowed' && results.get(id).decision !== 'no_robots')
console.log(JSON.stringify({ robotsVerdict: { at: new Date().toISOString(), userAgent, tasks: ids.length, disallowed } }))
