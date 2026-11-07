import { describe, expect, it } from 'vitest'
import { parseBatchStartRequest, parseCrawlStartRequest, parseMapRequest, parseScrapeRequest, RequestError } from '@w2l/contracts'
import { refusedFields } from '../src/refusedFields.js'

const refusal = (parse: (body: unknown) => unknown, body: unknown) => {
  try { parse(body) } catch (error) {
    if (error instanceof RequestError) return { error: error.message, code: error.code, details: error.details }
    throw error
  }
  throw new Error('the request was accepted')
}

describe('refusedFields', () => {
  it('reads the field from what the parsers answer', () => {
    const page = 'https://example.test/'
    expect(refusedFields(refusal(parseScrapeRequest, { url: page, timeout: 'soon' }))).toEqual(['timeout'])
    expect(refusedFields(refusal(parseScrapeRequest, { url: 5 }))).toEqual(['url'])
    expect(refusedFields(refusal(parseMapRequest, { url: page, limit: 0 }))).toEqual(['limit'])
    expect(refusedFields(refusal(parseCrawlStartRequest, { url: page, maxDepth: 'deep' }))).toEqual(['maxDepth'])
    expect(refusedFields(refusal(parseBatchStartRequest, { urls: 'no list' }))).toEqual(['urls'])
    expect(refusedFields(refusal(parseScrapeRequest, { url: page, formats: [{ type: 'json' }] }))).toEqual(['formats'])
    expect(refusedFields(refusal(parseScrapeRequest, { url: page, formats: [{ type: 'screenshot', quality: 0 }] }))).toEqual(['formats'])
    expect(refusedFields(refusal(parseScrapeRequest, { url: page, formats: ['gif'] }))).toEqual(['formats'])
  })

  it('names the keys a request sent that are refused, and only a name', () => {
    expect(refusedFields({ details: { parameters: ['location', 'stealth'] }, error: 'x' })).toEqual(['location', 'stealth'])
    expect(refusedFields({ details: { parameters: ['a b', 'c'.repeat(65), 'ok'] } })).toEqual(['ok'])
    expect(refusedFields({ details: { parameters: Array.from({ length: 9 }, (_, i) => `key${i}`) } })).toHaveLength(5)
    expect(refusedFields({ details: { formats: ['gif'] } })).toEqual(['formats'])
  })

  it('stops at the top level, where the rest of a path is what the caller sent', () => {
    const page = 'https://example.test/'
    expect(refusedFields(refusal(parseScrapeRequest, { url: page, headers: { 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY': 'x' } }))).toEqual(['headers'])
    expect(refusedFields(refusal(parseScrapeRequest, { url: page, headers: { 'abc.def_ghi/jkl=': 'Authorization' } }))).toEqual(['headers'])
    expect(refusedFields({ details: { parameters: ['formats[0].schema.properties.acme_customer_ssn.madeUp', 'formats[1].prompt'] } })).toEqual(['formats'])
  })

  it('says it does not know when the message names no request field', () => {
    expect(refusedFields({ error: 'body must be a JSON object' })).toBeNull()
    expect(refusedFields({ error: 'https://secret.example/ must be http(s)' })).toBeNull()
    expect(refusedFields({ error: 'Selector is not valid' })).toBeNull()
    expect(refusedFields({ details: { parameters: ['a b'] } })).toBeNull()
    expect(refusedFields(null)).toBeNull()
  })
})
