/**
 * The unit and as-of date a table states for the numbers in its columns,
 * read only from the table itself: its caption, the header of the number's
 * column, and the short blocks just before it back to its heading
 * (extract-tf's `ListTableText`). Nothing is read from elsewhere on the page.
 *
 * A unit is a statement of one:
 *
 * - a caption or block that is one (`Units of Foreign Currencies per
 *   Australian Dollar`, `Unit: tonnes`, `Figures in USD millions`), as written
 *   (the lead-in `Unit:` or `Figures in` left out);
 * - a header's bracketed qualifier that is a unit (`Land Area (Km²)`,
 *   `Density (P/Km²)`, `Price [EUR]`), as written;
 * - a header that is an amount of a currency or a currency code (`1.00 USD`),
 *   the whole header.
 *
 * A unit is a currency code, sign or measure W2L knows (UNIT_WORDS), with a
 * scale (`millions`) and a per (`P/Km²`): `(est.)`, `(2024)` and a caption of
 * prose are none. An as-of date is a header, qualifier or caption that is one
 * day and at most a time and zone (`19 Oct 2026`), or a block before the table
 * that is a timestamp or says it is one (`Jan 01, 2026 03:50 UTC`, `As at 19
 * October 2026`), read as its ISO day; a year, a month, a range, a day alone
 * in a block and a date in a sentence are none. A column of dates is the
 * rows' data, never an as-of date.
 */
import type { ListColumn, ListTableText } from '@w2l/contracts'
import { CURRENCY_CODES } from './numbers.js'

/** One statement: what it was read as, the page's text it was read in, and where that text stands. */
export interface TableStatement {
  value: string
  text: string
  where: string
}

/**
 * Measures as they are written, case and all: a header's `(HR)`, `(G)`, `(T)`
 * or `(W)` abbreviates a column (home runs, games, tries, wins), so a capital
 * letter alone is never read as a unit (no `W`, `V` or `L`).
 */
const MEASURES = new Set(['km', 'Km', 'KM', 'm', 'cm', 'mm', 'µm', 'μm', 'nm', 'mi', 'ft', 'yd', 'ha', 'acres', 'kg', 'Kg', 'KG', 'g', 'mg', 'µg', 'μg', 't', 'tonnes', 'lb', 'lbs', 'oz',
  'l', 'ml', 'mL', 'cl', 'gal', 's', 'ms', 'min', 'h', 'hr', 'hrs', 'kW', 'kWh', 'MW', 'MWh', 'GW', 'GWh', 'Wh', 'mAh', 'Hz', 'kHz', 'MHz', 'GHz',
  'kB', 'KB', 'MB', 'GB', 'TB', 'kbps', 'Mbps', 'Gbps', '°C', '°F', '℃', '℉'])
const SCALES = new Set(['thousand', 'thousands', 'million', 'millions', 'billion', 'billions', 'trillion', 'trillions', 'mn', 'mln', 'bn', 'tn', '000', '000s', "'000", "'000s", 'crore', 'crores', 'lakh', 'lakhs'])
const PERCENT = /^(?:%|pp|p\.p\.|‰|percent|per ?cent|percentage points|basis points|bps)$/iu
const CURRENCY_SIGN = /^(?:[$£€¥₹₽₩฿₺₴₪₱₫₦円元]|[A-Z]{1,3}\$)$/u
const CODES: ReadonlySet<string> = new Set(CURRENCY_CODES)

/** A currency: an ISO code W2L knows, as written in capitals, or a currency sign. */
const isCurrency = (word: string): boolean => CODES.has(word) || CURRENCY_SIGN.test(word)
/** A measure, with a power after it (`km²`, `m3`, `m^2`). */
const isMeasure = (word: string): boolean => MEASURES.has(word.replace(/(?:\^?[23]|[²³])$/u, ''))

/** The ISO codes a currency sign can stand for; a code stands for itself. */
const SIGN_CODES: Readonly<Record<string, readonly string[]>> = {
  '$': ['USD', 'AUD', 'CAD', 'NZD', 'SGD', 'HKD', 'TWD', 'MXN', 'CLP', 'COP', 'ARS'], 'US$': ['USD'], 'A$': ['AUD'], 'AU$': ['AUD'], 'C$': ['CAD'], 'CA$': ['CAD'],
  'NZ$': ['NZD'], 'S$': ['SGD'], 'HK$': ['HKD'], 'NT$': ['TWD'], 'R$': ['BRL'], 'MX$': ['MXN'], '€': ['EUR'], '£': ['GBP'], '¥': ['JPY', 'CNY', 'RMB'], '円': ['JPY'],
  '元': ['CNY', 'RMB'], '₹': ['INR'], '₩': ['KRW'], '฿': ['THB'], '₺': ['TRY'], '₴': ['UAH'], '₪': ['ILS'], '₱': ['PHP'], '₫': ['VND'], 'kr': ['SEK', 'NOK', 'DKK', 'ISK'],
  'kr.': ['SEK', 'NOK', 'DKK', 'ISK'], 'zł': ['PLN'], 'Kč': ['CZK'], 'Fr.': ['CHF'], 'SFr.': ['CHF'],
}
const codesOf = (currency: string): readonly string[] => CODES.has(currency) ? [currency] : SIGN_CODES[currency] ?? []

