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
