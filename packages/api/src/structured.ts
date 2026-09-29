import Ajv from 'ajv'
import type { ErrorObject, ValidateFunction } from 'ajv'
import type {
  CompactScrapeResponse,
  ExecutionContext,
  FetchResult,
  JsonFormatRequest,
  JsonSchema,
  JsonValue,
  LabelledValue,
  ProductFact,
  ProductFacts,
  ScrapeFormat,
  ScrapeRequest,
  ScrapeResponse,
  StructuredExtractionIssue,
  StructuredExtractionResult,
  StructuredFieldEvidence,
  StructuredModelUsage,
} from '@w2l/contracts'
import { sha256Utf8 } from '@w2l/http-core'
import { CONTENTFUL_STATUS, defaultApiMode } from '@w2l/contracts'
import { toEvidenceRecord } from '@w2l/runtime'

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
  fact?: ProductFact
}

function numeric(value: string, integer = false): number | string {
  const parsed = Number(value.replace(integer ? /[^0-9-]/g : /[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? (integer ? Math.trunc(parsed) : parsed) : value
}

/** A key or page label reduced to its letters and digits: "Number of reviews" matches numberOfReviews. */
function labelKey(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

/** The same without bracketed qualifiers: "Price (excl. tax)" matches price. */
function baseLabelKey(text: string): string {
  return labelKey(text.replace(/\([^)]*\)|\[[^\]]*\]/g, ' '))
}

const CURRENCY = '(?:[$£€¥₹₽₩฿]|USD|EUR|GBP|JPY|CNY|RMB|AUD|CAD|CHF|HKD|SGD|INR|KRW|BRL|MXN|SEK|NOK|DKK|PLN|TRY|ZAR)'
/** Sign, currency, sign, whole part (thousands in groups of three), decimals, currency. */
const AMOUNT_RE = new RegExp(`^([-−]?)(?:${CURRENCY}\\s?)?([-−]?)(\\d{1,3}(?:,\\d{3})+|\\d+)(\\.\\d+)?(?:\\s?${CURRENCY})?$`, 'u')

/**
 * Label text as the schema type, or undefined when it is not cleanly that
 * type. A number is one amount, with a currency or thousands separators at
 * most: "In stock (22 available)", "4.7 out of 5" and "18,50" are not.
 */
function labelValue(text: string, schema: JsonSchema): JsonValue | undefined {
  const types = schemaTypes(schema)
  if (types.length === 0 || types.includes('string')) return text
  if (types.includes('number') || types.includes('integer')) {
    const m = AMOUNT_RE.exec(text.trim())
    if (m === null || (m[1] !== '' && m[2] !== '')) return undefined
    const value = Number(`${m[1] || m[2] ? '-' : ''}${m[3]!.replace(/,/g, '')}${m[4] ?? ''}`)
    return types.includes('number') || Number.isInteger(value) ? value : undefined
  }
  if (types.includes('boolean')) return /^(true|yes)$/i.test(text) ? true : /^(false|no)$/i.test(text) ? false : undefined
  return undefined
}

/**
 * Candidates from the page's own labels, for top-level keys no subject fact
 * covers. A label equal to the key wins over one that only matches without
 * its bracketed qualifier. When the matching labels state different values,
 * or one of them is not of the key's type, nothing is chosen: the field stays
 * absent and an issue names the labels.
 */
function addLabelCandidates(
  map: Map<string, Candidate>,
  root: JsonSchema,
  labels: readonly LabelledValue[],
  issues: StructuredExtractionIssue[],
): void {
  for (const [name, child] of Object.entries(resolveRef(root, root).properties ?? {})) {
    const key = labelKey(name)
    if (key.length === 0 || map.has(name.toLowerCase())) continue
    const exact = labels.filter(item => labelKey(item.label) === key)
    const matched = exact.length > 0 ? exact : labels.filter(item => baseLabelKey(item.label) === key)
    if (matched.length === 0) continue
    const values = matched.map(item => labelValue(item.value, resolveRef(root, child)))
    if (values.every(value => value === undefined)) continue
    if (values.some(value => value === undefined || JSON.stringify(value) !== JSON.stringify(values[0]))) {
      issues.push({
        code: 'field_ambiguous',
        path: `/${name}`,
        message: `page labels state different values for /${name}: ${matched.map(item => `${JSON.stringify(item.label)} = ${JSON.stringify(item.value)} (${item.path})`).join(', ')}`,
      })
      continue
    }
    const first = matched[0]!
    map.set(name.toLowerCase(), { value: values[0]!, fact: { value: first.value, source: 'dom', path: `${first.path} ${JSON.stringify(first.label)}` } })
  }
}

function candidates(result: FetchResult, schema?: JsonSchema, issues: StructuredExtractionIssue[] = []): Map<string, Candidate> {
  const map = new Map<string, Candidate>()
  const product = result.document?.product ?? null
  const put = (keys: readonly string[], fact: ProductFact | null | undefined, value?: JsonValue): void => {
    if (fact === null || fact === undefined) return
    for (const key of keys) map.set(key.toLowerCase(), { value: value ?? fact.value, fact })
  }
  map.set('url', { value: result.evidence.finalUrl })
  map.set('requesturl', { value: result.requestedUrl })
  map.set('finalurl', { value: result.evidence.finalUrl })
  if (result.document?.title) {
    map.set('title', { value: result.document.title })
    map.set('pagetitle', { value: result.document.title })
  }
  if (result.document?.pageType) map.set('pagetype', { value: result.document.pageType })
  if (product !== null) addProductCandidates(map, product, put)
  if (schema !== undefined) addLabelCandidates(map, schema, result.document?.labelledValues ?? [], issues)
  return map
}

function addProductCandidates(
  map: Map<string, Candidate>,
  product: ProductFacts,
  put: (keys: readonly string[], fact: ProductFact | null | undefined, value?: JsonValue) => void,
): void {
  put(['asin', 'id', 'productid', 'subjectid', 'sku'], product.subjectId ?? product.sku)
  put(['title', 'name', 'productname'], product.name)
  put(['brand'], product.brand)
  put(['price', 'amount', 'currentprice'], product.price, product.price ? numeric(product.price.value) : undefined)
  put(['currency', 'pricecurrency'], product.priceCurrency)
  put(['seller', 'merchant'], product.seller)
  put(['availability', 'stock'], product.availability)
  put(['deliverylocation', 'deliveryregion', 'region'], product.deliveryLocation)
  put(['rating'], product.rating, product.rating ? numeric(product.rating.value) : undefined)
  put(['reviewcount', 'reviews'], product.reviewCount, product.reviewCount ? numeric(product.reviewCount.value, true) : undefined)
  map.set('kind', { value: product.kind ?? 'unknown' })
  // A list is a source only when the extractor read it from the page. The
  // Amazon adapter reports what it observed on the verified subject, possibly
  // an empty list; a generic product page has no such list, and an invented []
  // or {} would claim the page has none.
  const { images, prices, variants, specifications } = product
  if (images !== undefined) map.set('images', { value: images.map(item => item.value), fact: images[0] })
  if (prices !== undefined) {
    map.set('prices', {
      value: prices.map(item => ({
        amount: numeric(item.amount.value),
        currency: item.currency?.value ?? null,
        priceType: item.priceType,
        seller: item.seller?.value ?? null,
      })),
      fact: prices[0]?.amount,
    })
  }
  if (variants !== undefined) {
    map.set('variants', {
      value: variants.map(item => ({
        name: item.name,
        value: item.value,
        selected: item.selected,
      })),
      fact: variants[0] === undefined ? undefined : {
        value: variants[0].value,
        source: variants[0].source,
        path: variants[0].path,
      },
    })
  }
  if (specifications !== undefined) {
    map.set('specifications', {
      value: Object.fromEntries(Object.entries(specifications).map(([key, fact]) => [key, fact.value])),
      fact: Object.values(specifications)[0],
    })
  }
}

function schemaTypes(schema: JsonSchema): readonly string[] {
  if (schema.type === undefined) return []
  return typeof schema.type === 'string' ? [schema.type] : schema.type
}

function resolveRef(root: JsonSchema, schema: JsonSchema): JsonSchema {
  if (!schema.$ref) return schema
  const parts = schema.$ref.slice(2).split('/').map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'))
  let value: unknown = root
  for (const part of parts) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return schema
    value = (value as Record<string, unknown>)[part]
  }
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonSchema : schema
}

function coerce(value: JsonValue, schema: JsonSchema): JsonValue | undefined {
  const types = schemaTypes(schema)
  if (value === null) return types.length === 0 || types.includes('null') ? null : undefined
  if ((types.includes('number') || types.includes('integer')) && typeof value === 'string') {
    const parsed = numeric(value, types.includes('integer'))
    return typeof parsed === 'number' ? parsed : undefined
  }
  if (types.includes('string') && typeof value !== 'string') return String(value)
  if (types.includes('boolean') && typeof value === 'string') {
    if (value === 'true') return true
    if (value === 'false') return false
  }
  return value
}

function mapSchema(
  root: JsonSchema,
  schemaInput: JsonSchema,
  source: Map<string, Candidate>,
  path: string,
  evidence: StructuredFieldEvidence[],
  key: string | null = null,
): JsonValue | undefined {
  const schema = resolveRef(root, schemaInput)
  const direct = key === null ? undefined : source.get(key.toLowerCase())
  if (direct !== undefined) {
    const value = coerce(direct.value, schema)
    if (value !== undefined) {
      if (direct.fact !== undefined) {
        evidence.push({
          path,
          source: direct.fact.source,
          ...(direct.fact.path === undefined ? {} : { evidencePath: direct.fact.path }),
        })
      }
      return value
    }
  }
  if (schemaTypes(schema).includes('object') || schema.properties !== undefined) {
    const out: Record<string, JsonValue> = {}
    for (const [name, child] of Object.entries(schema.properties ?? {})) {
      // Candidates describe the page and its subject, so only a top-level
      // property can match one: /author/title is not the page title.
      const mapped = mapSchema(root, child, source, `${path}/${name}`, evidence, path === '' ? name : null)
      if (mapped !== undefined) out[name] = mapped
    }
    // A nested object exists only when something inside it had a source.
    return path === '' || Object.keys(out).length > 0 ? out : undefined
  }
  return undefined
}

function fillNullableMissing(root: JsonSchema, schemaInput: JsonSchema, value: JsonValue | undefined): JsonValue | undefined {
  const schema = resolveRef(root, schemaInput)
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
  const schema = resolveRef(root, schemaInput)
  if (schema.properties !== undefined && value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const data = value as Record<string, JsonValue>
    return Object.entries(schema.properties).flatMap(([name, child]) => nullableMissingIssues(root, child, data[name], `${path}/${name}`))
  }
  return value === null && schemaTypes(schema).includes('null')
    ? [{code:'field_unavailable',path,message:'no verified source for this nullable field on the selected page'}]
    : []
}

function requiredMissing(root: JsonSchema, schemaInput: JsonSchema, value: JsonValue | undefined, path = ''): string[] {
  const schema = resolveRef(root, schemaInput)
  const missing: string[] = []
  if (schema.required !== undefined) {
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

function compile(schema: JsonSchema): ValidateFunction {
  const AjvConstructor = Ajv as unknown as new (options: { allErrors: boolean; strict: boolean }) => { compile(schema: object): ValidateFunction }
  const ajv = new AjvConstructor({ allErrors: true, strict: false })
  return ajv.compile(schema as object)
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

async function callModel(
  result: FetchResult,
  format: JsonFormatRequest,
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
        json_schema: { name: 'w2l_extract', strict: true, schema: format.schema },
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

function mergeObjects(base: JsonValue, patch: JsonValue): JsonValue {
  if (base !== null && patch !== null && typeof base === 'object' && typeof patch === 'object' && !Array.isArray(base) && !Array.isArray(patch)) {
    return { ...base, ...patch }
  }
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
  // Fields whose page labels disagree: reported with every result that carries data.
  const labelIssues: StructuredExtractionIssue[] = []
  let data = fillNullableMissing(format.schema, format.schema, mapSchema(format.schema, format.schema, candidates(result, format.schema, labelIssues), '', evidence)) ?? null
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
  let missing = requiredMissing(format.schema, format.schema, data)
  const deterministicValid = validate(data)
  if (missing.length === 0 && deterministicValid) {
    const unavailable = nullableMissingIssues(format.schema, format.schema, data).filter(issue => !labelIssues.some(label => label.path === issue.path))
    return { status: partial.length > 0 ? 'incomplete' : 'complete', data, schemaSha256, evidence, issues: [...partial, ...labelIssues, ...unavailable], modelUsage: null }
  }
  const issues: StructuredExtractionIssue[] = [...partial, ...labelIssues]
  if (format.modelFallback !== true || partial.length > 0) {
    for (const path of missing) issues.push({ code: 'missing_required', path, message: `required field unavailable: ${path}` })
    if (!deterministicValid && missing.length === 0) issues.push({ code: 'field_unavailable', message: validationMessage(validate.errors) })
    return { status: 'incomplete', data, schemaSha256, evidence, issues, modelUsage: null }
  }
  if (modelConfig === null) {
    issues.push({ code: 'model_unavailable', message: 'model fallback requested but W2L extraction model is not configured' })
    for (const path of missing) issues.push({ code: 'missing_required', path, message: `required field unavailable: ${path}` })
    return { status: 'incomplete', data, schemaSha256, evidence, issues, modelUsage: null }
  }
  let attempts = 0
  let inputTokens = 0
  let outputTokens = 0
  let tokensKnown = true
  let repair: string | null = null
  while (attempts < 2) {
    attempts++
    try {
      const model = await callModel(result, format, data, execution, modelConfig, repair)
      if (model.inputTokens === null || model.outputTokens === null) tokensKnown = false
      else {
        inputTokens += model.inputTokens
        outputTokens += model.outputTokens
      }
      const merged = mergeObjects(data, model.value)
      if (validate(merged)) {
        data = merged
        const deterministicPaths = new Set(evidence.map(item => item.path))
        if (model.value !== null && typeof model.value === 'object' && !Array.isArray(model.value)) {
          for (const key of Object.keys(model.value)) {
            const path = `/${key}`
            if (!deterministicPaths.has(path)) evidence.push({ path, source: 'model' })
          }
        }
        const modelUsage: StructuredModelUsage = { model: modelConfig.model, attempts, inputTokens: tokensKnown ? inputTokens : null, outputTokens: tokensKnown ? outputTokens : null, externalCostUsd: null }
        return { status: 'complete', data, schemaSha256, evidence, issues: labelIssues, modelUsage }
      }
      repair = validationMessage(validate.errors)
      if (attempts === 2) {
        const modelUsage: StructuredModelUsage = { model: modelConfig.model, attempts, inputTokens: tokensKnown ? inputTokens : null, outputTokens: tokensKnown ? outputTokens : null, externalCostUsd: null }
        return { status: 'invalid', data, schemaSha256, evidence, issues: [...labelIssues, { code: 'model_output_invalid', message: repair }], modelUsage }
      }
    } catch (error) {
      const aborted = execution.signal?.aborted === true || (error instanceof DOMException && error.name === 'AbortError') || (error instanceof Error && error.name === 'TimeoutError')
      const modelUsage: StructuredModelUsage = { model: modelConfig.model, attempts, inputTokens: tokensKnown ? inputTokens : null, outputTokens: tokensKnown ? outputTokens : null, externalCostUsd: null }
      return {
        status: 'incomplete',
        data,
        schemaSha256,
        evidence,
        issues: [...labelIssues, { code: aborted ? 'model_timeout' : 'model_provider_error', message: aborted ? 'model extraction was cancelled or exceeded the deadline' : error instanceof Error ? error.message : 'model provider failed' }],
        modelUsage,
      }
    }
  }
  missing = requiredMissing(format.schema, format.schema, data)
  return {
    status: 'incomplete',
    data,
    schemaSha256,
    evidence,
    issues: [...labelIssues, ...missing.map(path => ({ code: 'missing_required' as const, path, message: `required field unavailable: ${path}` }))],
    modelUsage: null,
  }
}

function requestedFormats(req: ScrapeRequest, result?: ScrapeResponse): readonly ScrapeFormat[] {
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

function hasFormat(formats: readonly ScrapeFormat[], name: 'markdown' | 'links' | 'json'): boolean {
  return formats.some(format => typeof format === 'string' ? format === name : name === 'json')
}

function customJsonFormat(formats: readonly ScrapeFormat[]): JsonFormatRequest | undefined {
  return formats.find((format): format is JsonFormatRequest => typeof format === 'object')
}

function withoutRepeatedBodies(summary: ScrapeResponse['summary']): ScrapeResponse['summary'] {
  return {
    ...summary,
    attempts: summary.attempts.map(attempt => ({
      ...attempt,
      result: { ...attempt.result, markdown: null, links: [] },
    })),
  }
}

export async function prepareScrapeResponse(
  result: ScrapeResponse,
  req: ScrapeRequest,
  execution: ExecutionContext,
  modelConfig: StructuredModelConfig | null,
  overallStart: number,
): Promise<ScrapeResponse | CompactScrapeResponse> {
  const formats = requestedFormats(req, result)
  const modelStart = performance.now()
  const json = hasFormat(formats, 'json')
    ? await extractStructured(extractionInput(result), customJsonFormat(formats), execution, modelConfig ?? structuredModelConfigFromEnv())
    : undefined
  const modelMs = json?.modelUsage ? Math.max(0, performance.now() - modelStart) : 0
  const serializeStart = performance.now()
  const includeLinks = req.includeLinks === true || hasFormat(formats, 'links')
  const next: ScrapeResponse = {
    ...result,
    markdown: hasFormat(formats, 'markdown') ? result.markdown : null,
    links: includeLinks ? result.links ?? [] : [],
    ...(json === undefined ? {} : { json }),
    summary: req.debug === true ? result.summary : withoutRepeatedBodies(result.summary),
  }
  const serializeMs = Math.max(0, performance.now() - serializeStart)
  const totalMs = Math.max(0, performance.now() - overallStart)
  const withTiming: ScrapeResponse = {
    ...next,
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

/**
 * The capture identity of whatever response was received, success or not,
 * in both the full and the compact response shape.
 */
function scrapeSnapshot(result: FetchResult): CompactScrapeResponse['snapshot'] {
  return {
    rawBodySha256: result.evidence.rawBodySha256,
    artifacts: result.evidence.artifacts,
    httpStatus: result.evidence.httpStatus,
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
      ...(includeLinks ? ['links' as const] : []),
      ...(hasFormat(formats, 'json') ? ['json' as const] : []),
    ],
    ...(hasFormat(formats, 'markdown') ? { markdown: next.markdown } : {}),
    ...(includeLinks ? { links: next.links ?? [] } : {}),
    ...(next.document === undefined ? {} : { document: next.document === null ? null : {
      title: next.document.title,
      pageType: next.document.pageType,
      strategy: next.document.strategy,
      confidence: next.document.confidence,
      adapter: next.document.adapter,
      ...(next.document.adapterValidation === undefined ? {} : { adapterValidation: next.document.adapterValidation }),
    } }),
    ...(next.metadata === undefined ? {} : { metadata: next.metadata }),
    ...(hasFormat(formats, 'json') && next.json !== undefined ? { json: next.json } : {}),
    truncated: next.truncated,
    truncatedAt: next.truncatedAt,
    usage: { ...next.usage, totalMs },
    channelsTried: next.channelsTried,
  }
}
