/**
 * Numbers read from page text, as the page writes them.
 *
 * Text is read as a number only when it is one amount: an optional sign
 * (`-`, `−` or `+`), a currency symbol or code before or after it (a symbol
 * before and a code after, as in `$12.99 USD`, at most) or a percent unit after
 * it (`%`, `pp`, `p.p.`), and one number. The number's decimal separator
 * is `.` or `,`. Its thousands are grouped by `.`, `,`, a space of any width
 * (a no-break or narrow no-break space too) or an apostrophe, in groups of
 * three digits, or India's lakh groups (`1,29,999`); `,-` or `.–` after it ends
 * a whole amount. Where the text decides, it is read: `12,99 €` is 12.99,
 * `1.299,00 €`, `1 299,00 €` and `CHF 1'299.–` are 1299.
 *
 * A single `.` or `,` before exactly three digits (`1.299 €`, `$1,299`) is 1299
 * in one notation and 1.299 in the other. It is read only when what the value
 * is settles it:
 *
 * - a count (a review count) is whole, so the separator groups thousands;
 * - so is an amount in a currency without minor units (JPY, KRW, …), named in
 *   the text or by the page for this amount;
 * - a JSON-LD or OpenGraph price writes `.` as its decimal point;
 * - for a number that is not an amount of money (no currency in the text or
 *   for this value), the language the page declares, when its notation is
 *   one: `en` writes `1,299` and `1.299`, `de-DE` writes `1.299` and `1,299`
 *   for the same two numbers; `fr` groups by spaces, so its `1.299` stays
 *   unread; a bare `de`, `it` or `es` settles nothing (Switzerland, Mexico).
 *   Callers pass no language for a value that may be money (structured.ts).
 *
 * Nothing else is taken to settle it: not the page's language for an amount
 * of money (an English page of a German shop can write `1.299 €`), not the
 * currency (Irish shops write `€1,299`, German ones `1.299 €`) and not the
 * domain. The number is then not read, and the reading says why.
 *
 * A reading names the rule it was read by (`conversion`) and the unit the
 * text states beside the number: its currency mark or percent unit.
 */

export interface NumberContext {
  /** The value counts something, such as reviews: it is whole. */
  count?: boolean
  /** The value is a JSON-LD or OpenGraph price, whose format writes `.` as the decimal point. */
  decimalPoint?: boolean
  /** The ISO 4217 code the page states for this amount elsewhere, such as a product's `priceCurrency`. */
  currency?: string | null
  /** The page's declared language (`<html lang>`), as written: it settles a lone separator in a number that is not money. */
  language?: string | null
}

export type NumberReading =
  /** `conversion`: the rule (`number/decimal`, `number/language:de`); `unit`: the currency mark or percent unit the text states. */
  | { value: number; conversion: string; unit?: string }
  /** `unsettled`: a number whose notation nothing settles. */
  | { reason: 'not_a_number' | 'not_whole' | 'unsettled'; message: string }

