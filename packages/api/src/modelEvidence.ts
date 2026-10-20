/**
 * Where on the page a value the model wrote is stated (F2).
 *
 * The model only proposes values; a value is kept only when the page states
 * it. Text matches case-insensitively, with `_`, `-` and punctuation read as
 * spaces and whitespace collapsed (`in_stock` matches `In Stock`), on word
 * boundaries. A number matches a number the page writes, read by the rules of
 * numbers.ts. An ISO date matches the same day written as `8 October 2026`,
 * `October 8, 2026` or `2026/10/08`.
 *
 * What the page declares is searched first (the product's facts, its entity
 * fields, labelled rows, citation tags and article JSON-LD), then the
 * Markdown. On a product page the Markdown under a heading that introduces
 * other products ("Customers also bought") is not the subject's, so a value
 * stated only there is not supported. Nothing else is searched: no URL, no
 * attribute, no text the delivered result does not show.
 */
import type { FetchResult, JsonValue, ProductFact, StructuredFieldEvidence } from '@w2l/contracts'
import { isRecommendationHeading } from '@w2l/extract-tf'
import { readNumber } from './numbers.js'

/** Where a model value was found: the located text as written, and for a number or a date its reading and what stands beside it. */
export type ModelLocation = Required<Pick<StructuredFieldEvidence, 'evidencePath' | 'text'>> & Pick<StructuredFieldEvidence, 'normalized' | 'context'>

interface Haystack {
  text: string
  /** The evidencePath of a hit: a declared fact's path, or `markdown line N`. */
  at: (index: number) => string
  /** A JSON-LD or OpenGraph value writes `.` as its decimal point. */
  decimalPoint: boolean
  /** The currency the page states for this value elsewhere (a product's priceCurrency for its price). */
  currency?: string
  /** Where the page delivers to, for a price. */
  region?: string
}

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The words of a text: camelCase split, lowercased, `_`, `-` and other punctuation as spaces. */
function words(text: string): string[] {
  return text.normalize('NFKC').replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(word => word.length > 0)
}

/** A pattern for these words in page text: any run of non-letters between them, and no letter or digit on either side. */
function wordsPattern(list: readonly string[]): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${list.map(escape).join('[^\\p{L}\\p{N}]*')}(?![\\p{L}\\p{N}])`, 'iu')
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?'
const DATES: ReadonlyArray<{ pattern: RegExp; read: (m: RegExpExecArray) => [number, number, number] }> = [
  { pattern: /(?<!\d)(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/gu, read: m => [Number(m[1]), Number(m[2]), Number(m[3])] },
  { pattern: new RegExp(`(?<!\\d)(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH},?\\s+(\\d{4})(?!\\d)`, 'giu'), read: m => [Number(m[3]), monthOf(m[2]!), Number(m[1])] },
  { pattern: new RegExp(`(?<![\\p{L}])${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})(?!\\d)`, 'giu'), read: m => [Number(m[3]), monthOf(m[1]!), Number(m[2])] },
]
function monthOf(name: string): number {
  return MONTHS.findIndex(month => month.startsWith(name.toLowerCase().replace(/\.$/, '').slice(0, 3))) + 1
}
const isoDay = (y: number, m: number, d: number): string => `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/

/** Every date the text writes, with where it stands and its ISO day. */
function datesIn(text: string): Array<{ index: number; text: string; iso: string }> {
  const out: Array<{ index: number; text: string; iso: string }> = []
  for (const { pattern, read } of DATES) {
    for (const match of text.matchAll(new RegExp(pattern.source, pattern.flags))) {
      const [y, m, d] = read(match as RegExpExecArray)
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) out.push({ index: match.index!, text: match[0], iso: isoDay(y, m, d) })
    }
  }
  return out
}

