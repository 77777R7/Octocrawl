import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import type { FetchResult } from '@w2l/contracts'
import { extractStructured } from '@w2l/api/structured'
import { extractTf } from '@w2l/extract-tf'
import { createPreviewServer } from '../src/server.js'
import { mapPreviewResult, normalizePreviewUrl, type CaptureOutcome } from '../src/preview.js'
import { MAX_FIELDS, parsePreviewRequest, PreviewOptionsError, type PreviewOptions } from '../src/options.js'

const servers: Server[] = []
afterEach(async () => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
})

const schema = (properties: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false, ...extra })
const priced = schema({ price: { type: ['number', 'null'] }, tags: { type: ['array', 'null'], items: { type: 'string' } } })
const refused = (body: unknown): string => {
  try { parsePreviewRequest(body) } catch (error) { if (error instanceof PreviewOptionsError) return error.message; throw error }
  throw new Error('accepted')
}

describe('preview request options', () => {
  it('accepts a URL alone, the main-content switch, and Markdown, links and fields', () => {
    expect(parsePreviewRequest({ url: 'https://docs.example/a' })).toEqual({ url: 'https://docs.example/a', options: {} })
    expect(parsePreviewRequest({ url: 'https://docs.example/a', onlyMainContent: false }).options).toEqual({ onlyMainContent: false })
    const request = parsePreviewRequest({ url: 'https://docs.example/a', formats: ['markdown', 'links', { type: 'json', schema: priced }] })
    expect(request.options.formats).toEqual(['markdown', 'links', { type: 'json', schema: priced }])
  })

  it('refuses every other parameter by name, model settings included', () => {
    for (const key of ['debug', 'mode', 'waitFor', 'timeout', 'maxFileBytes', 'includeLinks', 'allowlistedDomains', 'headers']) {
      expect(refused({ url: 'https://docs.example/a', [key]: true })).toContain(`"${key}"`)
    }
    expect(refused({ url: 'https://docs.example/a', formats: [{ type: 'json', schema: priced, prompt: 'Find the price' }] })).toContain('"prompt"')
    expect(refused({ url: 'https://docs.example/a', formats: [{ type: 'json', schema: priced, modelFallback: false }] })).toContain('"modelFallback"')
    expect(refused({ url: 'https://docs.example/a', formats: ['json'] })).toContain('needs the fields')
    expect(refused({ url: 'https://docs.example/a', onlyMainContent: 'no' })).toContain('true or false')
  })

  it('refuses duplicate, unknown and too many formats', () => {
    expect(refused({ url: 'https://docs.example/a', formats: ['markdown', 'markdown'] })).toContain('once')
    expect(refused({ url: 'https://docs.example/a', formats: ['html'] })).toContain('Each format')
    expect(refused({ url: 'https://docs.example/a', formats: [] })).toContain('1 to 3')
    expect(refused({ url: 'https://docs.example/a', formats: ['markdown', 'links', { type: 'json', schema: priced }, 'markdown'] })).toContain('1 to 3')
  })

  it('keeps the fields to a small flat schema of plain values', () => {
    const many = Object.fromEntries(Array.from({ length: MAX_FIELDS + 1 }, (_, i) => [`field${i}`, { type: 'string' }]))
    const withSchema = (value: unknown) => refused({ url: 'https://docs.example/a', formats: [{ type: 'json', schema: value }] })
    expect(withSchema(schema(many))).toContain(`1 to ${MAX_FIELDS}`)
    expect(withSchema(schema({ note: { type: 'string', description: 'x'.repeat(4200) } }))).toContain('4096 bytes')
    expect(withSchema(schema({ offer: { type: 'object', properties: { price: { type: 'number' } } } }))).toContain('"properties"')
    expect(withSchema(schema({ sku: { type: 'string', pattern: '^(a+)+$' } }))).toContain('"pattern"')
    expect(withSchema(schema({ ref: { $ref: '#/$defs/x' } }))).toContain('"$ref"')
    expect(withSchema({ type: 'object', properties: JSON.parse('{"__proto__": {"type": "string"}}') })).toContain('needs a name')
    expect(withSchema(schema({ 'bad/name': { type: 'string' } }))).toContain('needs a name')
    expect(withSchema(schema({ tags: { type: 'array' } }))).toContain('items')
    expect(withSchema(schema({ tags: { type: 'array', items: { type: 'object' } } }))).toContain('text, numbers')
    expect(withSchema(schema({ price: { type: ['number', 'string'] } }))).toContain('exactly one type')
    expect(withSchema({ ...schema({ price: { type: 'number' } }), required: ['cost'] })).toContain('"required"')
    expect(withSchema({ type: 'array', properties: {} })).toContain('object schema')
    expect(withSchema({ type: 'array', items: { type: 'string' } })).toContain('"items"')
  })
})

function fixture(url: string): CaptureOutcome {
  const result = {
    requestedUrl: url, status: 'success', failureReason: null, blockReason: null, budgetExceeded: null,
    markdown: '# Example page\n\nContent',
    evidence: { finalUrl: url, httpStatus: 200, rawBodySha256: 'fixture-sha' },
    usage: { attemptCount: 1, browserMs: 0, externalCostUsd: null },
    document: { title: 'Example page', adapter: { id: 'generic' }, adapterValidation: { valid: true, issues: [] } },
    links: ['https://docs.example/b'],
    metadata: { title: 'Example', description: null, language: 'en', keywords: null, robots: null, favicon: null, canonicalUrl: null },
  } as unknown as FetchResult
  return { result }
}

