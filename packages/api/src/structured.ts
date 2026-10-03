import Ajv from 'ajv'
import type { CodeOptions, ErrorObject, ValidateFunction } from 'ajv'
import type {
  AttributesFormatRequest,
  CompactScrapeResponse,
  ExecutionContext,
  FetchResult,
  JsonFormatRequest,
  JsonSchema,
  JsonValue,
  LabelledValue,
  LadderExecutionSummary,
  Lane,
  PageMetadata,
  ProductFact,
  ProductFacts,
  ScrapeFormat,
  ScrapeMetadata,
  ScrapeRequest,
  ScrapeResponse,
  ScrapeResponseMetadata,
  ScrapeRun,
  ScreenshotOptions,
  StructuredExtractionIssue,
  StructuredExtractionResult,
  StructuredFieldEvidence,
  StructuredModelUsage,
} from '@w2l/contracts'
import { sha256Utf8 } from '@w2l/http-core'
import { browserFingerprintFor, cacheStateOf, CONTENTFUL_STATUS, defaultApiMode, warningOf } from '@w2l/contracts'
import { compilePathFilter, toEvidenceRecord } from '@w2l/runtime'
import { readNumber, type NumberContext } from './numbers.js'
import { pdfLabelledValues } from './pdfFields.js'

export interface StructuredModelConfig {
  baseUrl: string
  model: string
  apiKey?: string
  fetch?: typeof fetch
}

export function structuredModelConfigFromEnv(): StructuredModelConfig | null {
  const baseUrl = process.env.W2L_EXTRACT_BASE_URL?.trim()
  const model = process.env.W2L_EXTRACT_MODEL?.trim()
  if (!baseUrl || !model) return null
  const apiKey = process.env.W2L_EXTRACT_API_KEY?.trim()
  return { baseUrl, model, ...(apiKey ? { apiKey } : {}) }
}

interface Candidate {
  value: JsonValue
  /** Where the value came from; a product fact carries its own. */
  fact?: { source: StructuredFieldEvidence['source']; path?: string }
  /** The page text a number value was read from. */
  text?: string
  /** Why no number was read from the page text the value keeps; an issue when a number field stays unfilled. */
  unread?: string
  /** The same for members of the value, such as a price list's amounts, by JSON Pointer below it. */
  unreadMembers?: ReadonlyArray<{ path: string; message: string }>
}

/** Sources whose format writes `.` as the decimal point: JSON-LD and OpenGraph product meta. Microdata may hold visible text. */
const DECIMAL_POINT_SOURCES: ReadonlySet<string> = new Set(['jsonld', 'meta'])

function unreadMessage(text: string, where: NonNullable<Candidate['fact']>, why: string): string {
  return `the page states ${JSON.stringify(text)} (${where.source}${where.path === undefined ? '' : `, ${where.path}`}): ${why}; no number was read`
}

/** A product fact's number and the text it was read from, or its text and why no number was read (numbers.ts). */
function factNumber(fact: ProductFact, context: NumberContext = {}): Omit<Candidate, 'fact' | 'unreadMembers'> {
  const reading = readNumber(fact.value, { ...context, decimalPoint: DECIMAL_POINT_SOURCES.has(fact.source) })
  return 'value' in reading ? { value: reading.value, text: fact.value } : { value: fact.value, unread: unreadMessage(fact.value, fact, reading.message) }
}

/** Evidence for a list or map the product extractor reported empty: nothing was read, the extractor observed none. */
const observedNone = (name: string): NonNullable<Candidate['fact']> => ({ source: 'inferred', path: `document.product.${name}` })

/** A key or page label reduced to its letters and digits: "Number of reviews" matches numberOfReviews. */
function labelKey(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

/** The same without bracketed qualifiers: "Price (excl. tax)" matches price. */
function baseLabelKey(text: string): string {
  return labelKey(text.replace(/\([^)]*\)|\[[^\]]*\]/g, ' '))
}

/**
 * Label text as the schema type: its value (`number` when read as a number
 * from the text), `unsettled` with the reason when it is a number whose
 * notation the page does not settle (numbers.ts), or undefined when it is not
 * cleanly that type ("In stock (22 available)", "4.7 out of 5", "HL-1" and a
 * URL are not numbers).
 */
function labelValue(text: string, schema: JsonSchema): { value: JsonValue; number?: true } | { unsettled: string } | undefined {
  const types = schemaTypes(schema)
  if (types.length === 0 || types.includes('string')) return { value: text }
  if (types.includes('number') || types.includes('integer')) {
    const reading = readNumber(text)
    if (!('value' in reading)) return reading.reason === 'unsettled' ? { unsettled: reading.message } : undefined
    return types.includes('number') || Number.isInteger(reading.value) ? { value: reading.value, number: true } : undefined
  }
  if (types.includes('boolean')) return /^(true|yes)$/i.test(text) ? { value: true } : /^(false|no)$/i.test(text) ? { value: false } : undefined
  return undefined
}

/**
 * Candidates from the page's own labels, for top-level keys no subject fact
 * covers. A label equal to the key wins over one that only matches without
 * its bracketed qualifier. When the matching labels state different values,
 * or one of them is not of the key's type, nothing is chosen: the field stays
 * absent and an issue names the labels. Labels that state one number in a
 * notation the page does not settle leave it absent too, saying why.
 */
function addLabelCandidates(
  map: Map<string, Candidate>,
  root: JsonSchema,
  labels: readonly (LabelledValue & { source?: 'pdf' })[],
  issues: StructuredExtractionIssue[],
): void {
  for (const [name, child] of Object.entries(effective(root, root).properties ?? {})) {
    const key = labelKey(name)
    if (key.length === 0 || map.has(name.toLowerCase())) continue
    const exact = labels.filter(item => labelKey(item.label) === key)
    const matched = exact.length > 0 ? exact : labels.filter(item => baseLabelKey(item.label) === key)
    if (matched.length === 0) continue
    const readings = matched.map(item => labelValue(item.value, effective(root, child)))
    if (readings.every(reading => reading === undefined)) continue
    const first = matched[0]!
    const fact: NonNullable<Candidate['fact']> = { source: first.source ?? 'dom', path: `${first.path} ${JSON.stringify(first.label)}` }
    const unsettled = readings[0] !== undefined && 'unsettled' in readings[0] ? readings[0].unsettled : undefined
    if (unsettled !== undefined && matched.every(item => item.value === first.value)) {
      map.set(name.toLowerCase(), { value: first.value, fact, unread: unreadMessage(first.value, fact, unsettled) })
      continue
    }
    const values = readings.map(reading => reading !== undefined && 'value' in reading ? reading.value : undefined)
    if (values.some(value => value === undefined || JSON.stringify(value) !== JSON.stringify(values[0]))) {
      issues.push({
        code: 'field_ambiguous',
        path: `/${name}`,
        message: `page labels state different values for /${name}: ${matched.map(item => `${JSON.stringify(item.label)} = ${JSON.stringify(item.value)} (${item.path})`).join(', ')}`,
      })
      continue
    }
    const number = readings[0] !== undefined && 'number' in readings[0]
    map.set(name.toLowerCase(), { value: values[0]!, fact, ...(number ? { text: first.value } : {}) })
  }
}

