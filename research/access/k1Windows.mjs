// The two-window view of K1 (docs/pa-enhancement-tasks.md, Phase 4, K1, and the done criteria): from the manifests of
// two windows written by k1-window.mjs, per arm and per task, what held in both windows. The per-window figures are in
// each window's own summary (k1Report.mjs); this adds only what needs both.
//
// Usage: node research/access/k1Windows.mjs <window 1 work dir> <window 2 work dir> --out <record.md>
//   A file that exists is never replaced.
//
// Method (first calls only; the retry pass stays in each window's own record):
//   stable verified  verified on the first call in both windows; unstable: in one; failed: in neither.
//   marginal gain    against the standard arm: a task is a gain when the arm verified it in both windows and standard in
//                    neither, a regression when standard verified it in both and the arm in neither; every other
//                    combination is unstable and counted apart. Cost and p95 are each window's (from its runs), side by side.
//   healthy 25       the candidate's enhanced arm against the pinned control, per window, with each task that differs.
//   false success    per window and summed, over all requests (92 a window), with the exact one-sided 95% upper bound.
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '../..')
const args = process.argv.slice(2)
const [w1, w2] = args
const out = args[args.indexOf('--out') + 1]
if (!w1 || !w2 || args.indexOf('--out') === -1) throw new Error('usage: k1Windows.mjs <w1 dir> <w2 dir> --out <record.md>')
const ARMS = ['standard', 'enhanced', 'installed_chrome', 'control', 'firecrawl', 'zenrows']
const tasks = JSON.parse(await readFile(join(here, 'tasks.v1.json'), 'utf8')).tasks
const ids = tasks.map((t) => t.id)
const healthy = new Set(tasks.filter((t) => t.part === 'healthy').map((t) => t.id))

async function load(dir) {
  const m = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'))
  const rows = {}
  for (const a of ARMS) {
    rows[a] = new Map()
    for (const r of m.runs.filter((x) => x.arm === a && x.label.includes('first') && x.runDir)) {
      for (const l of (await readFile(join(repo, r.runDir, 'attempts.jsonl'), 'utf8')).split('\n').filter(Boolean)) {
        const x = JSON.parse(l)
        if (x.temperature === 'cold' && !x.droppedAfterRun) rows[a].set(x.taskId, x)
      }
    }
  }
  return { m, rows }
}
const W = [await load(w1), await load(w2)]
const lnC = (n, k) => { let s = 0; for (let i = 1; i <= k; i++) s += Math.log(n - k + i) - Math.log(i); return s }
const cdf = (k, n, p) => { let s = 0; for (let i = 0; i <= k; i++) s += Math.exp(lnC(n, i) + i * Math.log(p) + (n - i) * Math.log(1 - p)); return s }
const upper = (k, n) => { if (n === 0) return null; if (k === 0) return 1 - 0.05 ** (1 / n); if (k >= n) return 1; let lo = k / n, hi = 1; for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (cdf(k, n, mid) > 0.05) lo = mid; else hi = mid } return hi }
const pct = (x) => (x === null ? 'n/a' : `${(100 * x).toFixed(1)}%`)
const q = (v, p) => { const s = v.filter((x) => typeof x === 'number').sort((a, b) => a - b); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))]) : null }
const ver = (w, a, id) => W[w].rows[a].get(id)?.outcome.verified === true
const both = (a, id) => ver(0, a, id) && ver(1, a, id)
const neither = (a, id) => !ver(0, a, id) && !ver(1, a, id)
const count = (w, a, f) => [...W[w].rows[a].values()].filter(f).length
function cost(w, a) {
  if (a === 'standard') return '$0'
  const m = W[w].m
  if (a === 'firecrawl' || a === 'zenrows') {
    const b = m.credits?.before?.[a], f = m.credits?.afterFirst?.[a]
    const d = !b || !f ? null : a === 'firecrawl' ? b.remainingCredits - f.remainingCredits : f.usage_credits - b.usage_credits
    return d === null || Number.isNaN(d) ? 'unknown' : `${d} cr`
  }
  const c = [...W[w].rows[a].values()].map((x) => x.outcome.chargedUsd ?? null)
  const unknown = c.filter((x) => x === null).length
  return `$${c.filter((x) => x !== null).reduce((s, x) => s + x, 0).toFixed(4)}${unknown ? ` + ${unknown} unknown` : ''}`
}
const p95 = (w, a) => q([...W[w].rows[a].values()].map((x) => x.outcome.wallMs), 0.95)

