import Anthropic from '@anthropic-ai/sdk'
import Ajv from 'ajv'
import type { CodeOptions, ErrorObject, ValidateFunction } from 'ajv'
import type {
  AttributesFormatRequest,
  ListColumn,
  ListFormatRequest,
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
  ProductFieldConflict,
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
import { browserFingerprintFor, cacheStateOf, CONTENTFUL_STATUS, defaultApiMode, RequestError, warningOf } from '@w2l/contracts'
import { compilePathFilter, readinessOf, toEvidenceRecord, verify } from '@w2l/runtime'
import { statesAbsence } from '@w2l/extract-tf'
import { readNumber, type NumberContext } from './numbers.js'
import { pdfLabelledValues } from './pdfFields.js'
import { modelLocator } from './modelEvidence.js'
import { tableStatements, type TableStatement } from './tableContext.js'

export type StructuredModelConfig = OpenAiModelConfig | ClaudeModelConfig

/** An OpenAI-compatible Chat Completions endpoint: the default provider. */
export interface OpenAiModelConfig {
  provider?: 'openai'
  baseUrl: string
  model: string
  apiKey?: string
  fetch?: typeof fetch
}

/** How much a Claude model thinks before it answers (`output_config.effort`). */
export type ClaudeEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
const CLAUDE_EFFORTS: ReadonlySet<string> = new Set<ClaudeEffort>(['low', 'medium', 'high', 'xhigh', 'max'])

/** Anthropic's Messages API, called through the official SDK. */
export interface ClaudeModelConfig {
  provider: 'anthropic'
  model: string
  apiKey: string
  /** The SDK's own when unset: ANTHROPIC_BASE_URL, else https://api.anthropic.com. */
  baseUrl?: string
  /** `low` when unset (CLAUDE_DEFAULT_EFFORT). */
  effort?: ClaudeEffort
  fetch?: typeof fetch
}

/**
 * The extraction model the environment names, or null. W2L_EXTRACT_PROVIDER
 * picks the API: `openai` (or unset) for an OpenAI-compatible endpoint at
 * W2L_EXTRACT_BASE_URL, `anthropic` for Claude's Messages API, whose key is
 * W2L_EXTRACT_API_KEY, else ANTHROPIC_API_KEY. A provider or effort the code
 * does not know, or a Claude model without a key, is no configuration.
 */
export function structuredModelConfigFromEnv(): StructuredModelConfig | null {
  const provider = process.env.W2L_EXTRACT_PROVIDER?.trim().toLowerCase() || 'openai'
  const baseUrl = process.env.W2L_EXTRACT_BASE_URL?.trim()
  const model = process.env.W2L_EXTRACT_MODEL?.trim()
  const apiKey = process.env.W2L_EXTRACT_API_KEY?.trim()
  if (provider === 'anthropic') {
    const key = apiKey || process.env.ANTHROPIC_API_KEY?.trim()
    const effort = process.env.W2L_EXTRACT_EFFORT?.trim().toLowerCase()
    if (!model || !key || (effort && !CLAUDE_EFFORTS.has(effort))) return null
    return { provider, model, apiKey: key, ...(baseUrl ? { baseUrl } : {}), ...(effort ? { effort: effort as ClaudeEffort } : {}) }
  }
  if (provider !== 'openai' || !baseUrl || !model) return null
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
  /** The rule a number was read from `text` by (numbers.ts). */
  conversion?: string
  /** The unit stated with the value and what it holds for (StructuredFieldEvidence.context). */
  context?: StructuredFieldEvidence['context']
  /** The source states there is no value: `value` is null and `text` is that statement (`N/A`). */
  absent?: true
}

/** Keys, reduced by labelKey, that can name an amount of money. */
const MONEY_KEY = /price|amount|cost|fee|total|charge|tax|preis|prix|precio|prezzo|betrag|kosten|gebühr/

/** Units a percentage is written in; any other unit beside a number is its currency. */
const PERCENT_UNITS: ReadonlySet<string> = new Set(['%', 'pp', 'p.p.'])

/** The candidate's context: what the fact holds for, with the unit its number is in. A currency the declaration states wins over the mark in the text. */
function readingContext(fact: Pick<ProductFact, 'unit' | 'context'> | undefined, unit: string | undefined): Candidate['context'] | undefined {
  const currency = fact?.unit ?? (unit !== undefined && !PERCENT_UNITS.has(unit) ? unit : undefined)
  const context = {
    ...fact?.context,
    ...(currency === undefined ? {} : { currency }),
    ...(unit !== undefined && PERCENT_UNITS.has(unit) ? { unit } : {}),
  }
  return Object.keys(context).length > 0 ? context : undefined
}

/** A fact the source states there is none of, as a candidate: null, quoting the statement. */
const absentCandidate = (fact: ProductFact | { source: StructuredFieldEvidence['source']; path?: string; value: string }): Candidate => ({
  value: null, fact: { source: fact.source, ...(fact.path === undefined ? {} : { path: fact.path }) }, text: fact.value, absent: true,
})

/** Sources whose format writes `.` as the decimal point: JSON-LD and OpenGraph product meta. Microdata may hold visible text. */
const DECIMAL_POINT_SOURCES: ReadonlySet<string> = new Set(['jsonld', 'meta'])

function unreadMessage(text: string, where: NonNullable<Candidate['fact']>, why: string): string {
  return `the page states ${JSON.stringify(text)} (${where.source}${where.path === undefined ? '' : `, ${where.path}`}): ${why}; no number was read`
}

/** A product fact's number and the text it was read from, with its rule and unit, or its text and why no number was read (numbers.ts). */
function factNumber(fact: ProductFact, context: NumberContext = {}): Omit<Candidate, 'fact' | 'unreadMembers'> {
  const reading = readNumber(fact.value, { ...context, decimalPoint: DECIMAL_POINT_SOURCES.has(fact.source) })
  if (!('value' in reading)) return { value: fact.value, unread: unreadMessage(fact.value, fact, reading.message) }
  const evidenceContext = readingContext(fact, reading.unit)
  return { value: reading.value, text: fact.value, conversion: reading.conversion, ...(evidenceContext === undefined ? {} : { context: evidenceContext }) }
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
type LabelReading = { value: JsonValue; number?: { conversion: string; unit?: string } } | { unsettled: string } | { absent: true }

function labelValue(text: string, schema: JsonSchema, language: string | null): LabelReading | undefined {
  // "N/A" is the page saying there is none, whatever type the field is.
  if (statesAbsence(text)) return { absent: true }
  const types = schemaTypes(schema)
  if (types.length === 0 || types.includes('string')) return { value: text }
  if (types.includes('number') || types.includes('integer')) {
    const reading = readNumber(text, { language })
    if (!('value' in reading)) return reading.reason === 'unsettled' ? { unsettled: reading.message } : undefined
    return types.includes('number') || Number.isInteger(reading.value)
      ? { value: reading.value, number: { conversion: reading.conversion, ...(reading.unit === undefined ? {} : { unit: reading.unit }) } }
      : undefined
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
  language: string | null,
): void {
  for (const [name, child] of Object.entries(effective(root, root).properties ?? {})) {
    const key = labelKey(name)
    // A product field its own sources dispute is not settled by a page label either.
    if (key.length === 0 || map.has(name.toLowerCase()) || issues.some(issue => issue.path === `/${name}`)) continue
    const exact = labels.filter(item => labelKey(item.label) === key)
    const matched = exact.length > 0 ? exact : labels.filter(item => baseLabelKey(item.label) === key)
    if (matched.length === 0) continue
    // The page's language never settles money: not on a product page, not for a key that names an amount.
    const notation = MONEY_KEY.test(key) ? null : language
    const readings = matched.map(item => labelValue(item.value, effective(root, child), notation))
    if (readings.every(reading => reading === undefined)) continue
    const first = matched[0]!
    const fact: NonNullable<Candidate['fact']> = { source: first.source ?? 'dom', path: `${first.path} ${JSON.stringify(first.label)}` }
    if (readings.every(reading => reading !== undefined && 'absent' in reading)) {
      map.set(name.toLowerCase(), absentCandidate({ ...fact, value: first.value }))
      continue
    }
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
    const number = readings[0] !== undefined && 'number' in readings[0] ? readings[0].number : undefined
    const context = readingContext(undefined, number?.unit)
    map.set(name.toLowerCase(), {
      value: values[0]!, fact, ...(number === undefined ? {} : { text: first.value, conversion: number.conversion }), ...(context === undefined ? {} : { context }),
    })
  }
}

/**
 * Schema keys that name, under another name, what a declared value states
 * unambiguously, with the declared names to read in order: a scholarly page's
 * citation tags, and an article's own name in its JSON-LD for its headline.
 * Any other key matches a declared name only as written (`citation_doi`,
 * `datePublished`). A submission or other date is not read from a tag that
 * names a different one.
 */
const DECLARED_SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  author: ['citation_author'],
  authors: ['citation_author'],
  doi: ['citation_doi'],
  date: ['citation_publication_date', 'citation_date'],
  publicationdate: ['citation_publication_date', 'citation_date'],
  headline: ['headline', 'name'],
}

/**
 * Candidates from what the page's markup declares (DeclaredValue) and its
 * `<meta name="description">` (not on a product page), for top-level keys
 * nothing else covers and whose labels did not disagree. An
 * array field takes every value of a tag; a string field takes its value when
 * it has one, and is left out, saying why, when a repeated tag has several. Article nodes that state a
 * property differently leave the field out with a `field_ambiguous` issue.
 */
function addDeclaredCandidates(
  map: Map<string, Candidate>,
  root: JsonSchema,
  result: FetchResult,
  issues: StructuredExtractionIssue[],
): void {
  const declared = result.document?.declaredValues ?? []
  // A shop's meta description is its sales line, not the product's description.
  const description = result.document?.product === null || result.document?.product === undefined ? result.metadata?.description ?? null : null
  for (const [name, child] of Object.entries(effective(root, root).properties ?? {})) {
    const key = labelKey(name)
    // Labels that disagree leave the field out: a declared value does not settle it.
    if (key.length === 0 || map.has(name.toLowerCase()) || issues.some(issue => issue.path === `/${name}`)) continue
    if (key === 'description' && description !== null) {
      map.set(name.toLowerCase(), { value: description, fact: { source: 'meta', path: 'meta[name="description"]' } })
      continue
    }
    // An article's `name` is its headline, not what a `name` key asks for on the page (a person's, a product's).
    const exact = declared.filter(item => item.name !== 'name' && labelKey(item.name) === key)
    const entries = exact.length > 0 ? exact : (DECLARED_SYNONYMS[key] ?? []).map(alias => declared.filter(item => item.name === alias)).find(list => list.length > 0)
    if (entries === undefined || entries.length === 0) continue
    const first = entries[0]!
    const fact: NonNullable<Candidate['fact']> = { source: first.source, path: first.path }
    const context = first.context === undefined ? {} : { context: first.context }
    if (entries.some(item => JSON.stringify(item.values) !== JSON.stringify(first.values))) {
      issues.push({
        code: 'field_ambiguous',
        path: `/${name}`,
        message: `the page declares different values for /${name}: ${entries.map(item => `${item.path} = ${JSON.stringify(item.values.join(', '))}`).join(', ')}`,
      })
      continue
    }
    map.set(name.toLowerCase(), {
      value: first.values.length === 1 && !schemaTypes(effective(root, child)).includes('array') ? first.values[0]! : [...first.values],
      fact,
      ...context,
      ...(first.values.length > 1 ? { unread: `the page declares ${first.values.length} values for ${first.name} (${first.path}); a string holds one, so none was chosen` } : {}),
    })
  }
}

/**
 * A title that opens with a document series' number (`PEP 8 – Style Guide
 * for Python Code`, `RFC 9112: HTTP/1.1`), without it, for a schema that asks
 * for that number in a field of its own: `number`, `no` or `num`, or one named
 * after the series (`pep_number`, `rfcNumber`, `pep`). The number is the
 * document's identifier there, not part of its title. A number field about
 * something else (`phoneNumber`, `caseNumber`) does not ask for it.
 */
function withoutDocumentNumber(title: string, root: JsonSchema): string {
  const m = /^([A-Z]{2,6})[ -]?\d+\s*[:–—-]\s+(\S.*)$/.exec(title)
  if (m === null) return title
  const series = m[1]!.toLowerCase()
  const asked = Object.keys(effective(root, root).properties ?? {}).some((name) => {
    const key = name.toLowerCase().replace(/[^a-z0-9]/g, '')
    return ['number', 'no', 'num', series, `${series}number`, `${series}no`, `${series}num`].includes(key)
  })
  return asked ? m[2]! : title
}

/** A scholarly page's own title, from its citation_title tag: the first heading may name the archive's subject instead (arXiv). */
function citationTitle(result: FetchResult): Candidate | null {
  const tag = result.document?.declaredValues?.find(item => item.name === 'citation_title')
  return tag === undefined || tag.values.length !== 1 ? null : { value: tag.values[0]!, fact: { source: tag.source, path: tag.path } }
}

function candidates(result: FetchResult, schema?: JsonSchema, issues: StructuredExtractionIssue[] = []): Map<string, Candidate> {
  const map = new Map<string, Candidate>()
  const product = result.document?.product ?? null
  const put = (keys: readonly string[], fact: ProductFact | null | undefined, read?: (fact: ProductFact) => Omit<Candidate, 'fact'>): void => {
    if (fact === null || fact === undefined) return
    const context = readingContext({ context: fact.context }, undefined)
    const candidate: Candidate = fact.absent === true ? absentCandidate(fact)
      : { value: fact.value, fact: { source: fact.source, ...(fact.path === undefined ? {} : { path: fact.path }) }, ...(context === undefined ? {} : { context }), ...read?.(fact) }
    for (const key of keys) map.set(key.toLowerCase(), candidate)
  }
  const language = result.metadata?.language ?? null
  // The fetch's own URLs, the content title and the page type W2L inferred:
  // each says where it came from, like a value read from the page.
  map.set('url', { value: result.evidence.finalUrl, fact: { source: 'fetch', path: 'finalUrl' } })
  map.set('requesturl', { value: result.requestedUrl, fact: { source: 'fetch', path: 'requestedUrl' } })
  map.set('finalurl', { value: result.evidence.finalUrl, fact: { source: 'fetch', path: 'finalUrl' } })
  const citation = citationTitle(result)
  if (citation !== null) {
    map.set('title', citation)
    map.set('pagetitle', citation)
  } else if (result.document?.title) {
    const fact = titleFact(result.document.title, result.document.titlePath, result.metadata)
    const value = schema === undefined ? result.document.title : withoutDocumentNumber(result.document.title, schema)
    map.set('title', { value, fact })
    map.set('pagetitle', { value, fact })
  }
  if (result.document?.pageType) map.set('pagetype', { value: result.document.pageType, fact: { source: 'inferred', path: 'document.pageType' } })
  if (product !== null) addProductCandidates(map, product, put, language)
  if (product !== null && schema !== undefined) addProductConflicts(product, schema, issues)
  // A PDF's labels are its `Label: value` lines, each with its page (pdfFields.ts).
  if (schema !== undefined) addLabelCandidates(map, schema, [...(result.document?.labelledValues ?? []), ...pdfLabelledValues(result)], issues, product === null ? language : null)
  if (schema !== undefined) addDeclaredCandidates(map, schema, result, issues)
  return map
}

/**
 * Where the content title was read: the extractor says which heading of the
 * main content (`h1[1]`, `h2[0]`, counted like label rows) or the page's
 * `<title>`. A document without that record took the first heading (`h1[0]`)
 * and fell back to the `<title>`, which the page metadata holds as written.
 * Without either the place is unknown.
 */
function titleFact(title: string, path: string | undefined, metadata: FetchResult['metadata']): Candidate['fact'] {
  if (path !== undefined) return { source: 'dom', path }
  if (metadata === undefined || metadata === null) return { source: 'dom' }
  const text = (value: string): string => value.replace(/\s+/g, ' ').trim()
  return { source: 'dom', path: metadata.title !== null && text(metadata.title) === text(title) ? 'title' : 'h1[0]' }
}

/** The schema keys each declared product field fills. */
const PRODUCT_FIELD_KEYS: Readonly<Record<ProductFieldConflict['field'], readonly string[]>> = {
  sku: ['asin', 'id', 'productid', 'subjectid', 'sku'],
  name: ['title', 'name', 'productname'],
  brand: ['brand'],
  price: ['price', 'amount', 'currentprice'],
  priceCurrency: ['currency', 'pricecurrency'],
  availability: ['availability', 'stock'],
}

/**
 * A product field the product's own sources state differently is left
 * null by the extractor (ProductFacts.ambiguous); each top-level key that asks
 * for it gets a `field_ambiguous` issue naming every statement and its path.
 */
function addProductConflicts(product: ProductFacts, root: JsonSchema, issues: StructuredExtractionIssue[]): void {
  for (const conflict of product.ambiguous ?? []) {
    for (const name of Object.keys(effective(root, root).properties ?? {})) {
      if (!PRODUCT_FIELD_KEYS[conflict.field].includes(name.toLowerCase())) continue
      issues.push({
        code: 'field_ambiguous',
        path: `/${name}`,
        message: `the page states different values for /${name}: ${conflict.facts.map(fact => `${JSON.stringify(fact.value)} (${fact.source}${fact.path === undefined ? '' : `, ${fact.path}`})`).join(', ')}`,
      })
    }
  }
}

/**
 * A product page without a site adapter whose declared products could not be
 * told apart (ProductFacts.identity): what was read is not verified as the
 * requested product's, so the result is not complete. A site adapter reports
 * its own subject through adapterValidation.
 */
function subjectIssues(result: FetchResult): StructuredExtractionIssue[] {
  const identity = result.document?.product?.identity
  if (identity === undefined || identity.status === 'matched' || result.document?.adapterValidation?.valid === false) return []
  return [{
    code: 'subject_unverified',
    message: `product identity ${identity.status}: only what every candidate states alike was read (${identity.identityEvidence.join('; ')})`,
  }]
}

function addProductCandidates(
  map: Map<string, Candidate>,
  product: ProductFacts,
  put: (keys: readonly string[], fact: ProductFact | null | undefined, read?: (fact: ProductFact) => Omit<Candidate, 'fact'>) => void,
  language: string | null,
): void {
  put(PRODUCT_FIELD_KEYS.sku, product.subjectId ?? product.sku)
  put(PRODUCT_FIELD_KEYS.name, product.name)
  put(PRODUCT_FIELD_KEYS.brand, product.brand)
  put(PRODUCT_FIELD_KEYS.price, product.price, fact => factNumber(fact, { currency: product.priceCurrency?.value }))
  // A site adapter that observed the quote absent ("Currently unavailable") states that there is no price, at its availability.
  if (product.price === null && product.quoteState === 'absent_observed' && product.availability !== null) {
    for (const key of PRODUCT_FIELD_KEYS.price) map.set(key, absentCandidate(product.availability))
  }
  put(PRODUCT_FIELD_KEYS.priceCurrency, product.priceCurrency)
  put(['seller', 'merchant'], product.seller)
  put(PRODUCT_FIELD_KEYS.availability, product.availability)
  put(['deliverylocation', 'deliveryregion', 'region'], product.deliveryLocation)
  put(['rating'], product.rating, fact => factNumber(fact, { language }))
  put(['reviewcount', 'reviews'], product.reviewCount, fact => factNumber(fact, { count: true, language }))
  map.set('kind', { value: product.kind ?? 'unknown', fact: { source: 'inferred', ...(product.kind === undefined ? {} : { path: 'document.product.kind' }) } })
  // A list is a source only when the extractor read it from the page. The
  // Amazon adapter reports what it observed on the verified subject, possibly
  // an empty list; a generic product page has no such list, and an invented []
  // or {} would claim the page has none. A list's evidence is its first
  // item's; an empty one's is the extractor's report that it observed none.
  const { authors, images, prices, variants, specifications } = product
  if (authors !== undefined && authors.length > 0) map.set('authors', { value: authors.map(item => item.value), fact: authors[0]! })
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
  // A list of strings is one string only when it holds one: its items are not joined into text the page never wrote.
  if (types.includes('string') && Array.isArray(value)) return value.length === 1 && typeof value[0] === 'string' ? value[0] : undefined
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
        // A number read from page text quotes that text, with the value and rule it was read by; a stated absence quotes the statement.
        const text = direct.absent === true ? direct.text : typeof value !== 'number' ? undefined : direct.text ?? (typeof direct.value === 'string' ? direct.value : undefined)
        const reading = typeof value !== 'number' || text === undefined ? undefined : direct.conversion !== undefined ? { conversion: direct.conversion } : readNumber(text)
        evidence.push({
          path,
          source: direct.fact.source,
          ...(direct.fact.path === undefined ? {} : { evidencePath: direct.fact.path }),
          ...(text === undefined ? {} : { text }),
          ...(reading !== undefined && 'conversion' in reading ? { normalized: value as number, conversion: reading.conversion } : {}),
          ...(direct.context === undefined ? {} : { context: direct.context }),
          ...(direct.absent === true ? { absent: true as const } : {}),
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
    if (candidate.absent === true) {
      const where = candidate.fact === undefined ? '' : ` (${candidate.fact.source}${candidate.fact.path === undefined ? '' : `, ${candidate.fact.path}`})`
      issues.push({ code: 'field_absent', path, message: `the page states there is no value for ${path}: ${JSON.stringify(candidate.text)}${where}` })
      continue
    }
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

/** A second representation of explicitly selected records, bounded independently of the list's own limits. */
const LIST_JSON_MAX_RECORDS = 2_000
const LIST_JSON_MAX_CHARS = 1_000_000
const pointerPart = (key: string): string => key.replace(/~/g, '~0').replace(/\//g, '~1')

function selectedListJson(result: FetchResult, request: ListFormatRequest, format?: JsonFormatRequest): StructuredExtractionResult {
  const schemaSha256 = format === undefined ? undefined : sha256Utf8(JSON.stringify(format.schema))
  const incomplete = (message: string, code: StructuredExtractionIssue['code'] = 'field_unavailable'): StructuredExtractionResult => ({ status: 'incomplete', data: null, ...(schemaSha256 === undefined ? {} : { schemaSha256 }), evidence: [], issues: [{ code, message }], modelUsage: null })
  const pageIssue = unsuccessfulPage(result)
  if (pageIssue !== null) return { ...incomplete(pageIssue.message, pageIssue.code), issues: [pageIssue] }
  const list = result.list
  const fields = request.fields ?? list?.detected?.fields
  if (list === undefined || list.itemSelector !== request.itemSelector || fields === undefined || fields.length === 0 ||
    list.fields.length !== fields.length || fields.some((field, index) => field.name !== list.fields[index])) return incomplete('the explicitly selected list and its field specification were not captured; page-wide facts were not substituted')
  if (list.pages !== 1 || list.records.some(record => record.source.page !== 1 || ![result.requestedUrl, result.evidence.finalUrl].includes(record.source.url))) return incomplete('selected-list JSON covers one captured page; records from multiple or unrelated pages were not combined')
  if (list.records.length > LIST_JSON_MAX_RECORDS) return incomplete('selected-list JSON exceeded its 2000-record limit; the list output retains its records')
  const namedFields = new Map(fields.map(field => [field.name, field]))
  // The selected rows' table columns, read with these records only (FetchOptions.listColumns).
  const columns = result.listColumns?.length === list.records.length ? result.listColumns : undefined
  const location = (index: number, name: string): string => {
    const record = list.records[index]!
    const field = namedFields.get(name)!
    return `${JSON.stringify(record.source.url)} page ${record.source.page} ${request.itemSelector} record ${record.source.index} ${field.selector ?? ':scope'} ${field.attribute === undefined ? 'text' : `@${field.attribute}`}`
  }
  const recordLocation = (index: number): string => {
    const record = list.records[index]!
    return `${JSON.stringify(record.source.url)} page ${record.source.page} ${request.itemSelector} record ${record.source.index}`
  }
  const columnLocation = (index: number, column: ListColumn): string => `${recordLocation(index)} column ${column.column} ${JSON.stringify(column.header)} text`
  let chars = 0
  for (const [index, record] of list.records.entries()) {
    if (Object.keys(record.values).some(name => !namedFields.has(name))) return incomplete('captured list fields differ from the selected field specification; unrelated fields were not copied')
    chars += record.source.url.length + 32
    for (const field of fields) chars += field.name.length + (record.values[field.name]?.length ?? 4) + location(index, field.name).length
    if (chars > LIST_JSON_MAX_CHARS) return incomplete('selected-list JSON exceeded its 1000000-character source/evidence budget; the list output retains its records')
  }
  const issues = [...partialPage(result)]
  if (list.truncated) issues.push({ code: 'field_unavailable', message: 'the selected list was truncated; JSON retains only the captured records and cannot be complete' })
  if (list.incomplete > 0) issues.push({ code: 'field_unavailable', message: 'selected records have missing requested fields; their nulls are retained and the JSON cannot be complete' })
  if (list.records.length === 0) issues.push({ code: 'field_unavailable', message: 'no selected records were captured; an empty result was not inferred to satisfy the task' })
  const evidence: StructuredFieldEvidence[] = []
  const missing = (path: string): void => { issues.push({ code: 'field_unavailable', path, message: `selected record has no value at ${path}; no value from another record or the page was substituted` }) }
  if (format === undefined) {
    const records = list.records.map((record, index) => {
      for (const field of fields) {
        const path = `/records/${index}/values/${pointerPart(field.name)}`
        if (record.values[field.name] === null || record.values[field.name] === undefined || record.missing.includes(field.name)) missing(path)
        else evidence.push({ path, source: 'dom', evidencePath: location(index, field.name) })
      }
      return { values: { ...record.values }, missing: [...record.missing], source: { ...record.source } }
    })
    return { status: issues.length === 0 ? 'complete' : 'incomplete', data: { records }, evidence, issues, modelUsage: null }
  }
  let validate: ValidateFunction
  try { validate = compile(format.schema) } catch (error) {
    return { status: 'invalid', data: null, schemaSha256, evidence: [], issues: [{ code: 'schema_invalid', message: error instanceof Error ? error.message : String(error) }], modelUsage: null }
  }
  const root = effective(format.schema, format.schema)
  /**
   * A key no list field names, from the record's table column whose header
   * names it (compared as page labels are, an exact header before one that
   * matches without its bracketed qualifier). Columns that state different
   * values leave it out.
   */
  const columnValue = (index: number, name: string, valuePath: string): { raw: string; column: ListColumn } | 'ambiguous' | null => {
    const key = labelKey(name)
    const row = columns?.[index] ?? []
    const exact = row.filter(column => labelKey(column.header) === key)
    const matched = (exact.length > 0 ? exact : row.filter(column => baseLabelKey(column.header) === key)).filter(column => column.value !== null)
    if (key.length === 0 || matched.length === 0) return null
    if (matched.some(column => column.value !== matched[0]!.value)) {
      issues.push({ code: 'field_ambiguous', path: valuePath, message: `the selected record's columns state different values for ${valuePath}: ${matched.map(column => `${JSON.stringify(column.header)} = ${JSON.stringify(column.value)} (column ${column.column})`).join(', ')}` })
      return 'ambiguous'
    }
    return { raw: matched[0]!.value!, column: matched[0]! }
  }
  /**
   * A number's reading (numbers.ts) and context: the currency or percent its
   * text states, and the unit and as-of date its table states for the columns
   * it was read under (tableContext.ts), each with where it was read. Two
   * statements that disagree leave that entry out with field_ambiguous.
   */
  const numberEvidence = (raw: string, under: readonly ListColumn[], index: number, valuePath: string): Partial<StructuredFieldEvidence> => {
    const reading = readNumber(raw)
    if (!('value' in reading)) return { text: raw }
    const context: NonNullable<StructuredFieldEvidence['context']> = { ...readingContext(undefined, reading.unit) }
    const contextEvidence: NonNullable<StructuredFieldEvidence['contextEvidence']> = {}
    const { units, dates } = tableStatements(under)
    const stated = (key: 'unit' | 'date', statements: TableStatement[], own?: TableStatement): void => {
      const all = own === undefined || statements.length === 0 ? statements : [own, ...statements]
      if (all.length === 0) return
      if (all.some(statement => statement.value !== all[0]!.value)) {
        const states = own === undefined ? 'the table states' : 'the number\'s own text and its table state'
        issues.push({ code: 'field_ambiguous', path: valuePath, message: `${states} different ${key === 'unit' ? 'units' : 'dates'} for ${valuePath}: ${all.map(statement => `${JSON.stringify(statement.value)} (${statement.where})`).join(', ')}; ${own === undefined ? 'none was given' : 'only the text\'s own is given'}` })
        return
      }
      if (own !== undefined) return
      context[key] = all[0]!.value
      chars += all[0]!.text.length + all[0]!.where.length
      contextEvidence[key] = { text: all[0]!.text, evidencePath: `${recordLocation(index)} ${all[0]!.where}` }
    }
    // A percent the number's own text states is its unit; a table that states another is in doubt.
    stated('unit', units, context.unit === undefined ? undefined : { value: context.unit, text: raw, where: 'the value\'s own text' })
    stated('date', dates)
    return {
      text: raw, normalized: reading.value, conversion: reading.conversion,
      ...(Object.keys(context).length === 0 ? {} : { context }),
      ...(Object.keys(contextEvidence).length === 0 ? {} : { contextEvidence }),
    }
  }
  const recordValue = (schema: JsonSchema, index: number, path: string): JsonValue => {
    const record = list.records[index]!
    const out: Record<string, JsonValue> = {}
    for (const [name, child] of Object.entries(effective(format.schema, schema).properties ?? {})) {
      const valuePath = `${path}/${pointerPart(name)}`
      const field = namedFields.get(name)
      const read = field === undefined ? columnValue(index, name, valuePath) : null
      const fromColumn = read === 'ambiguous' ? null : read
      const raw = fromColumn !== null ? fromColumn.raw : field === undefined || record.missing.includes(name) ? null : record.values[name] ?? null
      const target = effective(format.schema, child)
      if (raw === null) {
        if (schemaTypes(target).includes('null')) Object.defineProperty(out, name, { value: null, enumerable: true, configurable: true })
        if (read !== 'ambiguous') missing(valuePath)
        continue
      }
      const value = coerce(raw, target)
      if (value === undefined) {
        if (schemaTypes(target).includes('null')) Object.defineProperty(out, name, { value: null, enumerable: true, configurable: true })
        issues.push({ code: 'field_unavailable', path: valuePath, message: `the source text ${JSON.stringify(raw)} could not be read as the requested type; it remains on the list record` })
        continue
      }
      Object.defineProperty(out, name, { value, enumerable: true, configurable: true })
      const evidencePath = fromColumn !== null ? columnLocation(index, fromColumn.column) : location(index, name)
      // A column counts against the budget once a key is read from it; the fields were counted above.
      if (fromColumn !== null) chars += name.length + raw.length + evidencePath.length
      const under = fromColumn !== null ? [fromColumn.column] : columns?.[index]?.filter(column => column.fields?.includes(name)) ?? []
      evidence.push({ path: valuePath, source: 'dom', evidencePath, ...(typeof value === 'number' ? numberEvidence(raw, under, index, valuePath) : {}) })
    }
    return out
  }
  let data: JsonValue
  if (schemaTypes(root).includes('array') && root.items !== undefined) {
    data = list.records.map((_record, index) => recordValue(root.items!, index, `/${index}`))
  } else {
    const arrays = Object.entries(root.properties ?? {}).filter(([, schema]) => schemaTypes(effective(format.schema, schema)).includes('array'))
    if (arrays.length === 1) {
      const [name, schema] = arrays[0]!
      const items = effective(format.schema, schema).items
      if (items === undefined) return incomplete('the selected-record array schema needs an object items schema')
      data = Object.fromEntries([[name, list.records.map((_record, index) => recordValue(items, index, `/${pointerPart(name)}/${index}`))]])
    } else if (arrays.length === 0 && list.records.length === 1 && (schemaTypes(root).includes('object') || root.properties !== undefined)) data = recordValue(root, 0, '')
    else return incomplete('multiple selected records require one record-array schema; a single page-wide object or ambiguous arrays were not filled', 'field_ambiguous')
  }
  if (chars > LIST_JSON_MAX_CHARS) return incomplete('selected-list JSON exceeded its 1000000-character source/evidence budget; the list output retains its records')
  const missingPaths = requiredMissing(format.schema, format.schema, data)
  issues.push(...missingPaths.map(path => ({ code: 'missing_required' as const, path, message: `required selected-record field unavailable: ${path}` })))
  const valid = validate(data)
  if (!valid) issues.push({ code: 'field_unavailable', message: validationMessage(validate.errors) })
  return { status: valid && issues.length === 0 ? 'complete' : 'incomplete', data, schemaSha256, evidence, issues, modelUsage: null }
}

function canonicalStructured(result: FetchResult): StructuredExtractionResult {
  const document = result.document
  const pageIssue = unsuccessfulPage(result)
  const partial = [...partialPage(result), ...subjectIssues(result)]
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

/** What a model call answered, with the tokens and price it was billed at; null where the provider does not say. */
interface ModelAnswer {
  value: JsonValue
  inputTokens: number | null
  outputTokens: number | null
  costUsd: number | null
}

/** A reply without an answer (a refusal, an answer cut off), with what it was billed for. */
class ModelNoAnswer extends Error {
  constructor(message: string, readonly usage: Omit<ModelAnswer, 'value'>) {
    super(message)
  }
}

const MODEL_SYSTEM = 'Return only facts supported by the supplied subject content. Do not infer from recommendations or unrelated products.'

/** The user message: the task, the values already read, the page's Markdown and, on the second call, what to repair. */
function modelInput(result: FetchResult, format: JsonFormatRequest, deterministic: JsonValue, repair: string | null): Record<string, JsonValue> {
  return {
    prompt: format.prompt ?? 'Complete the missing schema fields.',
    deterministic,
    subject: result.markdown ?? '',
    ...(repair === null ? {} : { repair }),
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
): Promise<ModelAnswer> {
  execution.signal?.throwIfAborted()
  if (config.provider === 'anthropic') return callClaude(result, format, request, deterministic, execution, config, repair)
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
        { role: 'system', content: MODEL_SYSTEM },
        { role: 'user', content: JSON.stringify(modelInput(result, format, deterministic, repair)) },
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
    costUsd: null,
  }
}

/**
 * Extraction is a lookup in the supplied Markdown, and every value the model
 * writes is checked against the page afterwards: thinking at `low` keeps the
 * output tokens it bills (thinking counts as output) and the latency down.
 * Claude Haiku 5.5 defaults to `medium`, Claude Sonnet 5.5 to `high`.
 */
const CLAUDE_DEFAULT_EFFORT: ClaudeEffort = 'low'
/** Room for adaptive thinking and the answer without streaming. */
const CLAUDE_MAX_TOKENS = 16_000

/**
 * Published prices in USD per million tokens (platform.claude.com/docs/en/about-claude/pricing,
 * read 2026-10-23). Claude Haiku 5.5 bills a prompt of over 100,000 tokens at its long-prompt prices.
 */
const CLAUDE_PRICES: Readonly<Record<string, { input: number; output: number; long?: { above: number; input: number; output: number } }>> = {
  'claude-haiku-5-5': { input: 0.10, output: 0.50, long: { above: 100_000, input: 0.50, output: 2.50 } },
  'claude-sonnet-5-5': { input: 2, output: 10 },
}

/**
 * One call's price from its usage, or null when it is not known: a model not
 * in the table, or a call billed at other rates than the table's (cached
 * input, a region or service tier with its own multiplier).
 */
function claudeCostUsd(model: string, usage: Anthropic.Usage): number | null {
  const price = CLAUDE_PRICES[model]
  if (price === undefined || (usage.cache_creation_input_tokens ?? 0) > 0 || (usage.cache_read_input_tokens ?? 0) > 0) return null
  if ((usage.inference_geo ?? 'global') !== 'global' || (usage.service_tier ?? 'standard') !== 'standard') return null
  const rates = price.long !== undefined && usage.input_tokens > price.long.above ? price.long : price
  return (usage.input_tokens * rates.input + usage.output_tokens * rates.output) / 1e6
}

/**
 * The Messages API with structured outputs. Claude takes the same strict-safe
 * schema as OpenAI strict mode (closed objects, every property required,
 * optional ones nullable, only type, properties, required, items, enum,
 * const, anyOf, $ref, $defs and description). A schema that cannot be made
 * strict-safe, such as an open map, is sent in the message instead, with the
 * answer asked for as JSON, because structured outputs take only closed
 * objects. No other model answers for a refusal: modelUsage names the model
 * that answered.
 */
async function callClaude(
  result: FetchResult,
  format: JsonFormatRequest,
  request: ModelSchema,
  deterministic: JsonValue,
  execution: ExecutionContext,
  config: ClaudeModelConfig,
  repair: string | null,
): Promise<ModelAnswer> {
  const client = new Anthropic({
    apiKey: config.apiKey,
    authToken: null,
    ...(config.baseUrl === undefined ? {} : { baseURL: config.baseUrl }),
    ...(config.fetch === undefined ? {} : { fetch: config.fetch }),
  })
  const input = modelInput(result, format, deterministic, repair)
  const message = await client.messages.create({
    model: config.model,
    max_tokens: CLAUDE_MAX_TOKENS,
    system: request.strict ? MODEL_SYSTEM : `${MODEL_SYSTEM} Answer with one JSON object that the JSON Schema in "schema" accepts, and nothing else.`,
    messages: [{ role: 'user', content: JSON.stringify(request.strict ? input : { ...input, schema: request.schema }) }],
    output_config: {
      effort: config.effort ?? CLAUDE_DEFAULT_EFFORT,
      ...(request.strict ? { format: { type: 'json_schema' as const, schema: request.schema as Record<string, unknown> } } : {}),
    },
  }, { signal: execution.signal })
  const usage = {
    inputTokens: message.usage.input_tokens + (message.usage.cache_creation_input_tokens ?? 0) + (message.usage.cache_read_input_tokens ?? 0),
    outputTokens: message.usage.output_tokens,
    costUsd: claudeCostUsd(config.model, message.usage),
  }
  if (message.stop_reason === 'refusal') {
    const category = message.stop_details?.category
    throw new ModelNoAnswer(`the model declined to answer (stop_reason refusal${category ? `, category ${category}` : ''})`, usage)
  }
  if (message.stop_reason === 'max_tokens' || message.stop_reason === 'model_context_window_exceeded') {
    throw new ModelNoAnswer(`the model's answer was cut off (stop_reason ${message.stop_reason})`, usage)
  }
  const text = message.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('').trim()
  try {
    return { value: JSON.parse(text.replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/, '$1')) as JsonValue, ...usage }
  } catch {
    throw new ModelNoAnswer('the model answered with text that is not JSON', usage)
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

/** What the model wrote that the page states, and what it does not. */
interface ModelCheck {
  evidence: StructuredFieldEvidence[]
  unsupported: Array<{ path: string; value: JsonValue }>
}

/**
 * A value the model wrote, kept only where the page states it (F2,
 * modelEvidence.ts): a scalar is kept when located, with its location as
 * evidence; an object or array keeps its located members and is dropped when
 * none is left. A key the schema names is the caller's; any other key (a map's,
 * under `additionalProperties`) is the model's too, and is kept only when the
 * page states it as well. An array's kept items are renumbered, and an item
 * dropped whole is reported at the array's path. A null says unavailable and
 * is kept without evidence.
 */
function supportedValue(value: JsonValue, path: string, root: JsonSchema, schemaInput: JsonSchema | undefined, locate: ReturnType<typeof modelLocator>, check: ModelCheck): JsonValue | undefined {
  if (value === null) return null
  const schema = schemaInput === undefined ? undefined : effective(root, schemaInput)
  if (Array.isArray(value)) {
    const items = schema?.items
    const kept: JsonValue[] = []
    for (const item of value) {
      const before = check.unsupported.length
      const next = supportedValue(item, `${path}/${kept.length}`, root, items, locate, check)
      if (next !== undefined) kept.push(next)
      else check.unsupported.splice(before, check.unsupported.length - before, { path, value: item })
    }
    if (value.length === 0) check.unsupported.push({ path, value })
    return kept.length > 0 ? kept : undefined
  }
  if (typeof value === 'object') {
    const out: Record<string, JsonValue> = {}
    for (const [key, child] of Object.entries(value)) {
      const named = schema?.properties?.[key]
      if (named === undefined && locate(key) === null) {
        check.unsupported.push({ path: `${path}/${key}`, value: { [key]: child } })
        continue
      }
      const extra = schema?.additionalProperties
      const next = supportedValue(child, `${path}/${key}`, root, named ?? (typeof extra === 'object' ? extra : undefined), locate, check)
      if (next !== undefined) out[key] = next
    }
    if (Object.keys(value).length === 0) check.unsupported.push({ path, value })
    return Object.keys(out).length > 0 ? out : undefined
  }
  const location = locate(value)
  if (location === null) {
    check.unsupported.push({ path, value })
    return undefined
  }
  check.evidence.push({ path, source: 'model', ...location })
  return value
}

/** A locator that takes every value: the answer as the model wrote it, for the schema check. */
const TAKE_ALL: ReturnType<typeof modelLocator> = value => ({ evidencePath: '', text: String(value) })

/**
 * The model's answer merged into the data read from the page, key by key at
 * every level. A value at a kept path stays as it was read, whatever the
 * model says; the rest of the answer is taken where the page states it
 * (supportedValue), and a value the page does not state leaves the field out,
 * also a nullable one the page had no value for.
 */
function mergeModel(base: JsonValue | undefined, patch: JsonValue | undefined, path: string, kept: ReadonlySet<string>, root: JsonSchema, schemaInput: JsonSchema | undefined, locate: ReturnType<typeof modelLocator>, check: ModelCheck): JsonValue | undefined {
  if (patch === undefined || kept.has(path)) return base
  if (isPlainObject(base) && isPlainObject(patch)) {
    const schema = schemaInput === undefined ? undefined : effective(root, schemaInput)
    const out: Record<string, JsonValue> = { ...base }
    for (const [key, value] of Object.entries(patch)) {
      const extra = schema?.additionalProperties
      const child = schema?.properties?.[key] ?? (typeof extra === 'object' ? extra : undefined)
      const next = mergeModel(base[key], value, `${path}/${key}`, kept, root, child, locate, check)
      if (next !== undefined) out[key] = next
      else delete out[key]
    }
    return out
  }
  if (isPlainObject(base) && [...kept].some(item => item.startsWith(`${path}/`))) return base
  return supportedValue(patch, path, root, schemaInput, locate, check)
}

export async function extractStructured(
  result: FetchResult,
  format?: JsonFormatRequest,
  execution: ExecutionContext = {},
  modelConfig: StructuredModelConfig | null = structuredModelConfigFromEnv(),
  selectedList?: ListFormatRequest,
): Promise<StructuredExtractionResult> {
  if (selectedList?.itemSelector !== undefined) return selectedListJson(result, selectedList, format)
  if (format === undefined) return canonicalStructured(result)
  const schemaSha256 = sha256Utf8(JSON.stringify(format.schema))
  const pageIssue = unsuccessfulPage(result)
  if (pageIssue !== null) return { status: 'incomplete', data: null, schemaSha256, evidence: [], issues: [pageIssue], modelUsage: null }
  const partial = [...partialPage(result), ...subjectIssues(result)]
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
    issues.push({ code: 'model_unavailable', message: 'model fallback requested but Octocrawl extraction model is not configured' }, ...missingIssues)
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
  const locate = modelLocator(result)
  let attempts = 0
  let inputTokens = 0
  let outputTokens = 0
  let tokensKnown = true
  // Only Claude calls are priced (claudeCostUsd): an OpenAI-compatible endpoint's price is unknown, also for a call that failed.
  let costUsd: number | null = modelConfig.provider === 'anthropic' ? 0 : null
  let repair: string | null = null
  const count = (usage: Omit<ModelAnswer, 'value'>): void => {
    if (usage.inputTokens === null || usage.outputTokens === null) tokensKnown = false
    else {
      inputTokens += usage.inputTokens
      outputTokens += usage.outputTokens
    }
    costUsd = costUsd === null || usage.costUsd === null ? null : costUsd + usage.costUsd
  }
  const modelUsage = (): StructuredModelUsage => ({
    model: modelConfig.model,
    attempts,
    inputTokens: tokensKnown ? inputTokens : null,
    outputTokens: tokensKnown ? outputTokens : null,
    externalCostUsd: costUsd,
    strict: request.strict,
    ...(request.reason === undefined ? {} : { strictReason: request.reason }),
  })
  while (attempts < 2) {
    attempts++
    try {
      const model = await callModel(result, format, request, deterministic, execution, modelConfig, repair)
      count(model)
      const answer = withoutDisallowedNulls(format.schema, format.schema, model.value)
      // Schema-valid and supported by the page are two states: the answer is
      // first checked against the schema as written, then each value the
      // model wrote is kept only where the page states it.
      if (validate(mergeModel(base, answer, '', kept, format.schema, format.schema, TAKE_ALL, { evidence: [], unsupported: [] }) ?? null)) {
        const check: ModelCheck = { evidence: [], unsupported: [] }
        const merged = mergeModel(base, answer, '', kept, format.schema, format.schema, locate, check) ?? null
        const unsupported = check.unsupported.map(({ path, value }) => ({
          code: 'model_unsupported' as const,
          path,
          message: `the model answered ${JSON.stringify(value)}, which the page does not state; it is left out`,
        }))
        const stillMissing = requiredMissing(format.schema, format.schema, merged)
        const valid = validate(merged)
        const failedChecks = valid ? [] : (validate.errors ?? []).filter(error => error.keyword !== 'required')
        const issues = [
          ...readIssues,
          ...unsupported,
          ...stillMissing.map(path => ({ code: 'missing_required' as const, path, message: `required field unavailable: ${path}` })),
          ...(failedChecks.length > 0 ? [{ code: 'field_unavailable' as const, message: validationMessage(failedChecks) }] : []),
          ...unavailable(merged),
        ]
        return {
          status: valid && unsupported.length === 0 ? 'complete' : 'incomplete',
          data: merged,
          schemaSha256,
          evidence: [...baseEvidence, ...check.evidence],
          issues,
          modelUsage: modelUsage(),
        }
      }
      repair = validationMessage(validate.errors)
      if (attempts === 2) {
        return { status: 'invalid', data, schemaSha256, evidence, issues: [...readIssues, { code: 'model_output_invalid', message: repair }, ...missingIssues], modelUsage: modelUsage() }
      }
    } catch (error) {
      if (error instanceof ModelNoAnswer) count(error.usage)
      // A Claude call that failed may still have been billed, for one cut off by the deadline: its tokens and price are unknown, not 0.
      else if (modelConfig.provider === 'anthropic') count({ inputTokens: null, outputTokens: null, costUsd: null })
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

/** minTables counts Markdown tables too; neither it nor a Markdown field check validates an omitted format. */
function checksMarkdown(req: Pick<ScrapeRequest, 'verify'>): boolean {
  return req.verify?.checks.some(check => check.type === 'markdownIncludes' || check.type === 'markdownMatches' ||
    check.type === 'markdownCountMin' || check.type === 'minTables' || check.type === 'field' && check.path === 'markdown') === true
}

/** Require the formats each check actually reads; do not verify data the response discards. */
export function checkVerificationFormats(req: Pick<ScrapeRequest, 'formats' | 'verify'>): void {
  for (const check of req.verify?.checks ?? []) {
    const path = check.type === 'field' ? check.path : check.type === 'listRecordsMin' ? check.path : undefined
    if (path !== undefined && /^(verification|readiness|evidenceRecord)(?:\.|$)/.test(path)) {
      throw new RequestError('verify cannot check verification, readiness or evidenceRecord: these fields are produced from the verification result; check source data instead')
    }
  }
  if (req.verify?.checks.some(check => check.type === 'tableRowsMin') && (req.formats === undefined || !hasFormat(req.formats, 'tables'))) {
    throw new RequestError('formats must include tables when verify uses tableRowsMin; include tables or remove that check')
  }
  if (req.formats !== undefined && checksMarkdown(req) && !hasFormat(req.formats, 'markdown')) {
    throw new RequestError('formats must include markdown when verify checks Markdown (minTables also checks Markdown tables); include markdown or remove those checks')
  }
}

function requestedFormats(req: ScrapeRequest, result?: ScrapeRun): readonly ScrapeFormat[] {
  if (req.formats !== undefined) return req.formats
  // MCP marks its compact request with debug=false. Keep REST/SDK legacy
  // defaults, while returning adapter JSON (including incomplete identity
  // failures) on the simple MCP path.
  if (req.debug === false) {
    const adapterJson = result?.document?.adapter.id !== undefined && result.document.adapter.id !== 'generic'
    if (adapterJson) return checksMarkdown(req) ? ['json', 'markdown'] : ['json']
    return ['markdown']
  }
  return ['markdown', 'links']
}

/** Whether the formats ask for one by name: a string entry, or an object entry of that `type` (a json schema request counts as `json`, a screenshot entry as `screenshot`). */
export function hasFormat(formats: readonly ScrapeFormat[], name: 'markdown' | 'links' | 'json' | 'html' | 'rawHtml' | 'images' | 'tables' | 'attributes' | 'screenshot' | 'list'): boolean {
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

/** The list request, when the formats carry one. */
export function listFormat(formats: readonly ScrapeFormat[]): ListFormatRequest | undefined {
  return formats.find((format): format is ListFormatRequest => typeof format === 'object' && format.type === 'list')
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
      const { html: _html, rawHtml: _rawHtml, images: _images, tables: _tables, pages: _pages, attributes: _attributes, screenshot, actions: _actions, list: _list, listColumns: _listColumns, ...rest } = result
      // What the actions produced travels once too, on the response.
      const { actions: _kept, list: _records, listColumns: _columns, ...whole } = result
      return {
        ...attempt,
        result: { ...(debug ? whole : { ...rest, markdown: null, links: [] }), ...(screenshot === undefined ? {} : { screenshot: null }) },
      }
    }),
  }
}

/**
 * The run as the API answers it: the formats the request asked for, JSON
 * extraction, the `scrapeId` and `metadata` of the call, the snapshot, the
 * Evidence Record and the timings; compact unless `debug` is true. The id is
 * minted here when the caller (the engine, which writes the scrape record
 * under it) gives none. `fetched` is the engine's decision: false projects
 * this call's zero fetch usage before verification while retaining the source capture.
 */
export async function prepareScrapeResponse(
  result: ScrapeRun,
  req: ScrapeRequest,
  execution: ExecutionContext,
  modelConfig: StructuredModelConfig | null,
  overallStart: number,
  scrapeId: string = crypto.randomUUID(),
  fetched = true,
): Promise<ScrapeResponse | CompactScrapeResponse> {
  checkVerificationFormats(req)
  const formats = requestedFormats(req, result)
  const modelStart = performance.now()
  const json = hasFormat(formats, 'json')
    ? await extractStructured(extractionInput(result), customJsonFormat(formats), execution, modelConfig ?? structuredModelConfigFromEnv(), listFormat(formats))
    : undefined
  const modelMs = json?.modelUsage ? Math.max(0, performance.now() - modelStart) : 0
  const serializeStart = performance.now()
  const includeLinks = req.includeLinks === true || hasFormat(formats, 'links')
  const warning = warningOf(result.warnings)
  // What JSON read from the selected rows' columns is not a format of its own.
  const { listColumns: _listColumns, ...run } = result
  const next: ScrapeRun = {
    ...run,
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
    readiness: readinessOf(result),
    usage: {
      ...next.usage,
      wallMs: totalMs,
      ...(next.usage.timings ? { timings: { ...next.usage.timings, serializeMs, modelMs, totalMs } } : {}),
    },
    summary: { ...next.summary, totalMs },
  }
  // Judge the exact data projection delivered, including the compact document and requested formats.
  // Otherwise a price/entity discarded below could still make a task pass (ADR 0006).
  // Cache reuse has no new fetch usage. Project it before judging; keep the original capture for its evidence.
  const responseData = fetched ? withTiming : withoutFetchUsage(withTiming)
  const delivered = req.debug === false ? compactScrapeData(responseData, req, formats, totalMs) : responseData
  return verifyScrapeResponse(delivered, req, result)
}

/** Rejudge an already shaped response after a delivery diagnostic, without repeating extraction or fetch usage. */
export function verifyScrapeResponse(
  delivered: ScrapeResponse | Omit<CompactScrapeResponse, 'evidenceRecord'>,
  req: ScrapeRequest,
  result: FetchResult,
): ScrapeResponse | CompactScrapeResponse {
  // Verdict-derived fields are not source data, including verdicts carried by an earlier ladder/cache view.
  const { verification: _previousVerification, readiness: _previousReadiness, evidenceRecord: _previousEvidence, ...sourceData } = { ...delivered, evidenceRecord: undefined }
  const verification = verify(req.verify, sourceData)
  return {
    ...delivered,
    verification,
    readiness: readinessOf({ ...result, verification }),
    evidenceRecord: scrapeEvidenceRecord({ ...result, verification }, req, { markdown: delivered.markdown ?? null, ...(delivered.json === undefined ? {} : { json: delivered.json }) }),
  }
}

/** A cache answer's usage describes this call; its capture and Evidence Record still describe the original fetch. */
function withoutFetchUsage(response: ScrapeResponse): ScrapeResponse {
  const { timings, ...usage } = response.usage
  const own = timings === undefined ? undefined : {
    ...(timings.serializeMs === undefined ? {} : { serializeMs: timings.serializeMs }),
    ...(timings.modelMs === undefined ? {} : { modelMs: timings.modelMs }),
    totalMs: timings.totalMs,
  }
  return { ...response, usage: { ...usage, bytesWire: 0, bytesDecompressed: 0, requestCount: 0, attemptCount: 0, browserMs: 0, externalCostUsd: 0, ...(own === undefined ? {} : { timings: own }) } }
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

const BROWSER_LANES: ReadonlySet<Lane> = new Set<Lane>(['browser_local', 'browser_local_authed', 'browser_proxy', 'my_browser'])

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

/** The time zone the browser lane declared (its fingerprint's, for the identity it declared); null elsewhere, where none goes on the wire, and for a page read in the person's own browser, whose time zone W2L does not know. */
function timezoneOf(result: Pick<FetchResult, 'lane' | 'trace'>): string | null {
  if (!BROWSER_LANES.has(result.lane)) return null
  if (result.trace.some((event) => event.event === 'identity_sent' && event.detail?.by === 'user_browser')) return null
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

function compactScrapeData(
  next: ScrapeResponse,
  req: ScrapeRequest,
  formats: readonly ScrapeFormat[] = requestedFormats(req, next),
  totalMs = next.summary.totalMs ?? next.usage.wallMs,
): Omit<CompactScrapeResponse, 'evidenceRecord'> {
  const includeLinks = req.includeLinks === true || hasFormat(formats, 'links')
  return {
    requestedUrl: next.requestedUrl,
    finalUrl: next.evidence.finalUrl,
    snapshot: scrapeSnapshot(next),
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
      ...(hasFormat(formats, 'list') ? ['list' as const] : []),
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
    // Asked for, and the page was read: its records.
    ...(hasFormat(formats, 'list') && next.list !== undefined ? { list: next.list } : {}),
    // Asked for: the capture, or null when the browser lane rendered no page or could not capture it.
    ...(hasFormat(formats, 'screenshot') ? { screenshot: next.screenshot ?? null } : {}),
    // What the request's actions produced, and the step that failed if one did.
    ...(next.actions === undefined ? {} : { actions: next.actions }),
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
    verification: next.verification ?? { status: 'not_requested' },
    ...(next.file === undefined ? {} : { file: next.file }),
    ...(next.warnings === undefined ? {} : { warnings: next.warnings }),
    ...(warningOf(next.warnings) === undefined ? {} : { warning: warningOf(next.warnings) }),
    readiness: next.readiness,
    ...(next.agentHints === undefined ? {} : { agentHints: next.agentHints }),
    ...(next.handoff === undefined || next.handoff === null ? {} : { handoff: next.handoff }),
    truncated: next.truncated,
    truncatedAt: next.truncatedAt,
    usage: { ...next.usage, totalMs },
    channelsTried: next.channelsTried,
  }
}

export function compactScrapeResponse(
  next: ScrapeResponse,
  req: ScrapeRequest,
  formats: readonly ScrapeFormat[] = requestedFormats(req, next),
  totalMs = next.summary.totalMs ?? next.usage.wallMs,
): CompactScrapeResponse {
  return {
    ...compactScrapeData(next, req, formats, totalMs),
    evidenceRecord: next.evidenceRecord ?? scrapeEvidenceRecord(next, req, {
      markdown: hasFormat(formats, 'markdown') ? next.markdown : null,
      ...(hasFormat(formats, 'json') && next.json !== undefined ? { json: next.json } : {}),
    }),
  }
}