const CURRENCY_BEFORE = /(?:([$£€¥₹₽₩฿₺₴₪₱₫₦]|[A-Z]{1,3}\$)|\b([A-Z]{3}))\s?$/u
const CURRENCY_AFTER = /^\s?(?:([$£€¥₹₽₩฿₺₴₪₱₫₦円元])|([A-Z]{3})\b)/u
const UNIT_AFTER = /^[\s ]?(%|(?:kg|g|mg|lbs?|oz|km|cm|mm|m|in|ft|ml|cl|l|kw|w|v|mah|wh|kwh|gb|tb|mb|hz|ghz|mhz|pcs|pieces|pack|units?|items?)(?![\p{L}\p{N}]))/iu
const NUMBER_RUN = /(?<![\p{L}\p{N}.,])\d(?:[\d.,'’  ]*\d)?(?:[.,](?:--?|–|—))?(?![\p{N}])/gu

/** The line of `text` that holds `index`. */
function lineAt(text: string, index: number): string {
  const start = text.lastIndexOf('\n', index - 1) + 1
  const end = text.indexOf('\n', index)
  return text.slice(start, end < 0 ? undefined : end)
}

/**
 * Markdown lines on a product page that belong to its subject: a heading that
 * introduces other products (extract-tf's recommendation headings) starts a
 * part that runs to the next heading of the same or a higher rank, and those
 * lines are blanked (kept as empty lines, so line numbers stay the page's).
 */
function subjectMarkdown(markdown: string, product: boolean): string {
  if (!product) return markdown
  let skipRank = 0
  return markdown.split('\n').map(line => {
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading !== null) {
      const rank = heading[1]!.length
      if (skipRank > 0 && rank <= skipRank) skipRank = 0
      if (skipRank === 0 && isRecommendationHeading(heading[2]!)) skipRank = rank
    }
    return skipRank > 0 ? '' : line
  }).join('\n')
}

/** What the page declares about its subject, each with its own path, in the order searched. */
function declared(result: FetchResult): Haystack[] {
  const out: Haystack[] = []
  const add = (text: string | null | undefined, path: string | undefined, source: string, extra: Partial<Haystack> = {}): void => {
    if (text === null || text === undefined || text.length === 0 || path === undefined) return
    out.push({ text, at: () => path, decimalPoint: source === 'jsonld' || source === 'meta', ...extra })
  }
  const fact = (item: ProductFact | null | undefined, extra: Partial<Haystack> = {}): void => add(item?.value, item?.path, item?.source ?? '', extra)
  const product = result.document?.product ?? null
  if (product !== null) {
    // Facts the product's sources disagree on are null here, so a model value cannot settle them.
    for (const item of [product.subjectId, product.sku, product.name, product.brand, product.availability, product.seller, product.priceCurrency, product.deliveryLocation]) fact(item)
    fact(product.price, { ...(product.priceCurrency ? { currency: product.priceCurrency.value } : {}), ...(product.deliveryLocation ? { region: product.deliveryLocation.value } : {}) })
    fact(product.rating)
    fact(product.reviewCount)
    for (const item of product.authors ?? []) fact(item)
    for (const [label, item] of Object.entries(product.specifications ?? {})) {
      fact(item)
      add(label, item.path, item.source)
    }
  }
  for (const entity of result.document?.entities ?? []) {
    for (const field of Object.values(entity.fields)) add(typeof field.raw === 'string' ? field.raw : null, field.path, field.source)
  }
  for (const item of result.document?.labelledValues ?? []) add(item.value, `${item.path} ${JSON.stringify(item.label)}`, 'dom')
  for (const item of result.document?.declaredValues ?? []) for (const value of item.values) add(value, item.path, item.source)
  return out
}

function markdownHaystack(result: FetchResult): Haystack | null {
  const markdown = result.markdown
  if (typeof markdown !== 'string' || markdown.length === 0) return null
  const text = subjectMarkdown(markdown, (result.document?.product ?? null) !== null)
  return { text, at: index => `markdown line ${text.slice(0, index).split('\n').length}`, decimalPoint: false }
}

/** What stands beside a located number or date in its line: a currency, a unit, a date, and the page's delivery region for a price. */
function contextOf(hay: Haystack, index: number, end: number, number: boolean): StructuredFieldEvidence['context'] {
  const before = hay.text.slice(Math.max(0, index - 4), index)
  const after = hay.text.slice(end, end + 12)
  const context: NonNullable<StructuredFieldEvidence['context']> = {}
  if (number) {
    const sign = CURRENCY_BEFORE.exec(before) ?? CURRENCY_AFTER.exec(after)
    const currency = sign?.[1] ?? sign?.[2] ?? hay.currency
    if (currency !== undefined) context.currency = currency
    const unit = UNIT_AFTER.exec(after)?.[1]
    if (unit !== undefined && currency === undefined) context.unit = unit
    if (hay.region !== undefined) context.region = hay.region
  }
  const line = lineAt(hay.text, index)
  const offset = index - (hay.text.lastIndexOf('\n', index - 1) + 1)
  const date = datesIn(line).find(item => item.index + item.text.length <= offset || item.index >= offset + (end - index))
  if (date !== undefined) context.date = date.text
  return Object.keys(context).length > 0 ? context : undefined
}

function sameNumber(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b))
}

