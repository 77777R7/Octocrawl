import { describe, expect, it } from 'vitest'
import type { FetchResult, JsonFormatRequest, ListExtraction, ListFormatRequest } from '@w2l/contracts'
import { extractStructured } from '../src/structured.js'

const url = 'https://example.test/products'
const request: ListFormatRequest = { type: 'list', itemSelector: '.item', fields: [{ name: 'name', selector: 'h2' }, { name: 'price', selector: '.price' }] }
function page(count = 1): FetchResult {
  const list: ListExtraction = { itemSelector: '.item', fields: ['name', 'price'], records: Array.from({ length: count }, (_, index) => ({ values: { name: 'Notebook', price: '$12.00' }, missing: [], source: { url, page: 1, index } })), pages: 1, incomplete: 0, truncated: false, csv: '', csvSha256: '' }
  return { requestedUrl: url, status: 'success', markdown: 'Notebook $12.00', evidence: { finalUrl: url, httpStatus: 200 }, list } as FetchResult
}
const read = (source: FetchResult, format?: JsonFormatRequest) => extractStructured(source, format, {}, null, request)

describe('selected-list JSON scope and bounds', () => {
  it('retains repeated records and their distinct source positions', async () => {
    const source = page(2)
    const out = await read(source)
    expect(out.status).toBe('complete')
    expect((out.data as any).records).toEqual(source.list!.records)
    expect((out.data as any).records.map((r: any) => r.source.index)).toEqual([0, 1])
  })

  it.each(['count', 'characters'] as const)('bounds %s without discarding the original list', async limit => {
    const source = page(limit === 'count' ? 2001 : 1)
    if (limit === 'characters') source.list!.records[0]!.values.price = 'x'.repeat(1_000_001)
    const before = JSON.stringify(source.list)
    const out = await read(source)
    expect(out).toMatchObject({ status: 'incomplete', data: null, evidence: [] })
    expect(out.issues[0]!.message).toMatch(/limit|budget/)
    expect(JSON.stringify(source.list)).toBe(before)
  })

  it.each(['empty', 'truncated', 'multiplePages', 'unrelatedSource', 'blocked'] as const)('does not mark %s input complete', async shape => {
    const source = page(shape === 'empty' ? 0 : 1)
    if (shape === 'truncated') source.list!.truncated = true
    if (shape === 'multiplePages') source.list!.pages = 2
    if (shape === 'unrelatedSource') source.list!.records[0]!.source.url = 'https://other.test/'
    if (shape === 'blocked') source.status = 'blocked'
    const out = await read(source)
    expect(out.status).toBe('incomplete')
    expect(out.issues.length).toBeGreaterThan(0)
  })

  it('preserves an unsettled amount as source text and an unavailable numeric value as null', async () => {
    const source = page()
    source.list!.records[0]!.values.price = '1,299'
    const out = await read(source, { type: 'json', schema: { type: 'object', properties: { price: { type: ['number', 'null'] }, currency: { type: ['string', 'null'] } }, required: ['price', 'currency'] } })
    expect(out).toMatchObject({ status: 'incomplete', data: { price: null, currency: null } })
    expect(out.evidence).toEqual([])
    expect(source.list!.records[0]!.values.price).toBe('1,299')
  })

  it('maps a root array and does not call a model for an ambiguous schema', async () => {
    const array: JsonFormatRequest = { type: 'json', schema: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } } }
    expect(await read(page(2), array)).toMatchObject({ status: 'complete', data: [{ name: 'Notebook' }, { name: 'Notebook' }] })
    let calls = 0
    const unsupported: JsonFormatRequest = { type: 'json', modelFallback: true, schema: { type: 'object', properties: { first: array.schema, second: array.schema } } }
    const out = await extractStructured(page(2), unsupported, {}, { baseUrl: 'https://model.invalid', model: 'not-called', fetch: async () => { calls++; throw new Error('no model request allowed') } }, request)
    expect(out).toMatchObject({ status: 'incomplete', data: null, modelUsage: null })
    expect(calls).toBe(0)
  })
})