const L = []
const P = (...l) => L.push(...l)
P(`# K1, two windows: ${W[0].m.date} and ${W[1].m.date}`, '',
  `- Item: docs/pa-enhancement-tasks.md, Phase 4, K1. Windows: \`${w1}\` (runner \`${W[0].m.runner}\`) and \`${w2}\` (runner \`${W[1].m.runner}\`); control \`${W[0].m.control.slice(0, 8)}\` / \`${W[1].m.control.slice(0, 8)}\`. Each window's own record has its conditions; this puts the two side by side.`,
  `- Command: \`node research/access/k1Windows.mjs ${w1} ${w2} --out ${out}\`. First calls only.`,
  '', '## Verified per window and across both', '',
  '| Arm | Window 1 | Window 2 | Verified in both | In one only | In neither | False success w1 / w2 (of 92) | Both windows (of 184, 95% upper) |', '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ...ARMS.map((a) => { const f0 = count(0, a, (x) => x.outcome.falseSuccess), f1 = count(1, a, (x) => x.outcome.falseSuccess); return `| ${a} | ${count(0, a, (x) => x.outcome.verified)} | ${count(1, a, (x) => x.outcome.verified)} | ${ids.filter((id) => both(a, id)).length} | ${ids.filter((id) => ver(0, a, id) !== ver(1, a, id)).length} | ${ids.filter((id) => neither(a, id)).length} | ${f0} / ${f1} | ${f0 + f1}/184, ${pct(upper(f0 + f1, 184))} |` }),
  '', '## Marginal gain against the standard arm, held in both windows', '',
  'A gain: the arm verified the task in both windows and standard in neither. A regression: the reverse. Anything else is unstable.', '',
  '| Arm | Gains in both windows | Regressions in both windows | Net | Unstable against standard | First-call cost w1 / w2 | p95 all, w1 / w2 (ms) | Standard p95 w1 / w2 |', '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ...ARMS.filter((a) => a !== 'standard').map((a) => {
    const g = ids.filter((id) => both(a, id) && neither('standard', id)), r = ids.filter((id) => both('standard', id) && neither(a, id))
    const u = ids.filter((id) => !g.includes(id) && !r.includes(id) && !(both(a, id) && both('standard', id)) && !(neither(a, id) && neither('standard', id)))
    return `| ${a} | ${g.length}${g.length ? ` (${g.join(', ')})` : ''} | ${r.length}${r.length ? ` (${r.join(', ')})` : ''} | ${g.length - r.length} | ${u.length} | ${cost(0, a)} / ${cost(1, a)} | ${p95(0, a)} / ${p95(1, a)} | ${p95(0, 'standard')} / ${p95(1, 'standard')} |`
  }),
  '', 'Cost: Octocrawl arms, the spend ledger over first calls (the grant\'s tariff estimate; installed_chrome and standard have no paid route); competitors, the account usage change over the first calls (cr = credits). The retry pass\'s cost and cost per 1,000 verified are in each window\'s summary. Clash bandwidth, compute, storage and delivery are not measured (unknown exposure).',
  '', '## Healthy 25: candidate (enhanced) against the pinned control', '',
  '| Window | Enhanced | Control | Tasks that differ |', '| --- | --- | --- | --- |',
  ...[0, 1].map((w) => { const d = [...healthy].filter((id) => ver(w, 'enhanced', id) !== ver(w, 'control', id)); return `| ${w + 1} | ${[...healthy].filter((id) => ver(w, 'enhanced', id)).length} | ${[...healthy].filter((id) => ver(w, 'control', id)).length} | ${d.length === 0 ? 'none' : d.map((id) => `${id} (enhanced ${ver(w, 'enhanced', id) ? 'yes' : W[w].rows.enhanced.get(id)?.observed.reason ?? 'no'}, control ${ver(w, 'control', id) ? 'yes' : W[w].rows.control.get(id)?.observed.reason ?? 'no'})`).join('; ')} |` }),
  '', '## Gap to the best competitor, per window', '',
  '| Arm | Window 1 gap | Window 2 gap |', '| --- | --- | --- |',
  ...ARMS.slice(0, 4).map((a) => `| ${a} | ${[0, 1].map((w) => Math.max(count(w, 'firecrawl', (x) => x.outcome.verified), count(w, 'zenrows', (x) => x.outcome.verified)) - count(w, a, (x) => x.outcome.verified)).join(' | ')} |`),
  '', '## Per task, first calls (w1/w2: y = verified, F = false success, n = not)', '',
  `| Task | Part | ${ARMS.join(' | ')} |`, `| --- | --- | ${ARMS.map(() => '---').join(' | ')} |`,
  ...tasks.map((t) => `| ${t.id} | ${t.part} | ${ARMS.map((a) => [0, 1].map((w) => { const x = W[w].rows[a].get(t.id); return !x ? '-' : x.outcome.verified ? 'y' : x.outcome.falseSuccess ? 'F' : 'n' }).join('/')).join(' | ')} |`), '')
if (existsSync(out)) throw new Error(`${out} exists`)
await writeFile(out, L.join('\n'))
console.log(`wrote ${out}`)