async function endpoint(capture: Parameters<typeof createPreviewServer>[0]['capture'], counters: { quota: number }) {
  const server = createPreviewServer({
    quota: { consume: async () => { counters.quota++; return 'ok' } },
    capture,
    staticDir: '/missing-static-test',
    amazonState: '[]',
    amazonGate: { acquire: async () => ({ noteRetryAfter: async () => {}, release: async () => {} }) },
  })
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/preview`
}

const post = (url: string, body: unknown) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

describe('preview options on the server', () => {
  it('refuses unsupported options before quota and capture, naming them', async () => {
    const counters = { quota: 0 }
    let captures = 0
    const url = await endpoint(async target => { captures++; return fixture(target.url) }, counters)
    const response = await post(url, { url: 'https://docs.example/a', formats: [{ type: 'json', schema: priced, prompt: 'guess' }] })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ status: 'invalid_url', requestedUrl: 'https://docs.example/a', diagnostic: { code: 'invalid_options', stage: 'input' } })
    const large = await post(url, { url: 'https://docs.example/a', onlyMainContent: false, padding: 'x'.repeat(9000) })
    expect(large.status).toBe(400)
    const amazon = await post(url, { url: 'https://www.amazon.sg/dp/B000NI69YA', onlyMainContent: false })
    expect(amazon.status).toBe(400)
    expect((await amazon.json()).reason).toContain('take no options')
    expect(counters.quota).toBe(0)
    expect(captures).toBe(0)
  })

  it('passes accepted options to the capture and narrows the result to the formats asked for', async () => {
    const counters = { quota: 0 }
    const seen: (PreviewOptions | undefined)[] = []
    const url = await endpoint(async (target, _signal, _deadlineAt, _state, _evaluation, _retry, _proxy, _exception, options) => { seen.push(options); return fixture(target.url) }, counters)
    const response = await post(url, { url: 'https://docs.example/a', onlyMainContent: false, formats: ['links'] })
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(seen).toEqual([{ onlyMainContent: false, formats: ['links'] }])
    expect(body.markdown).toBeNull()
    expect(body.links).toEqual(['https://docs.example/b'])
    expect(body.metadata).toMatchObject({ language: 'en' })
    expect(counters.quota).toBe(1)
  })
})

describe('fields', () => {
  const html = `<html lang="en"><head><title>Lamp | Shop</title></head><body><main><h1>Brass lamp</h1><p>A brass desk lamp with a frosted glass shade.</p>
<table><tr><th>Price</th><td>£48.00</td></tr><tr><th>Colour</th><td>Brass</td></tr></table></main></body></html>`
  const url = 'https://shop.example/lamp'
  const out = extractTf.extract(html, { url })
  const page = {
    ...fixture(url).result, metadata: out.metadata,
    document: { title: out.title, pageType: out.pageType, strategy: out.strategy, confidence: out.confidence, product: out.product ?? null, adapter: out.adapter, entities: out.entities, adapterValidation: out.adapterValidation, labelledValues: out.labelledValues },
  } as FetchResult

  it('reads the fields from the page itself, never asking a model even when one is configured', async () => {
    vi.stubEnv('W2L_EXTRACT_BASE_URL', 'https://model.example/v1')
    vi.stubEnv('W2L_EXTRACT_MODEL', 'any-model')
    const spy = vi.fn(async () => new Response('{}'))
    vi.stubGlobal('fetch', spy)
    const fieldSchema = schema({ price: { type: ['number', 'null'] }, colour: { type: ['string', 'null'] }, weight: { type: ['number', 'null'] } })
    // Exactly as capturePreview asks: no model fallback and no model configuration.
    const fields = await extractStructured(page, { type: 'json', schema: fieldSchema as never, modelFallback: false }, {}, null)
    expect(spy).not.toHaveBeenCalled()
    const mapped = mapPreviewResult(url, normalizePreviewUrl(url), { result: page, fields }, 10, { formats: [{ type: 'json', schema: fieldSchema as never }] })
    expect(mapped.json?.data).toMatchObject({ colour: 'Brass', weight: null })
    // In the order asked for, though the extraction lists the fields it found first.
    expect(Object.keys(mapped.json?.data as object)).toEqual(['price', 'colour', 'weight'])
    expect(mapped.json?.evidence.some(item => item.path === '/colour')).toBe(true)
    expect(JSON.stringify(mapped.json)).not.toContain('modelUsage')
    // Only the fields were asked for: no Markdown or links, but the page info still comes.
    expect(mapped.markdown).toBeNull()
    expect(mapped).not.toHaveProperty('links')
    expect(mapped.metadata).toMatchObject({ language: 'en' })
  })

  it('leaves out fields that would make the response large', async () => {
    const fields = { status: 'complete' as const, data: { notes: ['x'.repeat(70_000)] }, evidence: [], issues: [], modelUsage: null }
    const mapped = mapPreviewResult(url, normalizePreviewUrl(url), { result: page, fields }, 10)
    expect(mapped.json).toMatchObject({ status: 'incomplete', data: null, issues: [{ code: 'too_large' }] })
  })
})
