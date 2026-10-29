import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { unsafeRegexReason, type VerifyCheck, type VerifyContract } from '@w2l/contracts'
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
  it('reads only own properties at every field and list path segment', () => {
    const view = { status: 'success', markdown: 'Harbour', json: { data: { name: 'Harbour' } } }
    for (const path of ['constructor', '__proto__.toString', 'markdown.constructor', 'markdown.__proto__.toString', 'json.data.constructor', 'json.data.__proto__.toString']) {
      expect(verify({ checks: [{ type: 'field', path, present: true }] }, view), path).toMatchObject({ status: 'failed', checks: [{ passed: false }] })
      expect(verify({ checks: [{ type: 'field', path, present: false }] }, view), path).toMatchObject({ status: 'passed', checks: [{ passed: true }] })
    }
    const inherited = { status: 'success', json: { data: Object.create({ items: ['not delivered'], price: 42 }) } }
    expect(verify({ checks: [{ type: 'listRecordsMin', path: 'json.data.items', min: 1 }, { type: 'field', path: 'json.data.price', min: 1 }] }, inherited)).toMatchObject({ status: 'failed', checks: [{ passed: false }, { passed: false }] })
  })

  it('keeps own prototype-named JSON keys, null-prototype maps and array indexes readable', () => {
    const data = JSON.parse('{"constructor":"source constructor","__proto__":{"toString":"source text"},"hasOwnProperty":false,"items":[0,false]}') as Record<string, unknown>
    const nullMap = Object.assign(Object.create(null), { constructor: 'null-map value', price: 0 })
    const checks: VerifyCheck[] = [
      { type: 'field', path: 'json.data.constructor', equals: 'source constructor' },
      { type: 'field', path: 'json.data.__proto__.toString', equals: 'source text' },
      { type: 'field', path: 'json.data.hasOwnProperty', equals: false },
      { type: 'field', path: 'json.data.items.0', equals: 0 },
      { type: 'field', path: 'json.data.items.1', equals: false },
      { type: 'listRecordsMin', path: 'json.data.items', min: 2 },
      { type: 'field', path: 'nullMap.constructor', equals: 'null-map value' },
      { type: 'field', path: 'nullMap.price', equals: 0 },
    ]
    const view = { status: 'success', json: { data }, nullMap }
    const before = JSON.stringify(view)
    expect(verify({ checks }, view)).toMatchObject({ status: 'passed' })
    expect(JSON.stringify(view)).toBe(before)
  })

  it('leaves inherited roots unavailable on partial views', () => {
    const view = Object.assign(Object.create({ json: { data: { items: ['hidden'] } }, list: { records: [{ values: { name: 'hidden' } }] } }), { status: 'success', markdown: 'Harbour' })
    const checks: VerifyCheck[] = [
      { type: 'markdownIncludes', text: 'Harbour' },
      { type: 'field', path: 'json.data.items', present: true },
      { type: 'listRecordsMin', path: 'json.data.items', min: 1 },
      { type: 'recordFields', fields: ['name'], min: 1 },
    ]
    expect(verify({ checks }, view, { partial: true })).toMatchObject({ status: 'passed', checks: [{ passed: true }, { passed: null }, { passed: null }, { passed: null }] })
  })

  it('does not count inherited record fields or identity values as delivered values', () => {
    const records = [
      { values: { id: 'own', name: 'Own name' }, missing: [] },
      { values: Object.create({ id: 'inherited', name: 'Inherited name' }), missing: [] },
    ]
    const view = { status: 'success', list: { records } }
    expect(verify({ checks: [{ type: 'recordFields', fields: ['constructor'], min: 1 }] }, view)).toMatchObject({ status: 'failed', checks: [{ observedCount: 0 }] })
    expect(verify({ checks: [{ type: 'recordFields', fields: ['name'], uniqueBy: ['id'], min: 2 }] }, view)).toMatchObject({ status: 'failed', checks: [{ observedCount: 1 }] })
    const ownKeys = { status: 'success', list: { records: [{ values: { constructor: 'Source value', id: 0 }, missing: [] }] } }
    expect(verify({ checks: [{ type: 'recordFields', fields: ['constructor'], uniqueBy: ['id'], min: 1 }] }, ownKeys)).toMatchObject({ status: 'passed', checks: [{ observedCount: 1 }] })
  })

  it('does not let repeated complete records satisfy an explicitly distinct task count', () => {
    const records = [
      { values: { id: 'a', name: 'Glass vase', price: '12' }, missing: [] },
      { values: { id: 'a', name: 'Glass vase', price: '12' }, missing: [] },
      { values: { id: 'b', name: 'Clay bowl', price: '9' }, missing: [] },
    ]
    const check = { type: 'recordFields' as const, fields: ['name', 'price'], min: 3, uniqueBy: ['id'] }
    expect(verify({ checks: [check] }, { status: 'success', list: { records } })).toMatchObject({ status: 'failed', checks: [{ observedCount: 2, asked: 3 }] })
    expect(records).toHaveLength(3) // Verification never rewrites source records.
    expect(verify({ checks: [{ type: 'recordFields', fields: ['name', 'price'], min: 3 }] }, { status: 'success', list: { records } }).status).toBe('passed')
  })

  it('uses explicit compound identities and refuses missing or non-scalar identity values', () => {
    const records = [
      { values: { url: 'a|b', sku: 'c', name: 'Same title', price: '0' }, missing: [] },
      { values: { url: 'a', sku: 'b|c', name: 'Same title', price: '0' }, missing: [] },
      { values: { url: 'a|b', sku: 'c', name: 'Same title', price: '99' }, missing: [] },
      ...[null, '', '  ', {}, []].map(sku => ({ values: { url: 'a', sku, name: 'Title', price: '1' }, missing: [] })),
      { values: { url: 'a', sku: 'd', name: 'Title', price: '1' }, missing: ['sku'] },
    ]
    const check = { type: 'recordFields' as const, fields: ['name', 'price'], min: 2, uniqueBy: ['url', 'sku'] }
    expect(verify({ checks: [check] }, { status: 'success', list: { records } })).toMatchObject({ status: 'passed', checks: [{ observedCount: 2 }] })
    const zeros = [{ values: { id: 0, name: 'Zero' }, missing: [] }, { values: { id: false, name: 'False' }, missing: [] }]
    expect(verify({ checks: [{ ...check, fields: ['name'], uniqueBy: ['id'] }] }, { status: 'success', list: { records: zeros } })).toMatchObject({ status: 'passed', checks: [{ observedCount: 2 }] })
    expect(verify({ checks: [check] }, { status: 'success' }, { partial: true })).toMatchObject({ checks: [{ passed: null }] })
  })

  it('does not join incomplete duplicates or invent identities for otherwise complete records', () => {
    const records = [
      { values: { id: 'a', name: 'Vase', price: null }, missing: ['price'] },
      { values: { id: 'a', name: null, price: '12' }, missing: ['name'] },
      { values: { name: 'Bowl', price: '9' }, missing: [] },
      { values: { id: 'b', name: 'Cup', price: '0' }, missing: ['id'] },
      { values: { id: 'c', name: 'Plate', price: '4' }, missing: [] },
      { values: { id: 'c', name: 'Plate', price: '5' }, missing: [] },
    ]
    const before = JSON.stringify(records)
    expect(verify({ checks: [{ type: 'recordFields', fields: ['name', 'price'], min: 2, uniqueBy: ['id'] }] }, { status: 'success', list: { records } })).toMatchObject({ status: 'failed', checks: [{ observedCount: 1, asked: 2 }] })
    expect(JSON.stringify(records)).toBe(before)
  })

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

  it('sends only patterns the API accepts: no task pattern is one unsafeRegexReason refuses', () => {
    // run-set.mjs sends each task's predicates as its verify contract, and the API answers 400 to a refused pattern.
    const patterns = tasks.flatMap((task) => task.predicates.flatMap((p) => ('pattern' in p && typeof p.pattern === 'string' ? [{ id: task.id, type: p.type, pattern: p.pattern }] : [])))
    expect(patterns.length).toBeGreaterThan(0)
    expect(patterns.map(({ id, type, pattern }) => ({ id, type, pattern, refused: unsafeRegexReason(pattern) })).filter((p) => p.refused !== null)).toEqual([])
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

  it('fails listRecordsMin where there is no list, even at a minimum of 0, as the runner does', () => {
    for (const [check, doc] of [
      [{ type: 'listRecordsMin', min: 0 }, { status: 'success', markdown: '' }],
      [{ type: 'listRecordsMin', min: 0, path: 'json.data.items' }, { status: 'success', markdown: '', json: { data: {} } }],
      [{ type: 'listRecordsMin', min: 0 }, { status: 'success', markdown: '', list: { records: [] } }],
    ] as [VerifyCheck, Record<string, unknown>][]) {
      const verification = verify({ checks: [check] }, doc)
      if (verification.status === 'not_requested') throw new Error('a contract was sent')
      expect(verification.checks[0]!.passed).toBe(judge(check, doc))
    }
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
    // No list at all fails, even at a minimum of 0, as listRecordsMin does.
    expect(verify({ checks: [{ type: 'recordFields', fields: ['name'], min: 0 }] }, { status: 'success', markdown: '' })).toMatchObject({ status: 'failed', checks: [{ passed: false, observedCount: 0 }] })
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

describe('bounded regular-expression checks (ADR 0006, amendment of 2026-10-29)', () => {
  // The regexp backtrack stack overflows near 4,194,288 characters for ^(a)*$ (Node 22; 4,194,296 on Node 26): one size
  // well above it on every build, one well below.
  const overflowing = 'a'.repeat(4_300_000)
  const fitting = 'a'.repeat(4_000_000)

  it('records a pattern the engine cannot run on a page as not judged, without a count and without the page size', () => {
    for (const check of [{ type: 'markdownMatches', pattern: '^(a)*$' }, { type: 'markdownCountMin', pattern: '^(a)*$', min: 1 }] as VerifyCheck[]) {
      const verification = verify({ checks: [check] }, { status: 'success', markdown: overflowing })
      expect(verification).toMatchObject({ status: 'failed', reason: 'checks_failed', checks: [{ passed: null, limit: 'error' }] })
      if (verification.status === 'not_requested') throw new Error('unreachable')
      expect(verification.checks[0]).not.toHaveProperty('observedCount')
      expect(verification.checks[0]!.observed).toMatch(/^not judged: /)
      expect(verification.checks[0]!.observed).not.toMatch(/4,300,000|4300000/)
    }
    expect(verify({ checks: [{ type: 'markdownMatches', pattern: '^(a)*$' }] }, { status: 'success', markdown: fitting })).toMatchObject({ status: 'passed', checks: [{ passed: true }] })
  })

  it('never passes a contract with a check left undecided, on a partial view or the result itself', () => {
    const contract: VerifyContract = { checks: [{ type: 'markdownIncludes', text: 'a' }, { type: 'markdownMatches', pattern: '^(a)*$' }] }
    for (const options of [{}, { partial: true }]) {
      expect(verify(contract, { status: 'success', markdown: overflowing }, options)).toMatchObject({ status: 'failed', reason: 'checks_failed', checks: [{ passed: true }, { passed: null, limit: 'error' }] })
    }
    // A definite failure stays in the checks beside the undecided one.
    const both = verify({ checks: [{ type: 'markdownIncludes', text: 'Price' }, { type: 'markdownMatches', pattern: '^(a)*$' }] }, { status: 'success', markdown: overflowing })
    expect(both).toMatchObject({ status: 'failed', checks: [{ passed: false }, { passed: null, limit: 'error' }] })
    // At a minimum of 0 the count decides nothing: the check passes, with its limit noted.
    expect(verify({ checks: [{ type: 'markdownCountMin', pattern: '^(a)*$', min: 0 }] }, { status: 'success', markdown: overflowing })).toMatchObject({ status: 'passed', checks: [{ passed: true, limit: 'error' }] })
  })

  it('counts exactly as String.prototype.match does, the same script run again and again', () => {
    const count = (pattern: string, flags: string | undefined, markdown: string): unknown => {
      const verification = verify({ checks: [{ type: 'markdownCountMin', pattern, ...(flags === undefined ? {} : { flags }), min: 0 }] }, { status: 'success', markdown })
      return verification.status === 'not_requested' ? null : verification.checks[0]!.observedCount
    }
    const emoji = '\u{1F600}a\u{1F600}'
    for (let round = 0; round < 3; round++) {
      expect(count('a*', undefined, 'baab')).toBe(4)
      expect(count('', 'u', emoji)).toBe(4)
      expect(count('', undefined, emoji)).toBe(6)
      expect(count('a', 'y', 'aab a')).toBe(2)
      expect(count('k', 'iu', 'k K K')).toBe(3)
      expect(count('k', 'i', 'k K K')).toBe(2)
      expect(count('^x', undefined, 'x\nx')).toBe(1)
      expect(count('^x', 'm', 'x\nx')).toBe(2)
    }
    // markdownMatches keeps its default m only when no flags are given, and y matches at the start.
    expect(verify({ checks: [{ type: 'markdownMatches', pattern: '^b' }] }, { status: 'success', markdown: 'a\nb' })).toMatchObject({ status: 'passed' })
    expect(verify({ checks: [{ type: 'markdownMatches', pattern: '^b', flags: 'i' }] }, { status: 'success', markdown: 'a\nb' })).toMatchObject({ status: 'failed' })
    expect(verify({ checks: [{ type: 'markdownMatches', pattern: 'a', flags: 'y' }] }, { status: 'success', markdown: 'ab' })).toMatchObject({ status: 'passed' })
    expect(verify({ checks: [{ type: 'markdownMatches', pattern: 'b', flags: 'y' }] }, { status: 'success', markdown: 'ab' })).toMatchObject({ status: 'failed' })
  })
})
