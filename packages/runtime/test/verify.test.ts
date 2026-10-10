import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { VerifyCheck, VerifyContract } from '@w2l/contracts'
import { contractSha256, verify, VERIFIER_VERSION } from '../src/verify.js'
// The access task runner's own judgement (research/access/run-set.mjs), which a task sent as a contract must match.
import { isData, judge } from '../../../research/access/judge.mjs'

const tasks = (JSON.parse(readFileSync(new URL('../../../research/access/tasks.v1.json', import.meta.url), 'utf8')) as { tasks: { id: string; predicates: VerifyCheck[] }[] }).tasks

const table = '| Year | Value |\n| --- | --- |\n| 2024 | 1.5 |\n| 2025 | 1.7 |\n'
/** Pages of the kinds the task set reads, each judged under every task's predicates. */
const PAGES = [
  '',
  '# Nothing here\n\nThe page loaded and said nothing of use.',
  '# Laptops\n\n- Acer Swift Go $649.99\n- Dell XPS 13 $1,299.00\n- HP Envy $899\n- Lenovo Yoga $1,049.99\n- ASUS Zenbook $999.99\n',
  `# Inflation, consumer prices (annual %)\n\nOECD data for the euro area.\n\n${table}\n${table}`,
  '# Search results\n\nGoogle Scholar · 12,400 results\n\n1. A survey of web crawling — 2019 — cited by 312\n2. Focused crawling — 2001 — cited by 1,021\n',
  '# Homes for sale in Seattle, WA\n\n123 Main St · 3 bd · 2 ba · 1,850 sqft · $899,000\n456 Pine St · 2 bd · 1 ba · 950 sqft · $615,000\n',
  '# Job openings\n\nSoftware Engineer — Remote — Posted 2 days ago\nData Analyst — London — Posted today\nProduct Manager — Berlin — 3 days ago\n',
  'Pardon Our Interruption\n\nPlease verify you are a human.',
]