function candidates(result: FetchResult, schema?: JsonSchema, issues: StructuredExtractionIssue[] = []): Map<string, Candidate> {
  const map = new Map<string, Candidate>()
  const product = result.document?.product ?? null
  const put = (keys: readonly string[], fact: ProductFact | null | undefined, read?: (fact: ProductFact) => Omit<Candidate, 'fact'>): void => {
    if (fact === null || fact === undefined) return
    const candidate = { value: fact.value, fact, ...read?.(fact) }
    for (const key of keys) map.set(key.toLowerCase(), candidate)
  }
  // The fetch's own URLs, the content title and the page type W2L inferred:
  // each says where it came from, like a value read from the page.
  map.set('url', { value: result.evidence.finalUrl, fact: { source: 'fetch', path: 'finalUrl' } })
  map.set('requesturl', { value: result.requestedUrl, fact: { source: 'fetch', path: 'requestedUrl' } })
  map.set('finalurl', { value: result.evidence.finalUrl, fact: { source: 'fetch', path: 'finalUrl' } })
  if (result.document?.title) {
    const fact = titleFact(result.document.title, result.metadata)
    map.set('title', { value: result.document.title, fact })
    map.set('pagetitle', { value: result.document.title, fact })
  }
  if (result.document?.pageType) map.set('pagetype', { value: result.document.pageType, fact: { source: 'inferred', path: 'document.pageType' } })
  if (product !== null) addProductCandidates(map, product, put)
  // A PDF's labels are its `Label: value` lines, each with its page (pdfFields.ts).
  if (schema !== undefined) addLabelCandidates(map, schema, [...(result.document?.labelledValues ?? []), ...pdfLabelledValues(result)], issues)
  return map
}

/**
 * Where the content title was read. The extractor takes the first heading of
 * the main content (`h1[0]`, counted like label rows) and falls back to the
 * page's `<title>`, which the page metadata holds as written. Without the
 * metadata the place is unknown.
 */
function titleFact(title: string, metadata: FetchResult['metadata']): Candidate['fact'] {
  if (metadata === undefined || metadata === null) return { source: 'dom' }
  const text = (value: string): string => value.replace(/\s+/g, ' ').trim()
  return { source: 'dom', path: metadata.title !== null && text(metadata.title) === text(title) ? 'title' : 'h1[0]' }
}

function addProductCandidates(
  map: Map<string, Candidate>,
  product: ProductFacts,
  put: (keys: readonly string[], fact: ProductFact | null | undefined, read?: (fact: ProductFact) => Omit<Candidate, 'fact'>) => void,
): void {
  put(['asin', 'id', 'productid', 'subjectid', 'sku'], product.subjectId ?? product.sku)
  put(['title', 'name', 'productname'], product.name)
  put(['brand'], product.brand)
  put(['price', 'amount', 'currentprice'], product.price, fact => factNumber(fact, { currency: product.priceCurrency?.value }))
  put(['currency', 'pricecurrency'], product.priceCurrency)
  put(['seller', 'merchant'], product.seller)
  put(['availability', 'stock'], product.availability)
  put(['deliverylocation', 'deliveryregion', 'region'], product.deliveryLocation)
  put(['rating'], product.rating, fact => factNumber(fact))
  put(['reviewcount', 'reviews'], product.reviewCount, fact => factNumber(fact, { count: true }))
  map.set('kind', { value: product.kind ?? 'unknown', fact: { source: 'inferred', ...(product.kind === undefined ? {} : { path: 'document.product.kind' }) } })
  // A list is a source only when the extractor read it from the page. The
  // Amazon adapter reports what it observed on the verified subject, possibly
  // an empty list; a generic product page has no such list, and an invented []
  // or {} would claim the page has none. A list's evidence is its first
  // item's; an empty one's is the extractor's report that it observed none.
  const { images, prices, variants, specifications } = product
  if (images !== undefined) map.set('images', { value: images.map(item => item.value), fact: images[0] ?? observedNone('images') })
  if (prices !== undefined) {
    const unreadMembers: Array<{ path: string; message: string }> = []
    map.set('prices', {
      value: prices.map((item, index) => {
        const amount = factNumber(item.amount, { currency: item.currency?.value })
        if (amount.unread !== undefined) unreadMembers.push({ path: `/${index}/amount`, message: amount.unread })
        return {
          amount: amount.value,
          currency: item.currency?.value ?? null,
          priceType: item.priceType,
          seller: item.seller?.value ?? null,
        }
      }),
      fact: prices[0]?.amount ?? observedNone('prices'),
      ...(unreadMembers.length > 0 ? { unreadMembers } : {}),
    })
  }
  if (variants !== undefined) {
    map.set('variants', {
      value: variants.map(item => ({
        name: item.name,
        value: item.value,
        selected: item.selected,
      })),
      fact: variants[0] === undefined ? observedNone('variants') : {
        source: variants[0].source,
        path: variants[0].path,
      },
    })
  }
  if (specifications !== undefined) {
    map.set('specifications', {
      value: Object.fromEntries(Object.entries(specifications).map(([key, fact]) => [key, fact.value])),
      fact: Object.values(specifications)[0] ?? observedNone('specifications'),
    })
  }
}

function schemaTypes(schema: JsonSchema): readonly string[] {
  if (schema.type === undefined) return []
  return typeof schema.type === 'string' ? [schema.type] : schema.type
}

function isPlainObject(value: JsonValue | undefined): value is { [key: string]: JsonValue } {
  return value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value)
}

