import { buildChannels, isLocalPreviewProxyTarget, LadderRunner, OriginScheduler } from '@w2l/bench'
import { hostedNetworkPolicy, type FetchResult, type JsonValue, type NetworkPolicy, type PageMetadata, type StructuredExtractionResult, type TraceEvent } from '@w2l/contracts'
import { createExecutionScope } from '@w2l/http-core'
import { extractStructured } from '@w2l/api/structured'
import { parseHTML } from 'linkedom'
import { AMAZON_PRODUCT_SCHEMA } from './productSchema.js'
import { resolvePreviewCapability, type PreviewCapability } from './capability.js'
import { fieldsSchema, type PreviewOptions } from './options.js'

export type PreviewStatus = 'success' | 'incomplete' | 'blocked' | 'failed' | 'timeout' | 'quota_exceeded' | 'invalid_url'

export type PreviewDiagnosticCode = 'subject_mismatch' | 'subject_conflicting' | 'subject_unverified' | 'quote_unverified' | 'quote_absent_observed' | 'quote_conflicting' | 'region_unverified' | 'currency_unverified'
  | 'robots_disallowed' | 'robots_unreachable' | 'login_required' | 'challenge' | 'policy_denied' | 'timeout' | 'quota_exceeded'
  | 'service_unavailable' | 'content_unverified' | 'capture_failed' | 'invalid_url' | 'invalid_options'
export interface PreviewDiagnostic {
  code: PreviewDiagnosticCode
  stage: 'input' | 'policy' | 'acquisition' | 'subject' | 'field' | 'quota' | 'service'
  /** Observed means this request contains direct evidence of the specific condition. */
  evidence: 'observed' | 'unobserved'
}

export interface PreviewProduct {
  status: StructuredExtractionResult['status']
  asin: string | null
  region: string | null
  currency: string | null
  data: Record<string, unknown> | null
  issues: { code: string; message: string }[]
}

/** What a file response was (a PDF, CSV, JSON, text, XLSX, XLS or ZIP), without where it was saved. */
export interface PreviewFile {
  kind: string
  contentType: string | null
  /** Bytes received; null when the file was over the preview's cap and not read. */
  bytes: number | null
  declaredBytes: number | null
  maxBytes: number
  sha256: string | null
  markdownFrom: 'pdf_text' | 'text' | null
  pdf: { pageCount: number | null; pagesRead: number } | null
  warnings: { code: string; message: string }[]
}

/** The fields a visitor asked for, read deterministically from the page, with where each value came from. */
export interface PreviewFields {
  status: StructuredExtractionResult['status']
  data: JsonValue | null
  schemaSha256?: string
  evidence: { path: string; source: string; evidencePath?: string; text?: string }[]
  issues: { code: string; message: string; path?: string }[]
}

export interface PreviewResponse {
  status: PreviewStatus
  requestedUrl: string
  finalUrl: string | null
  title: string | null
  markdown: string | null
  /** Present and true when `markdown` was cut to MARKDOWN_CHARS. */
  markdownTruncated?: boolean
  /** Server-side total including acquisition and extraction. The UI measures round-trip time separately. */
  totalMs: number
  reason: string | null
  capability?: PreviewCapability
  diagnostic?: PreviewDiagnostic
  product?: PreviewProduct
  /**
   * An ordinary readable page's outbound http(s) links, deduplicated, at most PREVIEW_LINKS of them (`linksTotal`
   * counts them all), and what its HTML declares about itself. Never for Amazon, X or Reddit, whose public result
   * is the checked record, nor for a page that was not read.
   */
  links?: string[]
  linksTotal?: number
  metadata?: PageMetadata
  /** Present when the response was a file rather than a page. */
  file?: PreviewFile
  /** The fields asked for, when the page was read. */
  json?: PreviewFields
  /** Returned only to an operator holding W2L_EVAL_TOKEN; never to visitors. */
  evaluation?: {
    rawBodySha256: string | null
    /** Same-capture witness, only emitted for a validated owner evaluation token. */
    rawHtml?: string
    fieldEvidence: { path: string; source: string; evidencePath?: string }[]
    sourceCommit?: string
    amazonStateSha256?: string
    schemaSha256?: string
    usage?: { attemptCount: number; statusRetryCount: number; retryWaitMs: number; browserMs: number; externalCostUsd: number | null }
  }
}

