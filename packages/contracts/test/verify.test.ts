import { describe, expect, it } from 'vitest'
import { MAX_VERIFY_CHECKS, parseBatchStartRequest, parseCrawlStartRequest, parseScrapeRequest, RequestError } from '../src/index.js'

const scrape = (verify: unknown) => parseScrapeRequest({ url: 'https://example.com/', verify })
const refused = (verify: unknown): string => {
  try { scrape(verify) } catch (error) { expect(error).toBeInstanceOf(RequestError); return (error as Error).message }
  throw new Error('accepted')
}

describe('a task contract on a request (verify, ADR 0006)', () => {
  it('bounds and validates optional identity keys without accepting an implicit identity', () => {
    for (const uniqueBy of [[], 'url', ['url', 'url'], [' '], [null], Array.from({ length: 51 }, (_, i) => `key${i}`)]) {
      expect(refused({ checks: [{ type: 'recordFields', fields: ['name'], min: 2, uniqueBy }] })).toContain('uniqueBy')
    }
  })

  it('reads explicitly declared distinct record keys on the existing recordFields check', () => {
    const verify = { checks: [{ type: 'recordFields', fields: ['name', 'price'], min: 3, uniqueBy: ['url', 'sku'] }] }
    expect(scrape(verify).verify).toEqual(verify)
  })

  it('is read on scrape, batch and crawl as it was written, and is absent when not sent', () => {
    const verify = {
      checks: [
        { type: 'markdownMatches', pattern: 'Price', flags: 'i' },
        { type: 'markdownCountMin', pattern: '\\$\\d', min: 5 },
        { type: 'markdownIncludes', text: 'Add to cart' },
        { type: 'minTables', min: 1 },
        { type: 'tableRowsMin', tableIndex: 0, columns: [0, 2], min: 3 },
        { type: 'listRecordsMin', min: 10 },
        { type: 'recordFields', fields: ['name', 'price', 'url'], min: 5 },
        { type: 'field', path: 'json.data.price', min: 0 },
      ],
      emptyOk: true,
    }
    expect(scrape(verify).verify).toEqual(verify)
    expect(parseBatchStartRequest({ urls: ['https://example.com/'], verify }).verify).toEqual(verify)
    expect(parseCrawlStartRequest({ url: 'https://example.com/', verify }).verify).toEqual(verify)
    expect(parseScrapeRequest({ url: 'https://example.com/' })).not.toHaveProperty('verify')
  })

  it('takes only the keys it names, at its own level and in each check', () => {
    expect(refused({ checks: [{ type: 'minTables', min: 1 }], region: '#main' })).toContain('verify.region')
    expect(refused({ checks: [{ type: 'minTables', min: 1, pattern: 'x' }] })).toContain('verify.checks[0].pattern')
    expect(refused({ checks: [{ type: 'markdownRegex', pattern: 'x' }] })).toContain('verify.checks[0].type must be one of')
    expect(refused({ checks: [] })).toContain(`1 to ${MAX_VERIFY_CHECKS} checks`)
    expect(refused({ checks: Array.from({ length: MAX_VERIFY_CHECKS + 1 }, () => ({ type: 'minTables', min: 1 })) })).toContain(`1 to ${MAX_VERIFY_CHECKS} checks`)
    expect(refused([{ type: 'minTables', min: 1 }])).toContain('verify must be an object')
    expect(refused({ checks: [{ type: 'minTables', min: 1 }], emptyOk: 'yes' })).toContain('verify.emptyOk must be a boolean')
  })

  it('requires an explicit table and 1–50 distinct, bounded column indexes for tableRowsMin', () => {
    const check = { type: 'tableRowsMin', tableIndex: 0, columns: [0, 2], min: 1 }
    for (const columns of [[], [0, 0], [1.5], [-1], [1_000_001], ['1'], Array.from({ length: 51 }, (_, i) => i)]) {
      expect(refused({ checks: [{ ...check, columns }] })).toContain('.columns')
    }
    for (const tableIndex of [undefined, -1, 1.5, 1_000_001]) expect(refused({ checks: [{ ...check, tableIndex }] })).toContain('.tableIndex')
    expect(refused({ checks: [{ ...check, min: -1 }] })).toContain('.min')
    expect(refused({ checks: [{ ...check, path: 'tables' }] })).toContain('.path')
  })

  it('compiles each pattern, takes flags from i, m, s, u and y, and refuses a pattern that can backtrack catastrophically', () => {
    expect(refused({ checks: [{ type: 'markdownMatches', pattern: '(' }] })).toContain('not a valid regular expression')
    expect(refused({ checks: [{ type: 'markdownMatches', pattern: 'x', flags: 'g' }] })).toContain('flags may hold only')
    expect(refused({ checks: [{ type: 'markdownCountMin', pattern: '(a+)+$', min: 1 }] })).toContain('verify.checks[0].pattern is refused')
    expect(refused({ checks: [{ type: 'markdownIncludes', text: 'x'.repeat(1_001) }] })).toContain('1 to 1000 characters')
  })

  it('needs exactly one comparison on a field check, and counts that are whole numbers', () => {
    expect(refused({ checks: [{ type: 'field', path: 'json.data.price' }] })).toContain('exactly one comparison')
    expect(refused({ checks: [{ type: 'field', path: 'json.data.price', present: true, equals: 1 }] })).toContain('exactly one comparison')
    expect(scrape({ checks: [{ type: 'field', path: 'json.data.price', min: 1, max: 5 }] }).verify?.checks[0]).toEqual({ type: 'field', path: 'json.data.price', min: 1, max: 5 })
    expect(refused({ checks: [{ type: 'field', path: 'lane', in: [{}] }] })).toContain('.in must be a list')
    expect(refused({ checks: [{ type: 'listRecordsMin', min: 1.5 }] })).toContain('must be an integer')
    expect(refused({ checks: [{ type: 'recordFields', fields: [], min: 1 }] })).toContain('fields must be a list')
  })
})
