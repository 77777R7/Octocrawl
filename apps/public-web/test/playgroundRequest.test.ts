import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { fieldsSchema, isAmazonProduct, restBody, type CodeRequest, type OutputView } from '../src/getCode.js'
import { parsePreviewRequest } from '../../../packages/public-preview/src/options.js'

// The dashboard's Playground reads its rules from a plain script (public/docs-assets/playground-request.js); these
// tests hold that script to the home page's own code, so the two cannot ask for different things.
const context: { OctoRequest?: {
  VIEWS: string[]
  MAX_FIELDS: number
  PRODUCT_FIELDS: CodeRequest['fields']
  isAmazonProduct(url: string): boolean
  fieldsSchema(fields: CodeRequest['fields']): unknown
  restBody(request: CodeRequest): unknown
  runBody(request: CodeRequest): Record<string, unknown>
  fieldProblem(fields: CodeRequest['fields']): string | null
} } = {}
runInNewContext(readFileSync(new URL('../public/docs-assets/playground-request.js', import.meta.url), 'utf8'), Object.assign(context, { URL }))
const octo = context.OctoRequest!

const VIEWS: OutputView[] = ['markdown', 'links', 'info', 'fields', 'json']
const URLS = ['https://docs.example/a', 'https://www.amazon.sg/dp/B0CHX1W1XY', 'https://amazon.sg/dp/b0chx1w1xy/', 'https://www.amazon.sg/s?k=tea', 'not a url']
const FIELDS: CodeRequest['fields'][] = [[], [{ name: 'price', type: 'number' }], [{ name: 'name', type: 'string' }, { name: 'tags', type: 'string[]' }, { name: 'inStock', type: 'boolean' }]]

describe('the Playground asks for what the home page asks for', () => {
  it('offers the hero\'s five views', () => {
    expect(octo.VIEWS).toEqual(VIEWS)
  })

  it('writes the same Get code body as the hero for every view, URL, field set and content choice', () => {
    for (const url of URLS) for (const view of VIEWS) for (const fields of FIELDS) for (const onlyMainContent of [true, false]) {
      const request = { url, view, fields, onlyMainContent }
      expect(octo.restBody(request), JSON.stringify(request)).toEqual(restBody(request))
    }
    for (const url of URLS) expect(octo.isAmazonProduct(url)).toBe(isAmazonProduct(url))
    for (const fields of FIELDS) expect(octo.fieldsSchema(fields)).toEqual(fieldsSchema(fields))
  })

  it('runs one extraction as the hero\'s preview does, in a body the preview\'s own checks accept', () => {
    expect(octo.runBody({ url: 'https://docs.example/a', view: 'links', fields: [], onlyMainContent: true })).toEqual({ url: 'https://docs.example/a' })
    expect(octo.runBody({ url: 'https://docs.example/a', view: 'markdown', fields: [], onlyMainContent: false })).toEqual({ url: 'https://docs.example/a', onlyMainContent: false })
    expect(octo.runBody({ url: 'https://docs.example/a', view: 'fields', fields: FIELDS[1]!, onlyMainContent: true })).toEqual({ url: 'https://docs.example/a', formats: ['markdown', 'links', { type: 'json', schema: fieldsSchema(FIELDS[1]!) }] })
    // An Amazon.sg product page takes no options, as on the home page.
    expect(octo.runBody({ url: 'https://www.amazon.sg/dp/B0CHX1W1XY', view: 'fields', fields: FIELDS[2]!, onlyMainContent: false })).toEqual({ url: 'https://www.amazon.sg/dp/B0CHX1W1XY' })
    for (const fields of [...FIELDS, octo.PRODUCT_FIELDS]) for (const onlyMainContent of [true, false]) {
      // As it travels: JSON, which also gives the objects this realm's prototype (the script ran in its own context).
      expect(() => parsePreviewRequest(JSON.parse(JSON.stringify(octo.runBody({ url: 'https://docs.example/a', view: 'markdown', fields, onlyMainContent }))))).not.toThrow()
    }
  })

  it('names a field the API would refuse', () => {
    expect(octo.fieldProblem([{ name: 'price', type: 'number' }])).toBeNull()
    expect(octo.fieldProblem([{ name: '-price', type: 'number' }])).toMatch(/letters, digits/)
    expect(octo.fieldProblem([{ name: 'a', type: 'string' }, { name: 'a', type: 'number' }])).toMatch(/twice/)
    expect(octo.fieldProblem(Array.from({ length: 21 }, (_, i) => ({ name: `f${i}`, type: 'string' as const })))).toMatch(/at most 20/)
  })
})