/** The schema a local `$ref` (`#` or a JSON Pointer) names, following chained references. */
function resolveRef(root: JsonSchema, schema: JsonSchema): JsonSchema {
  let current = schema
  for (let hops = 0; current.$ref !== undefined && hops < 16; hops++) {
    let value: unknown = root
    for (const part of current.$ref === '#' ? [] : current.$ref.slice(2).split('/')) {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return current
      let key: string
      try {
        key = decodeURIComponent(part).replace(/~1/g, '/').replace(/~0/g, '~')
      } catch {
        return current
      }
      value = (value as Record<string, unknown>)[key]
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return current
    current = value as JsonSchema
  }
  return current
}

/** The JSON types a schema admits; empty when it does not restrict them. */
function admittedTypes(schema: JsonSchema): readonly string[] {
  if (schema.type !== undefined) return schemaTypes(schema)
  if (schema.properties !== undefined || schema.additionalProperties !== undefined) return ['object']
  if (schema.items !== undefined) return ['array']
  const values = schema.const !== undefined ? [schema.const] : schema.enum
  return values === undefined ? [] : [...new Set(values.map(value => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value))]
}

/**
 * The schema a value is mapped by: a `$ref` resolved, and an anyOf / oneOf
 * union (a schema or null, or primitive types; see readSchema) folded into
 * one schema admitting every branch's types, with the properties of its
 * object branch.
 */
function effective(root: JsonSchema, schemaInput: JsonSchema, depth = 0): JsonSchema {
  const schema = resolveRef(root, schemaInput)
  const union = schema.anyOf ?? schema.oneOf
  if (union === undefined || depth > 8) return schema
  const branches = union.map(branch => effective(root, branch, depth + 1))
  const types = branches.map(admittedTypes)
  const shaped = branches.find(branch => branch.properties !== undefined || branch.items !== undefined || branch.additionalProperties !== undefined)
  const { anyOf: _anyOf, oneOf: _oneOf, ...annotations } = schema
  return {
    ...annotations,
    ...(shaped === undefined ? {} : { properties: shaped.properties, items: shaped.items, additionalProperties: shaped.additionalProperties, required: shaped.required }),
    // A branch that admits any type leaves the union unrestricted.
    ...(types.some(list => list.length === 0) ? {} : { type: [...new Set(types.flat())] as JsonSchema['type'] }),
  }
}

function matchesType(value: JsonValue, type: string): boolean {
  switch (type) {
    case 'null': return value === null
    case 'integer': return Number.isInteger(value)
    case 'array': return Array.isArray(value)
    case 'object': return isPlainObject(value)
    default: return typeof value === type
  }
}

/** The value as the schema's type. `readNumbers` false: a string is not read as a number (its number was already found unreadable). */
function coerce(value: JsonValue, schema: JsonSchema, readNumbers = true): JsonValue | undefined {
  const types = schemaTypes(schema)
  if (types.length === 0 || types.some(type => matchesType(value, type))) return value
  if (value === null) return undefined
  if ((types.includes('number') || types.includes('integer')) && typeof value === 'string') {
    // Only a string that is one amount becomes a number: "HL-1" is not -1 (numbers.ts).
    const reading = readNumbers ? readNumber(value) : null
    return reading !== null && 'value' in reading && (types.includes('number') || Number.isInteger(reading.value)) ? reading.value : undefined
  }
  if (types.includes('string') && typeof value !== 'string') return String(value)
  if (types.includes('boolean') && typeof value === 'string') {
    if (value === 'true') return true
    if (value === 'false') return false
  }
  return value
}

/**
 * The caller's schema filled from the candidates. Every value filled is
 * recorded in `filled` (its path), with its evidence when the candidate has a
 * source.
 */
function mapSchema(
  root: JsonSchema,
  schemaInput: JsonSchema,
  source: Map<string, Candidate>,
  path: string,
  evidence: StructuredFieldEvidence[],
  filled: Set<string>,
  key: string | null = null,
  ancestors: ReadonlySet<JsonSchema> = new Set(),
): JsonValue | undefined {
  const node = resolveRef(root, schemaInput)
  // A recursive schema is walked once along each path.
  if (ancestors.has(node)) return undefined
  const schema = effective(root, node)
  const direct = key === null ? undefined : source.get(key.toLowerCase())
  if (direct !== undefined) {
    const value = coerce(direct.value, schema, direct.unread === undefined)
    if (value !== undefined) {
      if (direct.fact !== undefined) {
        // A number read from page text quotes that text.
        const text = typeof value !== 'number' ? undefined : direct.text ?? (typeof direct.value === 'string' ? direct.value : undefined)
        evidence.push({
          path,
          source: direct.fact.source,
          ...(direct.fact.path === undefined ? {} : { evidencePath: direct.fact.path }),
          ...(text === undefined ? {} : { text }),
        })
      }
      filled.add(path)
      return value
    }
  }
  if (schemaTypes(schema).includes('object') || schema.properties !== undefined) {
    const inner = new Set(ancestors).add(node)
    const out: Record<string, JsonValue> = {}
    for (const [name, child] of Object.entries(schema.properties ?? {})) {
      // Candidates describe the page and its subject, so only a top-level
      // property can match one: /author/title is not the page title.
      const mapped = mapSchema(root, child, source, `${path}/${name}`, evidence, filled, path === '' ? name : null, inner)
      if (mapped !== undefined) out[name] = mapped
    }
    // A nested object exists only when something inside it had a source.
    return path === '' || Object.keys(out).length > 0 ? out : undefined
  }
  return undefined
}

/**
 * Why a number the page states was not read: for each top-level field that
 * asked for one and was left unfilled, and for each member of a filled value
 * (a price list's amount) kept as the page's text.
 */
function unreadIssues(root: JsonSchema, source: ReadonlyMap<string, Candidate>, filled: ReadonlySet<string>): StructuredExtractionIssue[] {
  const issues: StructuredExtractionIssue[] = []
  for (const name of Object.keys(effective(root, root).properties ?? {})) {
    const candidate = source.get(name.toLowerCase())
    const path = `/${name}`
    if (candidate === undefined) continue
    if (!filled.has(path)) {
      if (candidate.unread !== undefined) issues.push({ code: 'field_unavailable', path, message: candidate.unread })
      continue
    }
    for (const member of candidate.unreadMembers ?? []) issues.push({ code: 'field_unavailable', path: `${path}${member.path}`, message: member.message })
  }
  return issues
}

function fillNullableMissing(root: JsonSchema, schemaInput: JsonSchema, value: JsonValue | undefined): JsonValue | undefined {
  const schema = effective(root, schemaInput)
  // A field without a source stays absent, so a required one is reported
  // missing. Only a nullable field becomes an explained null.
  if (value === undefined) return schemaTypes(schema).includes('null') ? null : undefined
  if (schema.properties !== undefined && value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const out: Record<string, JsonValue> = { ...value }
    for (const [name, child] of Object.entries(schema.properties)) {
      const next = fillNullableMissing(root, child, out[name])
      if (next !== undefined) out[name] = next
    }
    return out
  }
  return value
}

function nullableMissingIssues(root: JsonSchema, schemaInput: JsonSchema, value: JsonValue | undefined, path = ''): StructuredExtractionIssue[] {
  const schema = effective(root, schemaInput)
  if (schema.properties !== undefined && value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const data = value as Record<string, JsonValue>
    return Object.entries(schema.properties).flatMap(([name, child]) => nullableMissingIssues(root, child, data[name], `${path}/${name}`))
  }
  return value === null && schemaTypes(schema).includes('null')
    ? [{code:'field_unavailable',path,message:'no verified source for this nullable field on the selected page'}]
    : []
}

function requiredMissing(root: JsonSchema, schemaInput: JsonSchema, value: JsonValue | undefined, path = ''): string[] {
  const schema = effective(root, schemaInput)
  const missing: string[] = []
  // A nullable object that is null has no members to require.
  if (schema.required !== undefined && !(value === null && schemaTypes(schema).includes('null'))) {
    const rec = value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, JsonValue> : {}
    for (const key of schema.required) {
      if (!(key in rec)) missing.push(`${path}/${key}`)
    }
  }
  if (schema.properties !== undefined && value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(schema.properties)) {
      const childValue = (value as Record<string, JsonValue>)[key]
      if (childValue !== undefined) missing.push(...requiredMissing(root, child, childValue, `${path}/${key}`))
    }
  }
  return missing
}

