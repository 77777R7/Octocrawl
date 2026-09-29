/**
 * Numbers read from page text, as the page writes them.
 *
 * Text is read as a number only when it is one amount: an optional sign, a
 * currency symbol or code before or after it (a symbol before and a code after,
 * as in `$12.99 USD`, at most), and one number. The number's decimal separator
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
 * - a JSON-LD or OpenGraph price writes `.` as its decimal point.
 *
 * Nothing else is taken to settle it: not the page's language (an English page
 * of a German shop can write `1.299 €`), not the currency (Irish shops write
 * `€1,299`, German ones `1.299 €`) and not the domain. The number is then not
 * read, and the reading says why.
 */

export interface NumberContext {
  /** The value counts something, such as reviews: it is whole. */
  count?: boolean
  /** The value is a JSON-LD or OpenGraph price, whose format writes `.` as the decimal point. */
  decimalPoint?: boolean
  /** The ISO 4217 code the page states for this amount elsewhere, such as a product's `priceCurrency`. */
  currency?: string | null
}

export type NumberReading =
  | { value: number }
  /** `unsettled`: a number whose notation nothing settles. */
  | { reason: 'not_a_number' | 'not_whole' | 'unsettled'; message: string }

const CODES = [
  'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'RMB', 'AUD', 'CAD', 'CHF', 'HKD', 'SGD', 'INR', 'KRW', 'BRL', 'MXN', 'SEK', 'NOK', 'DKK', 'PLN', 'TRY', 'ZAR',
  'NZD', 'CZK', 'HUF', 'RON', 'BGN', 'ISK', 'ILS', 'THB', 'TWD', 'IDR', 'MYR', 'PHP', 'VND', 'CLP', 'COP', 'PEN', 'ARS', 'UAH', 'AED', 'SAR',
]
/** Currencies whose amounts have no minor unit (ISO 4217 exponent 0) among those W2L recognises, and their own signs. */
const NO_MINOR_UNIT = new Set(['JPY', 'KRW', 'ISK', 'VND', 'CLP', '₩', '円'])
const CODE = `(?:${CODES.join('|')})`
const SYMBOL = '(?:[$£€¥₹₽₩฿₺₴₪₱₫₦円元]|[A-Z]{1,3}\\$|kr\\.?|zł|Kč|S?Fr\\.)'
const PREFIX = new RegExp(`^(${CODE}|${SYMBOL})\\s*`, 'u')
const SUFFIX = new RegExp(`\\s*(${CODE}|${SYMBOL})$`, 'u')
const SIGN = /^[-−]\s*/u
/** `,-`, `.–`: no minor units. */
const DASH = /([.,])(?:--?|–|—)$/u
const BODY = /^\d+(?:[.,'’\s]\d+)*$/u
const SEPARATOR = /[.,'’\s]/gu

const NOT_A_NUMBER: NumberReading = { reason: 'not_a_number', message: 'not one number' }

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
  const sign = (): boolean => {
    const match = SIGN.exec(rest)
    if (match === null) return true
    if (negative) return false
    negative = true
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
  const dash = DASH.exec(rest)
  if (dash !== null) rest = rest.slice(0, dash.index)
  if (!BODY.test(rest)) return NOT_A_NUMBER

  const groups = rest.split(SEPARATOR)
  const separators = (rest.match(SEPARATOR) ?? []).map(sep => /\s/u.test(sep) ? ' ' : sep === '’' ? "'" : sep)
  const kinds = new Set(separators)
  const last = separators[separators.length - 1]
  const signed = (value: number): number => (negative ? -value : value)
  const whole = (digits: string): NumberReading => ({ value: signed(Number(digits)) })
  const decimal = (integerDigits: string, fraction: string): NumberReading => {
    const value = Number(`${integerDigits}.${fraction}`)
    return context.count === true && !Number.isInteger(value) ? { reason: 'not_whole', message: 'not a whole number' } : { value: signed(value) }
  }

  if (last === undefined) return whole(rest)
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
  if (fraction.length !== 3 || !/^[1-9]\d{0,2}$/.test(integer)) return decimal(integer, fraction)
  if (context.decimalPoint === true && last === '.') return decimal(integer, fraction)
  const currency = context.currency?.trim().toUpperCase()
  if (context.count === true || marks.some(mark => NO_MINOR_UNIT.has(mark)) || (currency !== undefined && NO_MINOR_UNIT.has(currency))) {
    return whole(integer + fraction)
  }
  return { reason: 'unsettled', message: `"${last}" before three digits can separate thousands or decimals, and nothing on the page says which` }
}
