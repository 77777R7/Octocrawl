import { describe, expect, it } from 'vitest'
import { fieldsSchema, isAmazonProduct, mcpCall, mcpPrompt, mcpSnippet, restBody, restSnippet, shellQuote, type CodeRequest } from '../src/getCode.js'

const request = (extra: Partial<CodeRequest> = {}): CodeRequest => ({ url: 'https://docs.example/a', view: 'markdown', onlyMainContent: true, fields: [], ...extra })

describe('Get code', () => {
  it('quotes a shell word, including single quotes in it', () => {
    expect(shellQuote('plain')).toBe(`'plain'`)
    expect(shellQuote(`it's`)).toBe(`'it'\\''s'`)
  })

  it('asks the local API for what the chosen view shows', () => {
    expect(restBody(request())).toEqual({ url: 'https://docs.example/a', formats: ['markdown'] })
    expect(restBody(request({ view: 'links' }))).toEqual({ url: 'https://docs.example/a', formats: ['links'] })
    expect(restBody(request({ view: 'json' }))).toEqual({ url: 'https://docs.example/a', formats: ['markdown', 'links'] })
    expect(restBody(request({ onlyMainContent: false }))).toMatchObject({ onlyMainContent: false })
  })

  it('adds the fields as a nullable flat JSON Schema', () => {
    const fields = [{ name: 'price', type: 'number' as const }, { name: 'tags', type: 'string[]' as const }]
    expect(fieldsSchema(fields)).toEqual({
      type: 'object',
      properties: { price: { type: ['number', 'null'] }, tags: { type: ['array', 'null'], items: { type: 'string' } } },
      required: ['price', 'tags'],
      additionalProperties: false,
    })
    expect(restBody(request({ view: 'fields', fields }))).toMatchObject({ formats: ['markdown', { type: 'json', schema: fieldsSchema(fields) }] })
    expect(fieldsSchema([])).toBeNull()
  })

  it('writes a curl command whose body survives a URL with a quote in it', () => {
    const snippet = restSnippet(request({ url: `https://docs.example/it's` }))
    expect(snippet).toContain('curl -sS -X POST http://127.0.0.1:8787/v1/scrape')
    expect(snippet).toContain(`'\\''`)
    const quoted = snippet.split('-d ')[1]!
    // Undo the shell quoting and read the JSON back.
    const body = JSON.parse(quoted.slice(1, -1).replace(/'\\''/g, `'`))
    expect(body.url).toBe(`https://docs.example/it's`)
  })

  it('uses the checked product tool for an Amazon.sg product, with no options', () => {
    const amazon = request({ url: 'https://www.amazon.sg/dp/B000NI69YA', onlyMainContent: false, fields: [{ name: 'price', type: 'number' }] })
    expect(isAmazonProduct(amazon.url)).toBe(true)
    expect(isAmazonProduct('https://www.amazon.sg/s?k=tea')).toBe(false)
    expect(mcpCall(amazon)).toEqual({ tool: 'scrape_product', arguments: { url: 'https://www.amazon.sg/dp/B000NI69YA' } })
    expect(restBody(amazon)).toEqual({ url: 'https://www.amazon.sg/dp/B000NI69YA', formats: ['markdown', 'json'] })
    expect(mcpPrompt(amazon)).toContain('scrape_product')
  })

  it('says in plain words what to ask an MCP client', () => {
    expect(mcpCall(request({ view: 'links' }))).toEqual({ tool: 'scrape', arguments: { url: 'https://docs.example/a', formats: ['links'] } })
    expect(mcpPrompt(request({ view: 'links' }))).toBe("Use Octocrawl's scrape tool on https://docs.example/a and return its links.")
    expect(mcpPrompt(request({ onlyMainContent: false, fields: [{ name: 'price', type: 'number' }] }))).toBe("Use Octocrawl's scrape tool on https://docs.example/a (the whole page, not only the main content) and return these fields: price.")
  })
})

describe('Get code: the MCP call', () => {
  it('keeps a short call short, and valid JSON', () => {
    const snippet = mcpSnippet(request({ view: 'links' }))
    expect(snippet.split('\n')).toHaveLength(4)
    expect(JSON.parse(snippet)).toEqual({ tool: 'scrape', arguments: { url: 'https://docs.example/a', formats: ['links'] } })
  })
})