describe('the task verifier (ADR 0006)', () => {
  it("gives run-set.mjs's own verdict on every predicate of every task of the access set, on every page", () => {
    const seen = new Map<string, { pass: number; fail: number }>()
    let compared = 0
    for (const task of tasks) {
      for (const markdown of PAGES) {
        for (const status of ['success', 'partial'] as const) {
          const doc = { status, markdown }
          const verification = verify({ checks: task.predicates }, doc)
          if (verification.status === 'not_requested') throw new Error('a contract was sent')
          const runner = task.predicates.map((p) => { try { return judge(p, doc) } catch { return false } })
          expect(verification.checks.map((check) => check.passed), `${task.id} on page ${PAGES.indexOf(markdown)}`).toEqual(runner)
          expect(verification.checks.map((check) => check.data)).toEqual(task.predicates.map((p) => isData(p)))
          // The runner's verified: answered (success or partial) and every predicate passed.
          expect(verification.status === 'passed').toBe(runner.every(Boolean))
          for (const [i, p] of task.predicates.entries()) {
            const tally = seen.get(p.type) ?? { pass: 0, fail: 0 }
            if (runner[i]) tally.pass++; else tally.fail++
            seen.set(p.type, tally)
          }
          compared++
        }
      }
    }
    expect(compared).toBe(tasks.length * PAGES.length * 2)
    // Each type the set uses passed and failed somewhere, so agreement is not two verifiers failing alike.
    expect([...seen.keys()].sort()).toEqual(['markdownCountMin', 'markdownMatches', 'minTables'])
    for (const [type, tally] of seen) expect(tally.pass > 0 && tally.fail > 0, type).toBe(true)
  })

  it("judges field and listRecordsMin as the runner does, on the result's own fields", () => {
    const doc = { status: 'success', markdown: 'x', lane: 'browser_local', list: { records: [{ values: { name: 'a' }, missing: [] }, { values: { name: 'b' }, missing: [] }] }, json: { status: 'complete', data: { price: 12.5, title: '' } } }
    const checks: VerifyCheck[] = [
      { type: 'listRecordsMin', min: 2 },
      { type: 'listRecordsMin', min: 3 },
      { type: 'field', path: 'json.status', equals: 'complete' },
      { type: 'field', path: 'json.data.title', present: true },
      { type: 'field', path: 'json.data.price', min: 10, max: 20 },
      { type: 'field', path: 'lane', in: ['http', 'browser_local'] },
      { type: 'field', path: 'json.data.missing', present: false },
    ]
    const verification = verify({ checks }, doc)
    if (verification.status === 'not_requested') throw new Error('a contract was sent')
    expect(verification.checks.map((check) => check.passed)).toEqual(checks.map((p) => judge(p, doc)))
    expect(verification.checks.map((check) => check.passed)).toEqual([true, false, true, false, true, true, true])
    expect(verification.checks.map((check) => check.data)).toEqual([true, true, true, true, true, false, true])
    expect(verification.checks[1]).toMatchObject({ observedCount: 2, asked: 3, observed: '2 records, at least 3 asked' })
    // A value is described without the page's text.
    expect(verification.checks[3]!.observed).toBe('json.data.title is an empty string')
  })

  it('counts the records that hold every field asked for (recordFields): a name, a price and a link of one record', () => {
    const list = { records: [
      { values: { name: 'Acer', price: '$649', url: 'https://a' }, missing: [] },
      { values: { name: 'Dell', price: '', url: 'https://d' }, missing: [] },
      { values: { name: 'HP', url: 'https://h' }, missing: ['price'] },
      { values: { name: 'Asus', price: '$999', url: 'https://z' }, missing: [] },
    ] }
    const at = (min: number) => verify({ checks: [{ type: 'recordFields', fields: ['name', 'price', 'url'], min }] }, { status: 'success', markdown: '', list })
    expect(at(2)).toMatchObject({ status: 'passed', checks: [{ passed: true, observedCount: 2, asked: 2 }] })
    expect(at(3)).toMatchObject({ status: 'failed', reason: 'checks_failed', checks: [{ passed: false, observedCount: 2, asked: 3, observed: '2 records with every field, at least 3 asked' }] })
  })

  it('runs no check on a page not read, and passes an empty result only where the contract allows it', () => {
    const contract: VerifyContract = { checks: [{ type: 'markdownIncludes', text: 'Price' }] }
    for (const status of ['failed', 'blocked', 'cancelled', 'budget_exceeded']) {
      expect(verify(contract, { status, markdown: 'Price' })).toMatchObject({ status: 'failed', reason: 'page_not_read', checks: [] })
    }
    expect(verify(contract, { status: 'empty_verified', markdown: null })).toMatchObject({ status: 'failed', reason: 'empty_not_allowed', checks: [] })
    expect(verify({ ...contract, emptyOk: true }, { status: 'empty_verified', markdown: null })).toMatchObject({ status: 'passed', reason: null, checks: [] })
    expect(verify(contract, { status: 'partial', markdown: 'Price: $5' })).toMatchObject({ status: 'passed', verifier: VERIFIER_VERSION })
    expect(verify(undefined, { status: 'success', markdown: 'x' })).toEqual({ status: 'not_requested' })
  })

  it("on a partial view, leaves a check it cannot read unjudged and counts a view's own tables", () => {
    const contract: VerifyContract = { checks: [{ type: 'markdownIncludes', text: 'Total' }, { type: 'field', path: 'json.data.total', present: true }, { type: 'minTables', min: 2 }] }
    // A DOM view: the page's text and the tables it shows, no JSON.
    const dom = verify(contract, { status: 'success', markdown: 'Total 42', tableCount: 2 }, { partial: true })
    expect(dom).toMatchObject({ status: 'passed', checks: [{ passed: true }, { passed: null, observed: 'not available in this view' }, { passed: true, observedCount: 2, asked: 2 }] })
    // The result's own view judges what it lacks as the runner does: no JSON is a failed check.
    expect(verify(contract, { status: 'success', markdown: 'Total 42' })).toMatchObject({ status: 'failed', checks: [{ passed: true }, { passed: false }, { passed: false, observedCount: 0 }] })
  })

  it("hashes the contract's canonical JSON, so key order does not change it", () => {
    const a = contractSha256({ checks: [{ type: 'markdownCountMin', pattern: '\\$\\d', min: 5, flags: 'i' }], emptyOk: false })
    const b = contractSha256({ emptyOk: false, checks: [{ min: 5, flags: 'i', pattern: '\\$\\d', type: 'markdownCountMin' }] } as VerifyContract)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(b).toBe(a)
    expect(contractSha256({ checks: [{ type: 'markdownCountMin', pattern: '\\$\\d', min: 6, flags: 'i' }], emptyOk: false })).not.toBe(a)
  })
})