describe('selected-list JSON from the selected table rows\' columns', () => {
  // Minimized from reserved v2 V23 (devguide.python.org) and V22 (endoflife.date): the list names the first cell only.
  const rows: ListFormatRequest = { type: 'list', itemSelector: 'table > tbody > tr', fields: [{ name: 'branch', selector: 'td' }] }
  const schema = (keys: string[]): JsonFormatRequest => ({ type: 'json', schema: { type: 'object', properties: { records: { type: 'array', items: { type: 'object', properties: Object.fromEntries(keys.map(key => [key, { type: 'string' }])), required: keys } } }, required: ['records'] } })
  function table(columns: FetchResult['listColumns']): FetchResult {
    const branches = ['main', '3.15']
    const list: ListExtraction = { itemSelector: rows.itemSelector!, fields: ['branch'], records: branches.map((branch, index) => ({ values: { branch }, missing: [], source: { url, page: 1, index } })), pages: 1, incomplete: 0, truncated: false, csv: '', csvSha256: '' }
    return { requestedUrl: url, status: 'success', markdown: '', evidence: { finalUrl: url, httpStatus: 200 }, list, listColumns: columns } as FetchResult
  }
  const header = (values: [string, string | null][]) => values.map(([h, value], i) => ({ header: h, column: i + 1, value }))
  const read = (source: FetchResult, format: JsonFormatRequest) => extractStructured(source, format, {}, null, rows)

  it('fills a key the list fields do not name from the column whose header names it, with the column as evidence', async () => {
    const source = table([
      header([['Branch', 'main'], ['Status', 'feature'], ['First release', '2027-10-06'], ['End of life', '2032-10']]),
      header([['Branch', '3.15'], ['Status', 'bugfix'], ['First release', '2026-10-09'], ['End of life', '2031-10']]),
    ])
    const out = await read(source, schema(['branch', 'status', 'first_release', 'end_of_life']))
    expect(out.status).toBe('complete')
    expect(out.data).toEqual({ records: [
      { branch: 'main', status: 'feature', first_release: '2027-10-06', end_of_life: '2032-10' },
      { branch: '3.15', status: 'bugfix', first_release: '2026-10-09', end_of_life: '2031-10' },
    ] })
    expect(out.evidence.find(item => item.path === '/records/1/first_release')).toEqual({ path: '/records/1/first_release', source: 'dom', evidencePath: `${JSON.stringify(url)} page 1 table > tbody > tr record 1 column 3 "First release" text` })
    expect(out.evidence.find(item => item.path === '/records/0/branch')!.evidencePath).toContain('record 0 td text')
  })

  it('keeps a named field\'s own value, and leaves out a key no header names, a column under no text and two columns that state different values', async () => {
    const source = table([
      header([['Branch', 'other'], ['Security Support', 'Ends in 5 years (31 Oct 2031)'], ['Status', null], ['Released', '2026'], ['Released', '2027']]),
      header([['Branch', 'other'], ['Security Support', 'Ends in 4 years (31 Oct 2030)'], ['Status', 'bugfix'], ['Released', '2025'], ['Released', '2025']]),
    ])
    const out = await read(source, schema(['branch', 'security_support_until', 'status', 'released']))
    expect(out.status).toBe('incomplete')
    expect(out.data).toEqual({ records: [{ branch: 'main' }, { branch: '3.15', status: 'bugfix', released: '2025' }] })
    expect(out.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'field_unavailable', path: '/records/0/security_support_until' }),
      expect.objectContaining({ code: 'field_unavailable', path: '/records/0/status' }),
      expect.objectContaining({ code: 'field_ambiguous', path: '/records/0/released' }),
    ]))
    expect(out.issues.some(issue => issue.path === '/records/1/released')).toBe(false)
  })

  it('counts against the JSON budget only the columns a key is read from', async () => {
    const many = 700
    const wide = table(Array.from({ length: many }, () => Array.from({ length: 10 }, (_, i) => ({ header: `Column header ${i}`, column: i + 1, value: `some cell value ${i}`.repeat(4) }))))
    wide.list!.records = Array.from({ length: many }, (_, index) => ({ values: { branch: 'main' }, missing: [], source: { url, page: 1, index } }))
    expect((await read(wide, schema(['branch']))).status).toBe('complete')
    const read2000 = table(Array.from({ length: 2000 }, () => [{ header: 'Status', column: 1, value: 'x'.repeat(600) }]))
    read2000.list!.records = Array.from({ length: 2000 }, (_, index) => ({ values: { branch: 'main' }, missing: [], source: { url, page: 1, index } }))
    const over = await read(read2000, schema(['branch', 'status']))
    expect(over).toMatchObject({ status: 'incomplete', data: null })
    expect(over.issues[0]!.message).toMatch(/budget/)
  })

  it('reads no column when the columns are not those of the selected records', async () => {
    const source = table([header([['Branch', 'main'], ['Status', 'feature']])])
    const out = await read(source, schema(['branch', 'status']))
    expect(out.data).toEqual({ records: [{ branch: 'main' }, { branch: '3.15' }] })
  })
})