// A schema's pattern is matched against page text, like a crawl path filter:
// in linear time where V8 can, otherwise only on text of at most
// REGEX_SUBJECT_MAX_LENGTH characters and within a time limit. Text the
// pattern cannot decide counts as not matching it. The request already
// refused patterns that can backtrack catastrophically. V8's linear engine
// does not take the u flag; a pattern without \p, \P, \u{…} or astral
// characters means the same without it on text without astral characters.
type RegExpEngine = NonNullable<CodeOptions['regExp']>
const ASTRAL = /[\uD800-\uDFFF]/
const schemaRegExp: RegExpEngine = Object.assign((pattern: string, flags: string) => {
  const exact = compilePathFilter(pattern, flags)
  const bmp = flags === 'u' && !/\\[pP]|\\u\{/.test(pattern) && !ASTRAL.test(pattern) ? compilePathFilter(pattern) : null
  return { test: (text: string) => (bmp !== null && !ASTRAL.test(text) ? bmp : exact).test(text) === true, toString: () => `/${pattern}/${flags}` }
}, { code: 'schemaRegExp' })

function compile(schema: JsonSchema): ValidateFunction {
  const AjvConstructor = Ajv as unknown as new (options: { allErrors: boolean; strict: boolean; validateFormats: boolean; code: { regExp: RegExpEngine } }) => { compile(schema: object): ValidateFunction }
  // format is an annotation W2L does not check. $schema and $id only name the
  // dialect and the schema: W2L's subset means the same under draft-07,
  // 2019-09 and 2020-12, and every $ref is local.
  const ajv = new AjvConstructor({ allErrors: true, strict: false, validateFormats: false, code: { regExp: schemaRegExp } })
  const { $schema: _dialect, $id: _id, ...rest } = schema
  return ajv.compile(rest as object)
}

function validationMessage(errors: ErrorObject[] | null | undefined): string {
  return (errors ?? []).map(error => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`).join('; ') || 'model output did not match the schema'
}

/** Fields are read only from a successful or partial page: a 404, block or
 * failed identity check is not the subject, whatever its document says. */
function unsuccessfulPage(result: FetchResult): StructuredExtractionIssue | null {
  if (result.status === 'success' || result.status === 'partial') return null
  const httpStatus = result.evidence.httpStatus
  const detail = [result.failureReason ?? result.blockReason ?? result.budgetExceeded, typeof httpStatus === 'number' ? `HTTP ${httpStatus}` : null]
    .filter((part): part is string => typeof part === 'string')
  return {
    code: 'page_unsuccessful',
    message: `page status is ${result.status}${detail.length > 0 ? ` (${detail.join(', ')})` : ''}, not success; no fields were read from it`,
  }
}

/**
 * A partial page (the scrape's timeout ended it) still gives fields with
 * their evidence, but its JSON is never complete and no model call runs:
 * the time the caller allowed is over.
 */
function partialPage(result: FetchResult): StructuredExtractionIssue[] {
  return result.status !== 'partial' ? [] : [{
    code: 'page_partial',
    message: 'page status is partial: the scrape timeout ended it early, so fields come only from the content fetched so far and the result cannot be complete',
  }]
}

function canonicalStructured(result: FetchResult): StructuredExtractionResult {
  const document = result.document
  const pageIssue = unsuccessfulPage(result)
  const partial = partialPage(result)
  if (pageIssue !== null) {
    return {
      status: 'incomplete',
      data: document === undefined || document === null ? null : { adapter: document.adapter, pageType: document.pageType, entities: [] },
      evidence: [],
      issues: [pageIssue],
      modelUsage: null,
    }
  }
  if (document?.adapterValidation?.valid === false) {
    return {
      status: 'incomplete',
      data: { adapter: document.adapter, pageType: document.pageType, entities: [] },
      evidence: [],
      issues: [...partial, ...document.adapterValidation.issues.map(message => ({ code: 'subject_unverified' as const, message }))],
      modelUsage: null,
    }
  }
  if (document === undefined || document === null || document.entities.length === 0) {
    return {
      status: 'incomplete',
      data: document === undefined || document === null ? null : {
        adapter: document.adapter,
        pageType: document.pageType,
        entities: [],
      },
      evidence: [],
      issues: [...partial, { code: 'adapter_unavailable', message: 'no normalized entity was confirmed from the public page' }],
      modelUsage: null,
    }
  }
  const evidence: StructuredFieldEvidence[] = []
  for (const [entityIndex, entity] of document.entities.entries()) {
    for (const [field, fact] of Object.entries(entity.fields)) {
      evidence.push({ path: `/entities/${entityIndex}/fields/${field}`, source: fact.source, evidencePath: fact.path })
    }
  }
  return {
    status: partial.length > 0 ? 'incomplete' : 'complete',
    data: { adapter: document.adapter, pageType: document.pageType, entities: document.entities },
    evidence,
    issues: partial,
    modelUsage: null,
  }
}

interface ChatCompletion {
  choices?: Array<{ message?: { content?: string | null } }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

/** The schema a model request carries, and whether it asks for strict mode. */
interface ModelSchema {
  schema: JsonSchema
  strict: boolean
  /** Why strict mode could not take the caller's schema. */
  reason?: string
}

class StrictUnsupported extends Error {
  constructor(at: string, why: string) {
    super(`strict mode cannot express ${at || '/'}: ${why}`)
  }
}

/** The same schema admitting null too. */
function nullable(schema: JsonSchema): JsonSchema {
  if (schema.anyOf !== undefined) {
    return schema.anyOf.some(branch => schemaTypes(branch).includes('null')) ? schema : { ...schema, anyOf: [...schema.anyOf, { type: 'null' }] }
  }
  if (schema.type !== undefined && schema.const === undefined) {
    const types = schemaTypes(schema)
    if (types.includes('null')) return schema
    const withNull = { ...schema, type: [...types, 'null'] as JsonSchema['type'] }
    return schema.enum === undefined || schema.enum.includes(null) ? withNull : { ...withNull, enum: [...schema.enum, null] }
  }
  return { anyOf: [schema, { type: 'null' }] }
}

/** A `$ref` to a definition, as `#/$defs/<name>`; `#` stays the root. */
function strictRef(ref: string, at: string): string {
  if (ref === '#') return ref
  const name = /^#\/(?:\$defs|definitions)\/([^/]+)$/.exec(ref)?.[1]
  if (name === undefined) throw new StrictUnsupported(at, `its $ref ${ref} does not name a definition`)
  return `#/$defs/${name}`
}

/** One node for strict mode: closed objects, every property required, optional ones nullable, only the keywords strict mode takes. */
function strictNode(node: JsonSchema, at: string): JsonSchema {
  if (node.$ref !== undefined) return { $ref: strictRef(node.$ref, at) }
  const union = node.anyOf ?? node.oneOf
  const description = node.description === undefined ? {} : { description: node.description }
  if (union !== undefined) return { anyOf: union.map((branch, index) => strictNode(branch, `${at}/${node.anyOf !== undefined ? 'anyOf' : 'oneOf'}/${index}`)), ...description }
  const types = admittedTypes(node)
  const out: { -readonly [K in keyof JsonSchema]: JsonSchema[K] } = {}
  if (node.type !== undefined) out.type = node.type
  if (types.includes('object')) {
    const properties = Object.entries(node.properties ?? {})
    if (properties.length === 0) throw new StrictUnsupported(at, 'an object without properties, which strict mode cannot leave open')
    if (node.type === undefined) out.type = 'object'
    const required = new Set(node.required ?? [])
    out.properties = Object.fromEntries(properties.map(([name, child]) => {
      const strict = strictNode(child, `${at}/properties/${name}`)
      return [name, required.has(name) ? strict : nullable(strict)]
    }))
    out.required = properties.map(([name]) => name)
    out.additionalProperties = false
  }
  if (types.includes('array')) {
    if (node.items === undefined) throw new StrictUnsupported(at, 'an array without items')
    if (node.type === undefined) out.type = 'array'
    out.items = strictNode(node.items, `${at}/items`)
  }
  if (node.enum !== undefined) out.enum = node.enum
  if (node.const !== undefined) out.const = node.const
  if (types.length === 0) throw new StrictUnsupported(at, 'a schema that names no type')
  return { ...out, ...description }
}

/**
 * The schema for an OpenAI-compatible request. Strict mode takes a closed
 * object with every property required, so W2L sends a strict-safe schema
 * derived from the caller's: optional properties become nullable, and
 * assertions and annotations are left out (the answer is still checked
 * against the caller's schema). A schema strict mode cannot express, such as
 * an open map, is sent as given without strict mode, with the reason.
 */
function modelSchema(root: JsonSchema): ModelSchema {
  try {
    const top = resolveRef(root, root)
    if (top.$ref !== undefined) throw new StrictUnsupported('/', `its $ref ${top.$ref} does not resolve`)
    if (!admittedTypes(top).includes('object') || top.anyOf !== undefined || top.oneOf !== undefined) throw new StrictUnsupported('/', 'the root is not one object')
    const defs: Record<string, JsonSchema> = {}
    for (const [container, entries] of [['$defs', root.$defs], ['definitions', root.definitions]] as const) {
      for (const [name, def] of Object.entries(entries ?? {})) {
        if (name in defs) throw new StrictUnsupported(`/${container}/${name}`, 'another definition has the same name')
        defs[name] = strictNode(def, `/${container}/${name}`)
      }
    }
    const schema = strictNode(top, top === root ? '' : (root.$ref ?? '').slice(1))
    return { schema: Object.keys(defs).length === 0 ? schema : { ...schema, $defs: defs }, strict: true }
  } catch (error) {
    if (error instanceof StrictUnsupported) return { schema: root, strict: false, reason: error.message }
    throw error
  }
}

async function callModel(
  result: FetchResult,
  format: JsonFormatRequest,
  request: ModelSchema,
  deterministic: JsonValue,
  execution: ExecutionContext,
  config: StructuredModelConfig,
  repair: string | null,
): Promise<{ value: JsonValue; inputTokens: number | null; outputTokens: number | null }> {
  execution.signal?.throwIfAborted()
  const fetchImpl = config.fetch ?? fetch
  const response = await fetchImpl(`${config.baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
    method: 'POST',
    signal: execution.signal,
    headers: {
      'content-type': 'application/json',
      ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: 'system',
          content: 'Return only facts supported by the supplied subject content. Do not infer from recommendations or unrelated products.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            prompt: format.prompt ?? 'Complete the missing schema fields.',
            deterministic,
            subject: result.markdown ?? '',
            ...(repair === null ? {} : { repair }),
          }),
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'w2l_extract', strict: request.strict, schema: request.schema },
      },
    }),
  })
  if (!response.ok) throw new Error(`model provider returned ${response.status}`)
  const payload = await response.json() as ChatCompletion
  const content = payload.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new Error('model provider omitted JSON content')
  return {
    value: JSON.parse(content) as JsonValue,
    inputTokens: payload.usage?.prompt_tokens ?? null,
    outputTokens: payload.usage?.completion_tokens ?? null,
  }
}

/** Whether a missing value may be null. */
function allowsNull(schema: JsonSchema): boolean {
  const types = schemaTypes(schema)
  if (types.length > 0) return types.includes('null')
  if (schema.const !== undefined) return schema.const === null
  return schema.enum === undefined || schema.enum.includes(null)
}

/**
 * Strict mode answers every property, null for one the caller left optional.
 * A null the caller's schema does not allow means "not found": left out.
 */
function withoutDisallowedNulls(root: JsonSchema, schemaInput: JsonSchema, value: JsonValue): JsonValue {
  const schema = effective(root, schemaInput)
  if (!isPlainObject(value) || schema.properties === undefined) return value
  const out: Record<string, JsonValue> = {}
  for (const [key, child] of Object.entries(value)) {
    const childSchema = schema.properties[key]
    if (childSchema === undefined) out[key] = child
    else if (child !== null || allowsNull(effective(root, childSchema))) out[key] = withoutDisallowedNulls(root, childSchema, child)
  }
  return out
}

/** A copy without the members at these paths. */
function withoutPaths(value: JsonValue | null, paths: ReadonlySet<string>, path = ''): JsonValue | null {
  if (paths.size === 0 || !isPlainObject(value)) return value
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !paths.has(`${path}/${key}`))
    .map(([key, child]) => [key, withoutPaths(child, paths, `${path}/${key}`)]))
}

/**
 * The model's answer merged into the data read from the page, key by key at
 * every level. A value at a kept path stays as it was read, whatever the
 * model says; the rest of the answer is taken, and the path of every value
 * the model wrote (a null says unavailable, so it has none) goes to `written`.
 */
function mergeModel(base: JsonValue | undefined, patch: JsonValue | undefined, path: string, kept: ReadonlySet<string>, written: string[]): JsonValue | undefined {
  if (patch === undefined || kept.has(path)) return base
  if (isPlainObject(base) && isPlainObject(patch)) {
    const out: Record<string, JsonValue> = { ...base }
    for (const [key, value] of Object.entries(patch)) {
      const next = mergeModel(base[key], value, `${path}/${key}`, kept, written)
      if (next !== undefined) out[key] = next
    }
    return out
  }
  if (isPlainObject(base) && [...kept].some(item => item.startsWith(`${path}/`))) return base
  if (patch !== null) written.push(path)
  return patch
}

export async function extractStructured(
  result: FetchResult,
  format?: JsonFormatRequest,
  execution: ExecutionContext = {},
  modelConfig: StructuredModelConfig | null = structuredModelConfigFromEnv(),
): Promise<StructuredExtractionResult> {
  if (format === undefined) return canonicalStructured(result)
  const schemaSha256 = sha256Utf8(JSON.stringify(format.schema))
  const pageIssue = unsuccessfulPage(result)
  if (pageIssue !== null) return { status: 'incomplete', data: null, schemaSha256, evidence: [], issues: [pageIssue], modelUsage: null }
  const partial = partialPage(result)
  if (result.document?.adapterValidation?.valid === false) {
    return {
      status: 'incomplete',
      data: null,
      schemaSha256,
      evidence: [],
      issues: [...partial, ...result.document.adapterValidation.issues.map(message => ({ code: 'subject_unverified' as const, message }))],
      modelUsage: null,
    }
  }
  const evidence: StructuredFieldEvidence[] = []
  // Paths filled from the page or the fetch.
  const filled = new Set<string>()
  // Fields whose page labels disagree, or whose number the page states but was
  // not read: reported with every result that carries data.
  const readIssues: StructuredExtractionIssue[] = []
  const source = candidates(result, format.schema, readIssues)
  const mapped = mapSchema(format.schema, format.schema, source, '', evidence, filled) ?? null
  readIssues.push(...unreadIssues(format.schema, source, filled))
  const data = fillNullableMissing(format.schema, format.schema, mapped) ?? null
  let validate: ValidateFunction
  try {
    validate = compile(format.schema)
  } catch (error) {
    return {
      status: 'invalid',
      data,
      schemaSha256,
      evidence,
      issues: [{ code: 'schema_invalid', message: error instanceof Error ? error.message : 'schema compilation failed' }],
      modelUsage: null,
    }
  }
  const missing = requiredMissing(format.schema, format.schema, data)
  const deterministicValid = validate(data)
  const unavailable = (value: JsonValue): StructuredExtractionIssue[] =>
    nullableMissingIssues(format.schema, format.schema, value).filter(issue => !readIssues.some(read => read.path === issue.path))
  if (missing.length === 0 && deterministicValid) {
    return { status: partial.length > 0 ? 'incomplete' : 'complete', data, schemaSha256, evidence, issues: [...partial, ...readIssues, ...unavailable(data)], modelUsage: null }
  }
  const missingIssues = missing.map(path => ({ code: 'missing_required' as const, path, message: `required field unavailable: ${path}` }))
  const issues: StructuredExtractionIssue[] = [...partial, ...readIssues]
  // PDF text is read only deterministically: each field from a labelled line with its page, never by a model.
  const pdf = result.file?.kind === 'pdf'
  if (format.modelFallback === true && pdf && partial.length === 0) {
    issues.push({ code: 'model_unavailable', message: 'model fallback does not read PDF text: fields come only from its "Label: value" lines, each with its page' })
  }
  if (format.modelFallback !== true || partial.length > 0 || pdf) {
    issues.push(...missingIssues)
    // A value that breaks the schema's other checks (an enum, a pattern) is named too.
    const failedChecks = (validate.errors ?? []).filter(error => error.keyword !== 'required')
    if (!deterministicValid && failedChecks.length > 0) issues.push({ code: 'field_unavailable', message: validationMessage(failedChecks) })
    return { status: 'incomplete', data, schemaSha256, evidence, issues, modelUsage: null }
  }
  if (modelConfig === null) {
    issues.push({ code: 'model_unavailable', message: 'model fallback requested but W2L extraction model is not configured' }, ...missingIssues)
    return { status: 'incomplete', data, schemaSha256, evidence, issues, modelUsage: null }
  }
  // Values read from the page or the fetch stay, with their evidence: the
  // model fills only what is missing, and replaces a read value only where
  // it breaks the caller's schema (an enum, a pattern), losing its evidence.
  const errors = deterministicValid ? [] : validate.errors ?? []
  const broken = new Set([...filled].filter(path => errors.some(error => error.instancePath === path || error.instancePath.startsWith(`${path}/`))))
  const kept = new Set([...filled].filter(path => !broken.has(path)))
  const base = withoutPaths(data, broken)
  const baseEvidence = evidence.filter(item => !broken.has(item.path))
  const deterministic = withoutPaths(mapped, broken)
  const request = modelSchema(format.schema)
  let attempts = 0
  let inputTokens = 0
  let outputTokens = 0
  let tokensKnown = true
  let repair: string | null = null
  const modelUsage = (): StructuredModelUsage => ({
    model: modelConfig.model,
    attempts,
    inputTokens: tokensKnown ? inputTokens : null,
    outputTokens: tokensKnown ? outputTokens : null,
    externalCostUsd: null,
    strict: request.strict,
    ...(request.reason === undefined ? {} : { strictReason: request.reason }),
  })
  while (attempts < 2) {
    attempts++
    try {
      const model = await callModel(result, format, request, deterministic, execution, modelConfig, repair)
      if (model.inputTokens === null || model.outputTokens === null) tokensKnown = false
      else {
        inputTokens += model.inputTokens
        outputTokens += model.outputTokens
      }
      const written: string[] = []
      const merged = mergeModel(base, withoutDisallowedNulls(format.schema, format.schema, model.value), '', kept, written) ?? null
      if (validate(merged)) {
        return {
          status: 'complete',
          data: merged,
          schemaSha256,
          evidence: [...baseEvidence, ...written.map(path => ({ path, source: 'model' as const }))],
          issues: [...readIssues, ...unavailable(merged)],
          modelUsage: modelUsage(),
        }
      }
      repair = validationMessage(validate.errors)
      if (attempts === 2) {
        return { status: 'invalid', data, schemaSha256, evidence, issues: [...readIssues, { code: 'model_output_invalid', message: repair }, ...missingIssues], modelUsage: modelUsage() }
      }
    } catch (error) {
      const aborted = execution.signal?.aborted === true || (error instanceof DOMException && error.name === 'AbortError') || (error instanceof Error && error.name === 'TimeoutError')
      return {
        status: 'incomplete',
        data,
        schemaSha256,
        evidence,
        issues: [
          ...readIssues,
          { code: aborted ? 'model_timeout' : 'model_provider_error', message: aborted ? 'model extraction was cancelled or exceeded the deadline' : error instanceof Error ? error.message : 'model provider failed' },
          ...missingIssues,
        ],
        modelUsage: modelUsage(),
      }
    }
  }
  return { status: 'incomplete', data, schemaSha256, evidence, issues: [...readIssues, ...missingIssues], modelUsage: null }
}

function requestedFormats(req: ScrapeRequest, result?: ScrapeRun): readonly ScrapeFormat[] {
  if (req.formats !== undefined) return req.formats
  // MCP marks its compact request with debug=false. Keep REST/SDK legacy
  // defaults, while returning adapter JSON (including incomplete identity
  // failures) on the simple MCP path.
  if (req.debug === false) {
    return result?.document?.adapter.id !== undefined && result.document.adapter.id !== 'generic'
      ? ['json'] : ['markdown']
  }
  return ['markdown', 'links']
}

/** Whether the formats ask for one by name: a string entry, or an object entry of that `type` (a json schema request counts as `json`, a screenshot entry as `screenshot`). */
export function hasFormat(formats: readonly ScrapeFormat[], name: 'markdown' | 'links' | 'json' | 'html' | 'rawHtml' | 'images' | 'tables' | 'attributes' | 'screenshot'): boolean {
  return formats.some(format => typeof format === 'string' ? format === name : format.type === name)
}

/** The caller's json schema request, when the formats carry one; an attributes or screenshot entry is not one. */
export function customJsonFormat(formats: readonly ScrapeFormat[]): JsonFormatRequest | undefined {
  return formats.find((format): format is JsonFormatRequest => typeof format === 'object' && format.type === 'json')
}

/** The attributes request, when the formats carry one. */
export function attributesFormat(formats: readonly ScrapeFormat[]): AttributesFormatRequest | undefined {
  return formats.find((format): format is AttributesFormatRequest => typeof format === 'object' && format.type === 'attributes')
}

/** The screenshot request, when the formats carry one: the string's defaults (`{}`), or the entry's options without its `type`. */
export function screenshotFormat(formats: readonly ScrapeFormat[]): ScreenshotOptions | undefined {
  for (const format of formats) {
    if (format === 'screenshot') return {}
    if (typeof format === 'object' && format.type === 'screenshot') {
      const { type: _type, ...options } = format
      return options
    }
  }
  return undefined
}

/**
 * The attempt copies of the run's audit without what the response itself
 * carries: `debug` keeps their Markdown, links, html, rawHtml, images, tables and
 * attributes, the compact shapes drop them; a screenshot's base64 travels
 * once in every shape, so a copy that had one carries `screenshot: null`.
 */
function withoutRepeatedBodies(summary: ScrapeResponse['summary'], debug: boolean): ScrapeResponse['summary'] {
  return {
    ...summary,
    attempts: summary.attempts.map(({ result, ...attempt }) => {
      const { html: _html, rawHtml: _rawHtml, images: _images, tables: _tables, pages: _pages, attributes: _attributes, screenshot, ...rest } = result
      return {
        ...attempt,
        result: { ...(debug ? result : { ...rest, markdown: null, links: [] }), ...(screenshot === undefined ? {} : { screenshot: null }) },
      }
    }),
  }
}

/**
 * The run as the API answers it: the formats the request asked for, JSON
 * extraction, the `scrapeId` and `metadata` of the call, the snapshot, the
 * Evidence Record and the timings; compact unless `debug` is true. The id is
 * minted here when the caller (the engine, which writes the scrape record
 * under it) gives none.
 */
export async function prepareScrapeResponse(
  result: ScrapeRun,
  req: ScrapeRequest,
  execution: ExecutionContext,
  modelConfig: StructuredModelConfig | null,
  overallStart: number,
  scrapeId: string = crypto.randomUUID(),
): Promise<ScrapeResponse | CompactScrapeResponse> {
  const formats = requestedFormats(req, result)
  const modelStart = performance.now()
  const json = hasFormat(formats, 'json')
    ? await extractStructured(extractionInput(result), customJsonFormat(formats), execution, modelConfig ?? structuredModelConfigFromEnv())
    : undefined
  const modelMs = json?.modelUsage ? Math.max(0, performance.now() - modelStart) : 0
  const serializeStart = performance.now()
  const includeLinks = req.includeLinks === true || hasFormat(formats, 'links')
  const warning = warningOf(result.warnings)
  const next: ScrapeRun = {
    ...result,
    markdown: hasFormat(formats, 'markdown') ? result.markdown : null,
    links: includeLinks ? result.links ?? [] : [],
    // The warnings as one string too, Firecrawl's `warning`, present exactly when they are.
    ...(warning === undefined ? {} : { warning }),
    // Asked for: what the result carries, null when it carries none (a file, a page not read as content, a capture that failed).
    ...(hasFormat(formats, 'html') ? { html: result.html ?? null } : {}),
    ...(hasFormat(formats, 'rawHtml') ? { rawHtml: result.rawHtml ?? null } : {}),
    ...(hasFormat(formats, 'screenshot') ? { screenshot: result.screenshot ?? null } : {}),
    ...(json === undefined ? {} : { json }),
    summary: withoutRepeatedBodies(result.summary, req.debug === true),
  }
  const serializeMs = Math.max(0, performance.now() - serializeStart)
  const totalMs = Math.max(0, performance.now() - overallStart)
  const withTiming: ScrapeResponse = {
    ...next,
    scrapeId,
    metadata: scrapeResponseMetadata(next, scrapeId),
    snapshot: scrapeSnapshot(next),
    evidenceRecord: scrapeEvidenceRecord(result, req, next),
    usage: {
      ...next.usage,
      wallMs: totalMs,
      ...(next.usage.timings ? { timings: { ...next.usage.timings, serializeMs, modelMs, totalMs } } : {}),
    },
    summary: { ...next.summary, totalMs },
  }
  if (req.debug !== false) return withTiming
  return compactScrapeResponse(withTiming, req, formats, totalMs)
}

/**
 * What JSON extraction may read. A failed or blocked result's Markdown is the
 * page an error status carried, evidence rather than content, so extraction
 * sees such a result as it did before that page was kept.
 */
export function extractionInput<T extends FetchResult>(result: T): T {
  return CONTENTFUL_STATUS.has(result.status) ? result : { ...result, markdown: null }
}

/**
 * The Evidence Record of a scrape: read from the full result (its trace and
 * compliance record, which the compact shape drops), with the Markdown and
 * JSON this response delivers.
 */
function scrapeEvidenceRecord(result: FetchResult, req: ScrapeRequest, delivered: Pick<ScrapeResponse, 'markdown' | 'json'>): NonNullable<ScrapeResponse['evidenceRecord']> {
  return toEvidenceRecord(result, { mode: defaultApiMode(req.mode) }, { markdown: delivered.markdown, ...(delivered.json === undefined ? {} : { json: delivered.json }) })
}

/** The page fields of a result that was not read as content: nothing was read, so nothing is declared. */
const NO_PAGE_METADATA: PageMetadata = { title: null, description: null, language: null, keywords: null, robots: null, favicon: null, canonicalUrl: null }

const BROWSER_LANES: ReadonlySet<Lane> = new Set<Lane>(['browser_local', 'browser_local_authed', 'browser_proxy'])

/**
 * Which egress the answering lane recorded: the caller's own, from the signed
 * compliance record (`access.egressOwner`), else the server's environment
 * proxy, from `evidence.envProxy` or the `egress_proxy` trace events, else
 * none. Never a guess: a lane that does not report its route gives null.
 */
function proxyUsedOf(result: Pick<FetchResult, 'compliance' | 'evidence' | 'trace'>): ScrapeMetadata['proxyUsed'] {
  if (result.compliance?.access.egressOwner === 'user') return 'user'
  if (typeof result.evidence.envProxy === 'string' || result.trace.some((event) => event.event === 'egress_proxy')) return 'operator'
  return null
}

/** The time zone the browser lane declared (its fingerprint's, for the identity it declared); null elsewhere, where none goes on the wire. */
function timezoneOf(result: Pick<FetchResult, 'lane' | 'trace'>): string | null {
  if (!BROWSER_LANES.has(result.lane)) return null
  const device = result.trace.find((event) => event.event === 'identity_declared')?.detail?.device
  return browserFingerprintFor(device === 'mobile' ? 'mobile' : 'desktop').timezoneId
}

/**
 * Whether the per-origin concurrency ceiling held any attempt of the run
 * back, and for how long in all: each lane tried acquired its own permit and
 * reports the hold on its result's timings (`concurrencyWaitMs`).
 */
function concurrencySignal(summary: Pick<LadderExecutionSummary, 'attempts'>): Pick<ScrapeMetadata, 'concurrencyLimited' | 'concurrencyQueueDurationMs'> {
  const waits = summary.attempts.map((attempt) => attempt.result.usage.timings?.concurrencyWaitMs).filter((wait): wait is number => typeof wait === 'number')
  return { concurrencyLimited: waits.length > 0, concurrencyQueueDurationMs: waits.reduce((sum, wait) => sum + wait, 0) }
}

/**
 * A scrape response's `metadata`: the page's own declarations when the page
 * was read as content (all null otherwise: a blocked or failed page is
 * evidence, not the page asked for, and nothing is declared from it), and
 * the facts of the call under Firecrawl's names.
 */
export function scrapeResponseMetadata(run: ScrapeRun, scrapeId: string): ScrapeResponseMetadata {
  return {
    ...(run.metadata ?? NO_PAGE_METADATA),
    scrapeId,
    sourceURL: run.requestedUrl,
    url: run.evidence.finalUrl,
    statusCode: run.evidence.httpStatus,
    contentType: run.evidence.contentType,
    proxyUsed: proxyUsedOf(run),
    timezone: timezoneOf(run),
    ...concurrencySignal(run.summary),
    ...cacheStateOf(run.trace),
  }
}

/**
 * The capture identity of whatever response was received, success or not,
 * in both the full and the compact response shape.
 */
export function scrapeSnapshot(result: FetchResult): CompactScrapeResponse['snapshot'] {
  return {
    rawBodySha256: result.evidence.rawBodySha256,
    artifacts: result.evidence.artifacts,
    httpStatus: result.evidence.httpStatus,
    contentType: result.evidence.contentType,
  }
}

export function compactScrapeResponse(
  next: ScrapeResponse,
  req: ScrapeRequest,
  formats: readonly ScrapeFormat[] = requestedFormats(req, next),
  totalMs = next.summary.totalMs ?? next.usage.wallMs,
): CompactScrapeResponse {
  const includeLinks = req.includeLinks === true || hasFormat(formats, 'links')
  return {
    requestedUrl: next.requestedUrl,
    finalUrl: next.evidence.finalUrl,
    snapshot: scrapeSnapshot(next),
    evidenceRecord: next.evidenceRecord ?? scrapeEvidenceRecord(next, req, {
      markdown: hasFormat(formats, 'markdown') ? next.markdown : null,
      ...(hasFormat(formats, 'json') && next.json !== undefined ? { json: next.json } : {}),
    }),
    status: next.status,
    failureReason: next.failureReason,
    blockReason: next.blockReason,
    budgetExceeded: next.budgetExceeded,
    ...(next.retryAt === undefined ? {} : { retryAt: next.retryAt }),
    lane: next.lane,
    formats: [
      ...(hasFormat(formats, 'markdown') ? ['markdown' as const] : []),
      ...(hasFormat(formats, 'html') ? ['html' as const] : []),
      ...(hasFormat(formats, 'rawHtml') ? ['rawHtml' as const] : []),
      ...(includeLinks ? ['links' as const] : []),
      ...(hasFormat(formats, 'images') ? ['images' as const] : []),
      ...(hasFormat(formats, 'tables') ? ['tables' as const] : []),
      ...(hasFormat(formats, 'attributes') ? ['attributes' as const] : []),
      ...(hasFormat(formats, 'screenshot') ? ['screenshot' as const] : []),
      ...(hasFormat(formats, 'json') ? ['json' as const] : []),
    ],
    ...(hasFormat(formats, 'markdown') ? { markdown: next.markdown } : {}),
    ...(hasFormat(formats, 'html') ? { html: next.html ?? null } : {}),
    ...(hasFormat(formats, 'rawHtml') ? { rawHtml: next.rawHtml ?? null } : {}),
    ...(includeLinks ? { links: next.links ?? [] } : {}),
    // Asked for, and read: a page not read as content (a file, a failed or blocked page) carries neither.
    ...(hasFormat(formats, 'images') && next.images !== undefined ? { images: next.images } : {}),
    ...(hasFormat(formats, 'tables') && next.tables !== undefined ? { tables: next.tables } : {}),
    ...(next.pages === undefined ? {} : { pages: next.pages }),
    ...(hasFormat(formats, 'attributes') && next.attributes !== undefined ? { attributes: next.attributes } : {}),
    // Asked for: the capture, or null when the browser lane rendered no page or could not capture it.
    ...(hasFormat(formats, 'screenshot') ? { screenshot: next.screenshot ?? null } : {}),
    ...(next.document === undefined ? {} : { document: next.document === null ? null : {
      title: next.document.title,
      pageType: next.document.pageType,
      strategy: next.document.strategy,
      confidence: next.document.confidence,
      adapter: next.document.adapter,
      ...(next.document.adapterValidation === undefined ? {} : { adapterValidation: next.document.adapterValidation }),
    } }),
    metadata: next.metadata,
    ...(hasFormat(formats, 'json') && next.json !== undefined ? { json: next.json } : {}),
    ...(next.file === undefined ? {} : { file: next.file }),
    ...(next.warnings === undefined ? {} : { warnings: next.warnings }),
    ...(warningOf(next.warnings) === undefined ? {} : { warning: warningOf(next.warnings) }),
    ...(next.agentHints === undefined ? {} : { agentHints: next.agentHints }),
    truncated: next.truncated,
    truncatedAt: next.truncatedAt,
    usage: { ...next.usage, totalMs },
    channelsTried: next.channelsTried,
  }
}