/**
 * Whether a unit the table states can be the one the number's own text
 * states: a percent for a percent; for a currency (`$`, `EUR`), a unit naming
 * a currency it can stand for (`$` and `USD`, `€` and `EUR millions`) or a
 * scale alone, which says how many of it (`€` and `millions`). A sign
 * Octocrawl cannot map stands for no code, so it agrees only with itself.
 */
export function agreesWithText(own: { currency?: string; unit?: string }, unit: string): boolean {
  if (own.unit !== undefined) return PERCENT.test(unit.replace(/^in\s+/iu, ''))
  if (own.currency === undefined) return true
  // Beside an amount of money, `m`, `k` and `b` are millions, thousands and billions, not metres.
  if (unit.replace(/^in\s+/iu, '').split(/\s+/u).every(word => isScale(word) || ['m', 'k', 'b'].includes(word))) return true
  const codes = codesOf(own.currency)
  return unit.split(/[\s/()]+/u).some(word => word === own.currency || (isCurrency(word) && codesOf(word).some(code => codes.includes(code))))
}
const isScale = (word: string): boolean => SCALES.has(word.toLowerCase())

/**
 * Whether the text is a unit and nothing else: a percent; a currency or a
 * measure, with a scale before (`millions of USD`, `thousand tonnes`) or after
 * it (`USD m`, `€ million`); a scale alone (`in thousands`); or a ratio whose
 * denominator is one and whose numerator is one word (`P/Km²`, `USD per kg`).
 */
function isUnit(text: string): boolean {
  const unit = text.trim().replace(/^in\s+/iu, '')
  if (unit.length === 0 || unit.length > 40) return false
  if (PERCENT.test(unit)) return true
  const ratio = /^(\S+)\s*(?:\/|\sper\s)\s*(.+)$/iu.exec(unit)
  if (ratio !== null) return (/^\p{L}{1,12}$/u.test(ratio[1]!) || isUnit(ratio[1]!)) && isUnit(ratio[2]!)
  const words = unit.split(/\s+/u)
  const base = (word: string): boolean => isCurrency(word) || isMeasure(word)
  if (words.length === 1) return base(words[0]!) || isScale(words[0]!)
  if (words.length === 2) return (base(words[0]!) && isScale(words[1]!)) || (isScale(words[0]!) && base(words[1]!))
  if (words.length === 3) return isScale(words[0]!) && words[1]!.toLowerCase() === 'of' && base(words[2]!)
  return false
}

/** The unit a caption or a block before the table states, as written; null when it states none. */
export function unitStatement(text: string): string | null {
  const statement = text.trim().replace(/[.:]$/u, '').trim()
  if (statement.length > 100 || /[;!?]/u.test(statement)) return null
  // A rate's unit, as the RBA's caption writes it; "Units of study" is not one.
  if (/^units?\s+of\s+[\p{L}' -]{1,60}?\s+per\s+[\p{L}\p{N}' -]{1,60}$/iu.test(statement)) return statement
  const labelled = /^(?:units?|currency)\s*:\s*(.+)$/iu.exec(statement)
  if (labelled !== null) return isUnit(labelled[1]!) ? labelled[1]!.trim() : null
  const lead = /^\(?\s*(?:(?:all\s+)?(?:figures|amounts|values|prices|rates|numbers|data)\s+(?:are\s+)?)?(?:in|expressed\s+in|shown\s+in|measured\s+in|quoted\s+in|reported\s+in)\s+(.+?)\s*\)?$/iu.exec(statement)
  return lead !== null && isUnit(lead[1]!) ? lead[1]!.trim() : null
}

/** A header's trailing bracketed qualifier: `Land Area (Km²)` qualifies with `Km²`. */
const qualifierOf = (header: string): string | null => /\s[([]\s*([^()[\]]+?)\s*[)\]]\s*$/u.exec(header)?.[1] ?? null