const CODES = [
  'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'RMB', 'AUD', 'CAD', 'CHF', 'HKD', 'SGD', 'INR', 'KRW', 'BRL', 'MXN', 'SEK', 'NOK', 'DKK', 'PLN', 'TRY', 'ZAR',
  'NZD', 'CZK', 'HUF', 'RON', 'BGN', 'ISK', 'ILS', 'THB', 'TWD', 'IDR', 'MYR', 'PHP', 'VND', 'CLP', 'COP', 'PEN', 'ARS', 'UAH', 'AED', 'SAR',
]
/** The ISO 4217 codes read as a currency beside a number. */
export const CURRENCY_CODES: readonly string[] = CODES
/** Currencies whose amounts have no minor unit (ISO 4217 exponent 0) among those W2L recognises, and their own signs. */
const NO_MINOR_UNIT = new Set(['JPY', 'KRW', 'ISK', 'VND', 'CLP', '₩', '円'])
const CODE = `(?:${CODES.join('|')})`
const SYMBOL = '(?:[$£€¥₹₽₩฿₺₴₪₱₫₦円元]|[A-Z]{1,3}\\$|kr\\.?|zł|Kč|S?Fr\\.)'
const PREFIX = new RegExp(`^(${CODE}|${SYMBOL})\\s*`, 'u')
const SUFFIX = new RegExp(`\\s*(${CODE}|${SYMBOL})$`, 'u')
const SIGN = /^([-−+])\s*/u
/** A percentage, or a difference of percentages in points. */
const UNIT = /\s*(%|pp|p\.p\.)$/u
/** `,-`, `.–`: no minor units. */
const DASH = /([.,])(?:--?|–|—)$/u
const BODY = /^\d+(?:[.,'’\s]\d+)*$/u
const SEPARATOR = /[.,'’\s]/gu

const NOT_A_NUMBER: NumberReading = { reason: 'not_a_number', message: 'not one number' }

/** How a declared language writes numbers: `point` (`1,299.5`), `comma` (`1.299,5`) or `comma-space` (`1 299,5`, a `.` is not its separator). */
type Notation = 'point' | 'comma' | 'comma-space'
const NOTATION_BY_REGION: Readonly<Record<string, Notation | null>> = {
  'de-ch': 'point', 'de-li': 'point', 'it-ch': 'point', 'en-za': null,
  'de-de': 'comma', 'de-at': 'comma', 'de-lu': 'comma', 'de-be': 'comma', 'it-it': 'comma',
  'es-es': 'comma', 'es-ar': 'comma', 'es-cl': 'comma', 'es-co': 'comma',
  'es-mx': 'point', 'es-us': 'point', 'es-pr': 'point', 'es-do': 'point', 'es-gt': 'point', 'es-hn': 'point', 'es-ni': 'point', 'es-pa': 'point', 'es-sv': 'point', 'es-419': null,
}
/** German, Italian and Spanish write numbers one way in one country and the other way in another (Switzerland, Mexico): only a region settles them. */
const NOTATION_BY_LANGUAGE: Readonly<Record<string, Notation>> = Object.fromEntries([
  ...['en', 'zh', 'ja', 'ko', 'th', 'he', 'ms', 'ga', 'hi', 'bn', 'ta', 'te', 'fil'].map(tag => [tag, 'point']),
  ...['nl', 'pt', 'id', 'tr', 'da', 'el', 'ro', 'hr', 'sl', 'sr', 'vi', 'ca', 'eu', 'gl'].map(tag => [tag, 'comma']),
  ...['fr', 'sv', 'fi', 'nb', 'nn', 'no', 'cs', 'sk', 'pl', 'ru', 'uk', 'hu', 'bg', 'lt', 'lv', 'et', 'be', 'kk'].map(tag => [tag, 'comma-space']),
])

function notationOf(language: string | null | undefined): Notation | null {
  const tag = language?.trim().toLowerCase().replace(/_/g, '-') ?? ''
  if (tag === '') return null
  const region = /^([a-z]{2,3})-([a-z]{2}|\d{3})\b/.exec(tag)
  if (region !== null && `${region[1]}-${region[2]}` in NOTATION_BY_REGION) return NOTATION_BY_REGION[`${region[1]}-${region[2]}`] ?? null
  return NOTATION_BY_LANGUAGE[/^[a-z]{2,3}/.exec(tag)?.[0] ?? ''] ?? null
}

/** Digit groups joined by one thousands separator: three digits each after the first, or India's lakh groups with `,`. */
function grouped(groups: readonly string[], separator: string): boolean {
  const [first, ...rest] = groups
  if (first === undefined || rest.length === 0) return false
  if (/^[1-9]\d{0,2}$/.test(first) && rest.every(group => group.length === 3)) return true
  return separator === ',' && rest.length >= 2 && /^[1-9]\d?$/.test(first)
    && rest.slice(0, -1).every(group => group.length === 2) && rest[rest.length - 1]!.length === 3
}

/** The number a text states. */
export function readNumber(input: string, context: NumberContext = {}): NumberReading {
  let rest = input.trim()
  // An amount is short; longer text is never one.
  if (rest.length === 0 || rest.length > 64) return NOT_A_NUMBER
  let negative = false
  let signed = false
  const sign = (): boolean => {
    const match = SIGN.exec(rest)
    if (match === null) return true
    if (signed) return false
    signed = true
    negative = match[1] !== '+'
    rest = rest.slice(match[0].length)
    return true
  }
  sign()
  const marks: string[] = []
  const prefix = PREFIX.exec(rest)
  if (prefix !== null) {
    marks.push(prefix[1]!)
    rest = rest.slice(prefix[0].length)
  }
  if (!sign()) return NOT_A_NUMBER
  const suffix = SUFFIX.exec(rest)
  if (suffix !== null) {
    marks.push(suffix[1]!)
    rest = rest.slice(0, suffix.index)
  }
  const isCode = (mark: string): boolean => CODES.includes(mark)
  if (marks.length === 2 && (isCode(marks[0]!) || !isCode(marks[1]!))) return NOT_A_NUMBER
  const percent = UNIT.exec(rest)
  if (percent !== null) {
    // A percentage is not an amount of money.
    if (marks.length > 0) return NOT_A_NUMBER
    rest = rest.slice(0, percent.index)
  }
  const unit = percent?.[1] ?? marks[0]
  const dash = DASH.exec(rest)
  if (dash !== null) rest = rest.slice(0, dash.index)
  if (!BODY.test(rest)) return NOT_A_NUMBER

  const groups = rest.split(SEPARATOR)
  const separators = (rest.match(SEPARATOR) ?? []).map(sep => /\s/u.test(sep) ? ' ' : sep === '’' ? "'" : sep)
  const kinds = new Set(separators)
  const last = separators[separators.length - 1]
  const withSign = (value: number): number => (negative ? -value : value)
  const read = (value: number, rule: string): NumberReading => ({ value: withSign(value), conversion: `number/${rule}`, ...(unit === undefined ? {} : { unit }) })
  const whole = (digits: string, rule = 'grouped'): NumberReading => read(Number(digits), rule)
  const decimal = (integerDigits: string, fraction: string, rule = 'grouped'): NumberReading => {
    const value = Number(`${integerDigits}.${fraction}`)
    return context.count === true && !Number.isInteger(value) ? { reason: 'not_whole', message: 'not a whole number' } : read(value, rule)
  }

  if (last === undefined) return whole(rest, 'plain')
  if (dash !== null) {
    // The dash stands for the minor units, so its separator is the decimal one and every separator in the number groups thousands.
    return kinds.size === 1 && !kinds.has(dash[1]!) && grouped(groups, last) ? whole(groups.join('')) : NOT_A_NUMBER
  }
  if (kinds.size === 2 && (last === '.' || last === ',') && separators.indexOf(last) === separators.length - 1) {
    // Two separators: the last, once, marks decimals; the other groups thousands.
    const integer = groups.slice(0, -1)
    return grouped(integer, separators[0]!) ? decimal(integer.join(''), groups[groups.length - 1]!) : NOT_A_NUMBER
  }
  if (kinds.size !== 1) return NOT_A_NUMBER
  // One kind of separator. A space or an apostrophe, or a `.` or `,` used more than once, groups thousands.
  if (last === ' ' || last === "'" || separators.length > 1) return grouped(groups, last) ? whole(groups.join('')) : NOT_A_NUMBER
  const [integer, fraction] = groups as [string, string]
  // Once: it marks decimals unless three digits follow a group that could start a number.
  if (fraction.length !== 3 || !/^[1-9]\d{0,2}$/.test(integer)) return decimal(integer, fraction, 'decimal')
  if (context.decimalPoint === true && last === '.') return decimal(integer, fraction, 'decimal-point')
  const currency = context.currency?.trim().toUpperCase()
  if (context.count === true) return whole(integer + fraction, 'count')
  if (marks.some(mark => NO_MINOR_UNIT.has(mark)) || (currency !== undefined && NO_MINOR_UNIT.has(currency))) return whole(integer + fraction, 'no-minor-unit')
  // Money is never settled by the page's language (see above).
  const notation = marks.length === 0 && currency === undefined ? notationOf(context.language) : null
  const rule = `language:${context.language?.trim()}`
  if (notation === 'point') return last === '.' ? decimal(integer, fraction, rule) : whole(integer + fraction, rule)
  if (notation === 'comma' || (notation === 'comma-space' && last === ',')) return last === ',' ? decimal(integer, fraction, rule) : whole(integer + fraction, rule)
  return { reason: 'unsettled', message: `"${last}" before three digits can separate thousands or decimals, and nothing on the page says which` }
}
