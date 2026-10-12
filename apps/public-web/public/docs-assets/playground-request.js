// What the dashboard's Playground asks for, by the home page's rules: the same five views of one extraction (Markdown,
// links, page info, fields, the whole result), the same options (main content or the whole page, up to 20 fields) and
// the same code. restBody, fieldsSchema and isAmazonProduct copy apps/public-web/src/getCode.ts, and runBody copies
// the home page's previewBody (src/main.ts); apps/public-web/test/playgroundRequest.test.ts holds them to those, so the
// Playground cannot drift from the hero. Plain script for the dashboard, which loads no bundle: window.OctoRequest.
(() => {
  const VIEWS = ['markdown', 'links', 'info', 'fields', 'json']
  const MAX_FIELDS = 20
  const FIELD_NAME = /^[\p{L}\p{N}][\p{L}\p{N} _.-]{0,63}$/u
  const FIELD_TYPES = [['string', 'text'], ['number', 'number'], ['boolean', 'yes / no'], ['string[]', 'list of text']]
  const PRODUCT_FIELDS = [
    { name: 'name', type: 'string' }, { name: 'brand', type: 'string' }, { name: 'price', type: 'number' }, { name: 'currency', type: 'string' },
    { name: 'availability', type: 'string' }, { name: 'sku', type: 'string' }, { name: 'rating', type: 'number' }, { name: 'reviewCount', type: 'number' },
  ]

  /** Amazon.sg /dp/{ASIN}: it has its own checked product reading and takes no options. */
  const isAmazonProduct = (url) => {
    try {
      const parsed = new URL(url)
      return (parsed.hostname === 'amazon.sg' || parsed.hostname === 'www.amazon.sg') && /^\/dp\/[A-Z0-9]{10}\/?$/i.test(parsed.pathname)
    } catch { return false }
  }

  /** A flat object schema, every field nullable: a field the page does not state comes back null with a reason. */
  const fieldsSchema = (fields) => {
    if (!fields.length) return null
    const properties = {}
    for (const field of fields) {
      properties[field.name] = field.type === 'string[]' ? { type: ['array', 'null'], items: { type: 'string' } } : { type: [field.type, 'null'] }
    }
    return { type: 'object', properties, required: fields.map((field) => field.name), additionalProperties: false }
  }

  /** The hosted API's body for the view asked for, as the hero's Get code writes it. */
  const restBody = (request) => {
    if (isAmazonProduct(request.url)) return { url: request.url, formats: ['markdown', 'json'] }
    const schema = fieldsSchema(request.fields)
    const base = request.view === 'links' ? ['links'] : request.view === 'json' ? ['markdown', 'links'] : ['markdown']
    return { url: request.url, formats: schema === null ? base : [...base, { type: 'json', schema }], ...(request.onlyMainContent ? {} : { onlyMainContent: false }) }
  }

  /** What one run asks for, as the hero's preview does: one extraction with every view in it, so switching views
   * after a run costs nothing. Markdown and links come by default; the fields only when some are set. */
  const runBody = (request) => {
    const body = { url: request.url }
    if (isAmazonProduct(request.url)) return body
    if (!request.onlyMainContent) body.onlyMainContent = false
    const schema = fieldsSchema(request.fields)
    if (schema) body.formats = ['markdown', 'links', { type: 'json', schema }]
    return body
  }

  /** A field name the API accepts, once each; the first problem, or null. */
  const fieldProblem = (fields) => {
    const seen = new Set()
    for (const field of fields) {
      if (!FIELD_NAME.test(field.name) || ['__proto__', 'constructor', 'prototype'].includes(field.name)) return `“${field.name}” can use letters, digits, spaces, dots, dashes and underscores, starting with a letter or digit.`
      if (seen.has(field.name)) return `“${field.name}” is listed twice.`
      seen.add(field.name)
    }
    return fields.length > MAX_FIELDS ? `Ask for at most ${MAX_FIELDS} fields.` : null
  }

  const api = { VIEWS, MAX_FIELDS, FIELD_TYPES, PRODUCT_FIELDS, isAmazonProduct, fieldsSchema, restBody, runBody, fieldProblem }
  if (typeof window !== 'undefined') window.OctoRequest = api
  if (typeof globalThis !== 'undefined') globalThis.OctoRequest = api
})()