/** The unit a column's header states: a qualifier that is a unit, or the whole header when it is an amount of a currency or a currency. */
export function headerUnit(header: string): string | null {
  const qualifier = qualifierOf(header)
  if (qualifier !== null && isUnit(qualifier)) return qualifier.replace(/^in\s+/iu, '')
  const amount = /^(?:\d+(?:[.,]\d+)?\s*)?(\S+)$|^(\S+?)\s*\d+(?:[.,]\d+)?$/u.exec(header.trim())
  const currency = amount?.[1] ?? amount?.[2]
  return currency !== undefined && isCurrency(currency) ? header.trim() : null
}

const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?'
const DAYS: ReadonlyArray<{ pattern: RegExp; read: (m: RegExpExecArray) => [number, string | number, number] }> = [
  { pattern: /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/u, read: m => [Number(m[1]), Number(m[2]), Number(m[3])] },
  { pattern: new RegExp(`^(\\d{1,2})(?:st|nd|rd|th)?[\\s-]+${MONTH}[\\s,-]+(\\d{4})`, 'iu'), read: m => [Number(m[3]), m[2]!, Number(m[1])] },
  { pattern: new RegExp(`^${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})`, 'iu'), read: m => [Number(m[3]), m[1]!, Number(m[2])] },
]
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
/** What may follow the day: a time, and a zone. */
const TIME = /^(?:(?:,?\s*(?:at\s+)?|T)\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:\s*[ap]\.?m\.?)?(?:\s*(?:UTC|GMT|Z|[A-Z]{2,5}|[+-]\d{2}:?\d{2}))?)?$/iu
/** What may stand before a day that the table holds as of it. */
const AS_OF = /^(?:(?:data|rates?|prices?|figures|values)\s+)?(?:as\s+(?:of|at|on)|effective(?:\s+(?:from|on|as\s+of))?|(?:last\s+)?updated(?:\s+on)?|valid\s+(?:on|as\s+of|from))\s*:?\s*/iu
const WEEKDAY = /^(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+/iu

/**
 * The ISO day a caption, header or block is, with at most a time and zone
 * after it and an "as of" before it; null when it is not one day. With
 * `stated`, a day alone is not enough: the text says what it is (an "as of")
 * or is a timestamp (a time after it), since a bare day just before a table can
 * be the page's own date, such as a post's.
 */
export function dateStatement(text: string, stated = false): string | null {
  const trimmed = text.trim().replace(/\.$/u, '')
  const statement = trimmed.replace(AS_OF, '').replace(WEEKDAY, '')
  const asOf = AS_OF.test(trimmed)
  for (const { pattern, read } of DAYS) {
    const match = pattern.exec(statement)
    const rest = match === null ? '' : statement.slice(match[0].length)
    if (match === null || !TIME.test(rest) || (stated && !asOf && rest.trim() === '')) continue
    const [year, monthText, day] = read(match)
    const month = typeof monthText === 'number' ? monthText : MONTHS.indexOf(monthText.toLowerCase().slice(0, 3)) + 1
    // A day the calendar has: 31 Feb is not one.
    const date = new Date(Date.UTC(year, month - 1, day))
    if (month < 1 || month > 12 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
    return date.toISOString().slice(0, 10)
  }
  return null
}

/**
 * Every unit and every as-of date the table states for a number under these
 * columns: each column's header (its qualifier, or itself), then the table's
 * caption and the blocks before it, which hold for all its columns.
 */
export function tableStatements(columns: readonly ListColumn[], tables: readonly ListTableText[]): { units: TableStatement[]; dates: TableStatement[] } {
  const units: TableStatement[] = []
  const dates: TableStatement[] = []
  const add = (text: string, where: string, header: boolean): void => {
    const unit = header ? headerUnit(text) : unitStatement(text)
    if (unit !== null) units.push({ value: unit, text, where })
    const qualifier = header ? qualifierOf(text) : null
    const date = dateStatement(text, !header) ?? (qualifier === null ? null : dateStatement(qualifier))
    if (date !== null) dates.push({ value: date, text, where })
  }
  for (const column of columns) add(column.header, `column ${column.column} ${JSON.stringify(column.header)} header`, true)
  const index = columns.find(column => column.table !== undefined)?.table
  const table = index === undefined ? undefined : tables[index]
  if (table !== undefined && table.caption !== null) add(table.caption, 'table caption', false)
  for (const block of table?.before ?? []) add(block.text, `table, block ${block.distance} before it (${block.element})`, false)
  return { units, dates }
}