export interface NormalizedPreviewUrl {
  url: string
  amazonAsin: string | null
}

const AMAZON_HOSTS = new Set(['amazon.sg', 'www.amazon.sg'])
const AMAZON_ASIN_PATH = /^\/dp\/([A-Z0-9]{10})\/?$/i

/** Normalize only supported public URL forms. Do not pass visitor options to the crawler. */
export function normalizePreviewUrl(input: unknown): NormalizedPreviewUrl {
  if (typeof input !== 'string' || input.length > 2048 || input.length === 0) throw new Error('Enter a public page URL with no more than 2,048 characters.')
  let parsed: URL
  try { parsed = new URL(input) } catch { throw new Error('Enter a valid HTTP or HTTPS page URL.') }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.port || !parsed.hostname) {
    throw new Error('Use a public HTTP or HTTPS URL without credentials or a custom port.')
  }
  parsed.hash = ''
  const asin = AMAZON_HOSTS.has(parsed.hostname) ? AMAZON_ASIN_PATH.exec(parsed.pathname)?.[1]?.toUpperCase() ?? null : null
  if (asin !== null) return { url: `https://www.amazon.sg/dp/${asin}`, amazonAsin: asin }
  return { url: parsed.href, amazonAsin: null }
}

export interface CaptureOutcome {
  result: FetchResult
  json?: StructuredExtractionResult
  /** The fields a visitor asked for, never with a model. */
  fields?: StructuredExtractionResult
  /** Selected subject read from the hash-matched rendered DOM, not the URL. */
  selectedAsin?: string | null
  /** Present only when the caller requested a privileged evaluation. */
  rawHtml?: string
}

/** The most readable Markdown a preview returns (characters). */
export const MARKDOWN_CHARS = 1_000_000
/** The most links a preview returns, the longest one kept (characters), and their combined length (characters). */
export const PREVIEW_LINKS = 500
const LINK_CHARS = 2048
const LINKS_TOTAL_CHARS = 256 * 1024
/** The longest metadata value a preview returns (characters). */
const METADATA_CHARS = 2048
/** The largest fields result a preview returns (characters of JSON). */
const FIELDS_CHARS = 64 * 1024
/** The largest file a preview reads: a public page may be a PDF, and the service has 2 GiB for one request. */
export const PREVIEW_FILE_BYTES = 5 * 1024 * 1024

/** The network policy of every preview capture: hosted SSRF rules, few redirects, small pages and files. */
export function previewNetworkPolicy(): NetworkPolicy {
  return { ...hostedNetworkPolicy(), maxRedirects: 3, maxBodyBytes: 2 * 1024 * 1024, maxDecompressedBytes: 4 * 1024 * 1024, maxFileBytes: PREVIEW_FILE_BYTES, perHostConcurrency: 1 }
}

/** A step of a running preview that the page shows as it happens: robots.txt was read (whether it allows the page,
 * and `unreachable` when it could not be read, which counts as a refusal), then the page's body was received and
 * parsed. `page` does not mean the page was read: a challenge page or an empty shell is still refused after it, and
 * only the result says. Only the HTTP lane reports them; any step may never come. */
export type PreviewStage = { stage: 'robots'; allowed: boolean; unreachable?: true } | { stage: 'page' }