function findNumber(hay: Haystack, value: number): ModelLocation | null {
  for (const match of hay.text.matchAll(NUMBER_RUN)) {
    let start = match.index!
    let end = start + match[0].length
    if (value < 0) {
      if (!/[-−]\s?$/u.test(hay.text.slice(Math.max(0, start - 2), start))) continue
    }
    // The amount with the currency written beside it, as numbers.ts reads it.
    const before = CURRENCY_BEFORE.exec(hay.text.slice(Math.max(0, start - 4), start))
    const after = CURRENCY_AFTER.exec(hay.text.slice(end, end + 5))
    const currency = before?.[1] ?? before?.[2] ?? after?.[1] ?? after?.[2] ?? hay.currency
    const reading = readNumber(match[0], { decimalPoint: hay.decimalPoint, ...(currency === undefined ? {} : { currency }) })
    if (!('value' in reading) || !sameNumber(reading.value, Math.abs(value))) continue
    if (before !== null) start -= before[0].length
    if (after !== null) end += after[0].length
    const context = contextOf(hay, match.index!, match.index! + match[0].length, true)
    return { evidencePath: hay.at(start), text: hay.text.slice(start, end).trim(), normalized: value, ...(context === undefined ? {} : { context }) }
  }
  return null
}

function findText(hay: Haystack, value: string): ModelLocation | null {
  const list = words(value)
  if (list.length === 0) return null
  const day = ISO_DAY.exec(value)
  if (day !== null) {
    const hit = datesIn(hay.text).find(item => item.iso === value)
    if (hit !== undefined) {
      const context = contextOf(hay, hit.index, hit.index + hit.text.length, false)
      return { evidencePath: hay.at(hit.index), text: hit.text, normalized: value, ...(context === undefined ? {} : { context }) }
    }
  }
  const match = wordsPattern(list).exec(hay.text)
  if (match === null) return null
  return { evidencePath: hay.at(match.index), text: match[0] }
}

/**
 * A function that locates a scalar the model wrote on this page, or says it
 * cannot (null). A boolean is never located: no page text states one.
 */
export function modelLocator(result: FetchResult): (value: string | number | boolean) => ModelLocation | null {
  const haystacks = [...declared(result)]
  const markdown = markdownHaystack(result)
  if (markdown !== null) haystacks.push(markdown)
  return value => {
    if (typeof value === 'boolean') return null
    for (const hay of haystacks) {
      const hit = typeof value === 'number' ? findNumber(hay, value) : findText(hay, value)
      if (hit !== null) return hit
    }
    return null
  }
}