export type PreviewCapture = (url: NormalizedPreviewUrl, signal: AbortSignal, deadlineAt: number, amazonState: string | null, ownerEvaluation?: boolean, onRetryAfter?: (url: string, retryAt: number) => void, localPlatformProxyUrl?: string, localPlatformRobotsException?: boolean, options?: PreviewOptions, onStage?: (stage: PreviewStage) => void) => Promise<CaptureOutcome>

/** The stages a lane's trace events announce, each told once. */
function stageListener(onStage: (stage: PreviewStage) => void): (event: TraceEvent) => void {
  const told = new Set<PreviewStage['stage']>()
  return (event) => {
    const stage = event.event === 'robots_checked' ? 'robots' : event.event === 'extract' ? 'page' : null
    if (stage === null || told.has(stage)) return
    told.add(stage)
    onStage(stage === 'page' ? { stage } : {
      stage, allowed: event.detail?.decision !== 'disallowed', ...(event.detail?.unreachable === undefined ? {} : { unreachable: true as const }),
    })
  }
}

export async function capturePreview(url: NormalizedPreviewUrl, signal: AbortSignal, deadlineAt: number, amazonState: string | null, ownerEvaluation = false, onRetryAfter?: (url: string, retryAt: number) => void, localPlatformProxyUrl?: string, localPlatformRobotsException = false, options: PreviewOptions = {}, onStage?: (stage: PreviewStage) => void): Promise<CaptureOutcome> {
  let rendered: { html: string; sha256: string } | undefined
  const policy = previewNetworkPolicy()
  const localPlatformRequest = url.amazonAsin === null && isLocalPreviewProxyTarget(url.url)
  const channels = buildChannels('standard', {
    networkPolicy: policy,
    originScheduler: new OriginScheduler(policy),
    publicPreferenceState: url.amazonAsin === null ? null : amazonState,
    browserAllowedHosts: url.amazonAsin === null ? undefined : ['www.amazon.sg', 'm.media-amazon.com', 'images-na.ssl-images-amazon.com', 'images-eu.ssl-images-amazon.com'],
    onRenderedHtml: url.amazonAsin !== null ? (html, sha256) => { rendered = { html, sha256 } } : undefined,
    localPreviewProxyUrl: localPlatformRequest ? localPlatformProxyUrl : undefined,
    localPreviewRobotsException: localPlatformRequest && localPlatformRobotsException,
    // Sites see the preview as OctoCrawl and can address it in robots.txt (User-agent: octocrawl-preview).
    previewProductToken: true,
    // No third-party provider calls, even if environment keys happen to exist.
    keys: {},
  }).filter(channel => channel.id === resolvePreviewCapability(url).captureMode)
  const scope = createExecutionScope({ signal, deadlineAt, onRetryAfter, ...(onStage === undefined ? {} : { onTrace: stageListener(onStage) }) })
  try {
    // A visitor's options apply to ordinary pages only; the server refuses them for Amazon.sg before any capture.
    const pageOptions = url.amazonAsin === null && options.onlyMainContent === false ? { onlyMainContent: false } : {}
    const run = await new LadderRunner(channels, { mode: 'standard' }).run(url.url, null, scope, pageOptions)
    const json = url.amazonAsin === null ? undefined : await extractStructured(run.result, { type: 'json', schema: AMAZON_PRODUCT_SCHEMA, modelFallback: false }, scope, null)
    // The fields come from the page already captured, and never from a model: no model configuration is passed.
    const schema = url.amazonAsin === null ? fieldsSchema(options) : undefined
    const fields = schema === undefined ? undefined : await extractStructured(run.result, { type: 'json', schema, modelFallback: false }, scope, null)
    const sameCaptureHtml = rendered !== undefined && rendered.sha256 === run.result.evidence.rawBodySha256 ? rendered.html : undefined
    let selectedAsin: string | null = null
    if (sameCaptureHtml !== undefined) {
      const identity = run.result.document?.product?.identity
      if (identity !== undefined) selectedAsin = identity.observedSelectedId || null
      else {
        const selected = parseHTML(sameCaptureHtml).document.querySelector('input[name="ASIN"], #ASIN')
        const value = selected?.getAttribute('value') ?? selected?.textContent
        selectedAsin = typeof value === 'string' && /^[A-Z0-9]{10}$/i.test(value.trim()) ? value.trim().toUpperCase() : null
      }
    }
    return {
      result: run.result,
      ...(json === undefined ? {} : { json }),
      ...(fields === undefined ? {} : { fields }),
      ...(url.amazonAsin === null ? {} : { selectedAsin }),
      ...(ownerEvaluation && sameCaptureHtml !== undefined ? { rawHtml: sameCaptureHtml } : {}),
    }
  } finally {
    scope.dispose()
    await Promise.allSettled(channels.map(channel => channel.close?.()))
  }
}

function jsonObject(value: JsonValue | StructuredExtractionResult['data']): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function field(data: Record<string, unknown> | null, key: string): string | null {
  const value = data?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function productView(expectedAsin: string, outcome: CaptureOutcome): PreviewProduct {
  const extraction = outcome.json
  const data = extraction ? jsonObject(extraction.data) : null
  const facts = outcome.result.document?.product
  const asin = field(data, 'asin')
  const location = field(data, 'deliveryLocation')
  const currency = field(data, 'currency')
  const identityVerified = outcome.result.document?.adapter.id === 'amazon-product'
    && outcome.result.document.adapterValidation?.valid === true && asin === expectedAsin && outcome.selectedAsin === expectedAsin
    && (facts === undefined || facts === null || facts.identity?.status === 'matched')
  const regionVerified = location !== null && /\bSingapore[\s,·-]*238823\b/i.test(location)
  const currencyVerified = currency === 'SGD' && (facts === undefined || facts === null || facts.priceCurrency !== null && facts.priceCurrency.source !== 'inferred')
  const quoteVerified = facts === undefined || facts === null || facts.quoteState === 'present'
  const issues: { code: string; message: string }[] = (extraction?.issues ?? []).map(issue => ({
    code: issue.code,
    message: issue.path ? `We could not verify ${issue.path}.` : issue.code === 'subject_unverified' ? 'We could not verify the main product on this page.' : 'We could not verify some product fields.',
  }))
  if (!identityVerified) issues.push({ code: facts?.identity?.status === 'conflicting' ? 'subject_conflicting' : 'subject_unverified', message: facts?.identity?.status === 'conflicting' ? 'The selected-product identity controls disagree.' : 'The ASIN selected on the page does not match the requested ASIN.' })
  if (!regionVerified) issues.push({ code: location === null ? 'region_unverified' : 'region_mismatch', message: 'We could not verify delivery to Singapore 238823 on this page.' })
  if (!quoteVerified) issues.push({ code: facts?.quoteState === 'absent_observed' ? 'quote_absent_observed' : facts?.quoteState === 'conflicting' ? 'quote_conflicting' : 'quote_unverified', message: 'No selected quote was verified in this captured page context.' })
  if (!currencyVerified) issues.push({ code: 'currency_unverified', message: 'We could not verify that the price currency is SGD.' })
  const valid = outcome.result.status === 'success' && extraction?.status === 'complete' && identityVerified && regionVerified && currencyVerified && quoteVerified
  // Do not leak a different selected product or an offer from an uncertain
  // shipping/currency context into a public price result.
  // Incomplete extraction may hide offer text inside nested specifications or
  // variants. Expose only scalar identity fields until the whole context is
  // verified; masking the two top-level price keys is insufficient.
  const safeData = !identityVerified || data === null || extraction?.status === 'invalid'
    ? null
    : valid ? data : {
      asin,
      title: field(data, 'title'),
      brand: field(data, 'brand'),
    }
  return {
    status: valid ? 'complete' : extraction?.status === 'invalid' ? 'invalid' : 'incomplete',
    asin: identityVerified ? asin : null,
    region: regionVerified ? location : null,
    currency: currencyVerified ? currency : null,
    data: safeData,
    issues,
  }
}

/** Public Amazon content is built from the checked subject record. The raw
 * page Markdown can contain unrelated offers and prices from recommendations. */
function productSummary(product: PreviewProduct): string | null {
  if (!product.asin || !product.data) return null
  const clean = (value: unknown): string | null => {
    if (typeof value !== 'string' || !value.trim()) return null
    return value.replace(/[\r\n]+/g, ' ').replace(/[\[\]()*_`]/g, '').trim()
  }
  const data = product.data
  const lines = [`# ${clean(data.title) ?? 'Product page'}`, '', `Main ASIN: ${product.asin}`]
  const add = (label: string, value: unknown): void => { const normalized = clean(value); if (normalized) lines.push(`${label}: ${normalized}`) }
  add('Brand', data.brand)
  add('Seller', data.seller)
  add('Availability', data.availability)
  add('Delivery location', product.region)
  add('Currency', product.currency)
  if (product.status === 'complete' && typeof data.price === 'number' && Number.isFinite(data.price) && product.currency === 'SGD') {
    lines.push(`Price: SGD ${data.price}`)
  }
  if (product.status !== 'complete') lines.push('', 'Some product fields still need verification.')
  return lines.join('\n')
}

function socialPostSummary(normalized: NormalizedPreviewUrl, result: FetchResult): { applies: boolean; markdown: string | null } {
  const path = new URL(normalized.url).pathname
  const adapter = result.document?.adapter.id
  const expectedId = adapter === 'x-public' ? /^\/[^/]+\/status\/(\d+)/.exec(path)?.[1]
    : adapter === 'reddit-public' ? /^\/r\/[^/]+\/comments\/([a-z0-9]+)/i.exec(path)?.[1] : undefined
  if (!expectedId) return { applies: false, markdown: null }
  if (result.document?.adapterValidation?.valid !== true) return { applies: true, markdown: null }
  const entities = result.document.entities ?? []
  const post = entities.find(entity => entity.type === 'post' && entity.id === expectedId)
  const value = (key: string): string | null => {
    const raw = post?.fields[key]?.normalized
    return typeof raw === 'string' && raw.trim() ? raw.trim() : null
  }
  if (!post) return { applies: true, markdown: null }
  if (adapter === 'x-public') {
    const body = value('text')
    const author = value('author')
    return { applies: true, markdown: body && author ? `Post by @${author}\n\n${body}` : null }
  }
  const title = value('title')
  if (!title) return { applies: true, markdown: null }
  const lines = [`# ${title}`]
  if (value('body')) lines.push('', value('body')!)
  for (const comment of entities.filter(entity => entity.type === 'comment' && entity.relationships.thread === expectedId).slice(0, 50)) {
    const body = comment.fields.body?.normalized
    if (typeof body !== 'string' || !body.trim()) continue
    const author = comment.fields.author?.normalized
    lines.push('', `Comment${typeof author === 'string' && author ? ` by u/${author}` : ''}:`, body.trim())
  }
  return { applies: true, markdown: lines.join('\n') }
}

/** Deduplicated http(s) links without credentials, within the preview's caps, and how many there were in all. */
export function previewLinks(links: readonly string[]): { links: string[]; total: number } {
  const seen = new Set<string>()
  for (const link of links) {
    if (link.length > LINK_CHARS) continue
    let parsed: URL
    try { parsed = new URL(link) } catch { continue }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) continue
    seen.add(parsed.href)
  }
  const kept: string[] = []
  let chars = 0
  for (const link of seen) {
    if (kept.length >= PREVIEW_LINKS || chars + link.length > LINKS_TOTAL_CHARS) break
    kept.push(link)
    chars += link.length
  }
  return { links: kept, total: seen.size }
}

function previewMetadata(metadata: PageMetadata): PageMetadata {
  const cut = (value: string | null): string | null => value === null ? null : value.slice(0, METADATA_CHARS)
  return {
    title: cut(metadata.title),
    description: cut(metadata.description),
    language: cut(metadata.language),
    keywords: cut(metadata.keywords),
    robots: cut(metadata.robots),
    favicon: cut(metadata.favicon),
    canonicalUrl: cut(metadata.canonicalUrl),
  }
}

/** The fields result without any model usage, and without its data when that would make the response large. */
/** The fields as read, in the order they were asked for (the extraction lists the ones it found first). */
function previewFields(fields: StructuredExtractionResult, options: PreviewOptions): PreviewFields {
  const properties = fieldsSchema(options)?.properties
  const read = fields.data as JsonValue | null
  const data = properties && read !== null && typeof read === 'object' && !Array.isArray(read)
    ? Object.fromEntries([...Object.keys(properties).filter(name => Object.hasOwn(read, name)), ...Object.keys(read).filter(name => !Object.hasOwn(properties, name))].map(name => [name, read[name]!]))
    : read
  const tooLarge = data !== null && JSON.stringify(data).length > FIELDS_CHARS
  return {
    status: tooLarge ? 'incomplete' : fields.status,
    data: tooLarge ? null : data,
    ...(fields.schemaSha256 === undefined ? {} : { schemaSha256: fields.schemaSha256 }),
    evidence: fields.evidence.map(item => ({ path: item.path, source: item.source, ...(item.evidencePath ? { evidencePath: item.evidencePath } : {}), ...(item.text ? { text: item.text } : {}) })),
    issues: [
      ...fields.issues.map(issue => ({ code: issue.code, message: issue.message, ...(issue.path ? { path: issue.path } : {}) })),
      ...(tooLarge ? [{ code: 'too_large', message: `The fields came to more than ${FIELDS_CHARS.toLocaleString('en-US')} characters, so they were left out.` }] : []),
    ],
  }
}

function previewFile(file: NonNullable<FetchResult['file']>): PreviewFile {
  return {
    kind: file.kind,
    contentType: file.contentType,
    bytes: file.bytes,
    declaredBytes: file.declaredBytes,
    maxBytes: file.maxBytes,
    sha256: file.sha256,
    markdownFrom: file.markdownFrom,
    pdf: file.pdf === null ? null : { pageCount: file.pdf.pageCount, pagesRead: file.pdf.pagesRead },
    warnings: file.warnings.map(warning => ({ code: warning.code, message: warning.message })),
  }
}

export function mapPreviewResult(requestedUrl: string, normalized: NormalizedPreviewUrl, outcome: CaptureOutcome, totalMs: number, options: PreviewOptions = {}): PreviewResponse {
  const { result } = outcome
  const product = normalized.amazonAsin === null ? undefined : productView(normalized.amazonAsin, outcome)
  const social = socialPostSummary(normalized, result)
  const robotsEvent = result.failureReason === 'policy_denied' ? result.trace?.find(event => event.event === 'robots_disallowed') : undefined
  const robotsDenied = robotsEvent !== undefined
  // An unreachable robots.txt counts as a complete disallow (RFC 9309 §2.3.1.4), but it is not a rule the site wrote:
  // the reason says which it was.
  const robotsUnreachable = robotsDenied && (robotsEvent.detail as { unreachable?: unknown } | undefined)?.unreachable !== undefined
  const status: PreviewStatus = result.status === 'blocked' || robotsDenied ? 'blocked'
    : result.failureReason === 'timeout' || result.budgetExceeded === 'time' || result.status === 'cancelled' ? 'timeout'
      : result.status === 'success' ? product && product.status !== 'complete' || social.applies && social.markdown === null ? 'incomplete' : 'success'
        : result.status === 'partial' || result.status === 'empty_verified' || (product && result.failureReason === 'identity_compromised') ? 'incomplete' : 'failed'
  const extractedPrice = jsonObject(outcome.json?.data ?? null)?.price
  const quoteState = result.document?.product?.quoteState
  const quoteMissing = typeof extractedPrice !== 'number' || !Number.isFinite(extractedPrice) || (quoteState !== undefined && quoteState !== 'present')
  let reason = status === 'success' ? null
    : status === 'blocked' ? robotsUnreachable ? 'This site\'s robots.txt could not be read, so W2L did not fetch the page.'
      : robotsDenied ? 'This site does not allow automated preview of this page.'
      : result.blockReason === 'bot_detected_generic' ? 'The site returned a verification page instead of the requested content.'
        : result.blockReason === 'login_wall' ? 'The page requires a login.'
          : 'The website blocked this request.'
      : status === 'timeout' ? 'The page did not finish loading within the preview time limit.'
        : product && product.issues.length > 0 ? product.issues[0]!.message
          : social.applies && social.markdown === null ? 'We could not verify the requested post in the page content.'
          : result.failureReason === 'policy_denied' ? 'This URL is not allowed for public preview.'
            : result.failureReason ? `Extraction failed (${result.failureReason}).`
            : status === 'incomplete' ? 'The page content is incomplete.' : 'We could not extract this page right now.'
  const diagnostic: PreviewDiagnostic | undefined = status === 'success' ? undefined
    : robotsUnreachable ? { code: 'robots_unreachable', stage: 'policy', evidence: 'observed' }
    : robotsDenied ? { code: 'robots_disallowed', stage: 'policy', evidence: 'observed' }
      : result.blockReason === 'login_wall' ? { code: 'login_required', stage: 'acquisition', evidence: 'observed' }
        : result.blockReason === 'bot_detected_generic' ? { code: 'challenge', stage: 'acquisition', evidence: 'observed' }
          : result.failureReason === 'policy_denied' ? { code: 'policy_denied', stage: 'policy', evidence: 'observed' }
            : status === 'timeout' ? { code: 'timeout', stage: 'acquisition', evidence: 'unobserved' }
              : status === 'failed' ? { code: 'capture_failed', stage: 'acquisition', evidence: 'unobserved' }
              : product && result.document?.product?.identity?.status === 'conflicting'
                ? { code: 'subject_conflicting', stage: 'subject', evidence: 'observed' }
                : product && outcome.selectedAsin !== null && outcome.selectedAsin !== undefined && outcome.selectedAsin !== normalized.amazonAsin
                ? { code: 'subject_mismatch', stage: 'subject', evidence: 'observed' }
                : product && product.asin === null ? { code: 'subject_unverified', stage: 'subject', evidence: 'unobserved' }
                  : product && product.region === null ? { code: 'region_unverified', stage: 'field', evidence: 'unobserved' }
                    : product && quoteMissing ? { code: quoteState === 'absent_observed' ? 'quote_absent_observed' : quoteState === 'conflicting' ? 'quote_conflicting' : 'quote_unverified', stage: 'field', evidence: quoteState === 'absent_observed' || quoteState === 'conflicting' ? 'observed' : 'unobserved' }
                      : product && product.currency === null ? { code: 'currency_unverified', stage: 'field', evidence: 'unobserved' }
                        : status === 'incomplete' ? { code: 'content_unverified', stage: 'field', evidence: 'unobserved' }
                          : { code: 'capture_failed', stage: 'acquisition', evidence: 'unobserved' }
  if (diagnostic?.code === 'subject_mismatch') reason = 'The page selected a different product from the requested ASIN. Its fields and price were withheld.'
  if (diagnostic?.code === 'subject_conflicting') reason = 'The captured page contains conflicting selected-product identities. Product fields and price were withheld.'
  if (diagnostic?.code === 'quote_unverified') reason = 'No selected quote was verified for this product in the captured Singapore page.'
  if (diagnostic?.code === 'quote_absent_observed') reason = 'This captured page shows the selected item as unavailable in this delivery context; no selected quote was verified.'
  if (diagnostic?.code === 'quote_conflicting') reason = 'The captured page contains conflicting selected quote evidence; the price was withheld.'
  const contentful = result.status === 'success' || result.status === 'partial'
  // Links and metadata come only with an ordinary page that was read: a failed or blocked result's page is evidence,
  // never content, and Amazon, X and Reddit answer with their checked records.
  const readable = contentful && product === undefined && !social.applies && result.document?.adapter.id === 'generic'
  // Formats a visitor listed narrow what comes back; page info always does, and without a list everything comes.
  const listed = (format: 'markdown' | 'links'): boolean => options.formats === undefined || options.formats.includes(format)
  const links = readable && listed('links') && result.links !== undefined ? previewLinks(result.links) : undefined
  const markdown = contentful && (product !== undefined || social.applies || listed('markdown'))
    ? product !== undefined ? productSummary(product) : social.applies ? social.markdown : (result.markdown?.slice(0, MARKDOWN_CHARS) ?? null)
    : null
  return {
    status,
    requestedUrl,
    // A capture refused before any request (robots.txt, DNS, policy) still carries the requested URL as its final
    // URL; it was never requested, so there is none (the same rule as runtime/src/evidenceRecord.ts).
    finalUrl: typeof result.evidence.httpStatus === 'number' || (result.usage?.requestCount ?? 0) > 0 ? result.evidence.finalUrl || null : null,
    title: product && product.asin === null ? null : result.document?.title ?? null,
    markdown,
    ...(markdown !== null && product === undefined && !social.applies && (result.markdown?.length ?? 0) > MARKDOWN_CHARS ? { markdownTruncated: true } : {}),
    totalMs,
    reason,
    capability: resolvePreviewCapability(normalized),
    ...(diagnostic === undefined ? {} : { diagnostic }),
    ...(product === undefined ? {} : { product }),
    ...(links === undefined ? {} : { links: links.links, linksTotal: links.total }),
    ...(readable && result.metadata !== undefined ? { metadata: previewMetadata(result.metadata) } : {}),
    ...(result.file === undefined ? {} : { file: previewFile(result.file) }),
    ...((readable || contentful && result.file !== undefined) && outcome.fields !== undefined ? { json: previewFields(outcome.fields, options) } : {}),
  }
}

export function validateAmazonPublicState(serialized: string): void {
  let state: unknown
  try { state = JSON.parse(serialized) } catch { throw new Error('Amazon public preference state is not valid JSON') }
  if (state === null || typeof state !== 'object' || Array.isArray(state)) throw new Error('Amazon public preference state is invalid')
  const { cookies, origins } = state as Record<string, unknown>
  if (!Array.isArray(cookies) || !Array.isArray(origins)) throw new Error('Amazon public preference state is invalid')
  const scoped = (host: string) => AMAZON_HOSTS.has(host.replace(/^\./, '').toLowerCase())
  if (cookies.some(cookie => cookie === null || typeof cookie !== 'object' || Array.isArray(cookie)
    || typeof cookie.domain !== 'string' || !scoped(cookie.domain))) throw new Error('Amazon state contains out-of-scope cookies')
  if (origins.some(origin => {
    if (origin === null || typeof origin !== 'object' || Array.isArray(origin) || typeof origin.origin !== 'string') return true
    try { const url = new URL(origin.origin); return url.protocol !== 'https:' || !scoped(url.hostname) }
    catch { return true }
  })) throw new Error('Amazon state contains out-of-scope origins')
  if (!cookies.some(cookie => cookie.name === 'i18n-prefs' && cookie.value === 'SGD' && scoped(cookie.domain))) throw new Error('Amazon state lacks SGD preference')
}
