/**
 * The longest result text the MCP server answers for scrape and the page lists (docs/mcp-client-ux-tasks.md W8.3, D11):
 * Claude Code saves a longer one to a file instead of showing it. On a scrape, base64 captures (the screenshot, which
 * also comes as an image block, and action captures) are not counted, as they cannot be cut; on a page list they are,
 * since the list stops before a page instead. get_scrape is not capped: it carries no page body.
 */
import { createHash } from 'node:crypto'
import type { VerifyContract } from '@w2l/contracts'
import { resultProjection } from './resultVerification.js'

export const RESULT_TEXT_MAX = 50_000

/** The fields that say what happened, serialised before the page body (W8.2). */
const VERDICT_KEYS = ['status', 'failureReason', 'blockReason', 'verification', 'readiness', 'agentHints', 'truncated', 'truncatedAt'] as const
const MAX_HINTS = 5

export type ImageBlock = { type: 'image'; data: string; mimeType: string }
type Json = Record<string, unknown>

/** A tool's result as the MCP server answers it: the verdict first, cut to the budget, and a screenshot as an image block. */
export function shapeResult(tool: string, result: unknown, contract?: VerifyContract): { value: unknown; images: ImageBlock[] } {
  if (!isObject(result)) return { value: result, images: [] }
  if (tool === 'scrape') return { value: withinBudget(verdictFirst(result), RESULT_TEXT_MAX, withoutBase64, resultProjection(result, contract)), images: screenshotImage(result) }
  if ((tool === 'get_crawl_pages' || tool === 'get_batch_items') && Array.isArray(result.items)) return { value: pageListWithinBudget(result), images: [] }
  return { value: result, images: [] }
}

/**
 * A result without the call's telemetry and internal ids, for hosted Octocrawl: OpenAI's plugin review asks that a tool
 * result leave out session, trace and request ids and logging metadata (developers.openai.com/plugins/plugin-guidelines,
 * "Response minimization"). The page, the verdict and the Evidence Record stay: its fetch time and hashes are what a
 * citation needs. A map keeps its id, which its outputSchema requires, and a scrape its record's id where get_scrape is
 * listed to read it back (`keepScrapeId`: an account's connection); that record is answered as a scrape's result is. Its hints lose their
 * campaign tags, as error texts do. debug asks for the whole.
 */
export function withoutTelemetry(tool: string, result: unknown, args: unknown, contract?: VerifyContract, options: { keepScrapeId?: boolean } = {}): unknown {
  if (!isObject(result) || (isObject(args) && args.debug === true)) return result
  // A job's items (H2 M8) lose their usage and trace, as get_crawl_pages says pages do without debug; the Evidence Record stays whole.
  if (JOB_ITEM_TOOLS.has(tool) && Array.isArray(result.items)) {
    return { ...result, items: result.items.map((item) => isObject(item) ? (({ usage: _usage, trace: _trace, ...rest }) => rest)(item) : item) }
  }
  if (tool !== 'scrape' && tool !== 'scrape_product' && tool !== 'get_scrape') return result
  // A scrape's record (get_scrape) loses the same telemetry, and the client that made it.
  const { usage: _usage, channelsTried: _channels, ...kept } = result
  const rest = tool === 'get_scrape' ? (({ origin: _origin, ...record }) => record)(kept) : kept
  const untagged = Array.isArray(rest.agentHints) ? { ...rest, agentHints: rest.agentHints.map((hint) => (typeof hint === 'string' ? withoutCampaign(hint) : hint)) } : rest
  let minimized = untagged
  if (isObject(untagged.metadata)) {
    const { scrapeId, concurrencyLimited: _limited, concurrencyQueueDurationMs: _queued, ...metadata } = untagged.metadata
    minimized = { ...untagged, metadata: options.keepScrapeId === true && scrapeId !== undefined ? { ...metadata, scrapeId } : metadata }
  }
  return tool === 'scrape' && contract !== undefined ? resultProjection(result, contract, 'mcp_result_minimized')(minimized) : minimized
}

const JOB_ITEM_TOOLS: ReadonlySet<string> = new Set(['get_batch_items', 'get_batch_errors', 'get_crawl_pages', 'get_crawl_errors'])

/** The links in a text without their utm_* parameters, which a model has no use for (REST keeps them); prose is left alone. */
export function withoutCampaign(text: string): string {
  return text.replace(/https?:\/\/[^\s)]+/g, (link) => {
    let url: URL
    try { url = new URL(link) } catch { return link }
    const tags = [...url.searchParams.keys()].filter((key) => key.startsWith('utm_'))
    if (tags.length === 0) return link
    for (const key of tags) url.searchParams.delete(key)
    return url.toString()
  })
}

function isObject(value: unknown): value is Json {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function verdictFirst(result: Json): Json {
  const ordered: Json = {}
  for (const key of VERDICT_KEYS) if (key in result) ordered[key] = result[key]
  for (const [key, value] of Object.entries(result)) if (!(key in ordered)) ordered[key] = value
  return ordered
}

type Measure = (value: unknown) => number
const whole: Measure = (value) => JSON.stringify(value).length
const withoutBase64: Measure = (value) => JSON.stringify(value, (key, entry) => (key === 'base64' && typeof entry === 'string' ? '' : entry)).length

function screenshotImage(result: Json): ImageBlock[] {
  const screenshot = result.screenshot
  if (!isObject(screenshot) || typeof screenshot.base64 !== 'string' || screenshot.base64 === '') return []
  return [{ type: 'image', data: screenshot.base64, mimeType: typeof screenshot.contentType === 'string' ? screenshot.contentType : 'image/png' }]
}

/**
 * A result over the budget with its page bodies shortened until it fits, rawHtml and html before markdown, with
 * truncated, truncatedAt (the offset in the last body cut) and a hint naming the body and how to narrow it; then, if
 * still over, its images, links and tables kept to the longest prefix that fits (a table cut by rows), each with a
 * hint saying how many were kept. Every cut is re-verified against the request's contract.
 */
function withinBudget(result: Json, max: number, measure: Measure, project = resultProjection(result)): Json {
  if (measure(result) <= max) return result
  let cut = result
  let cutAny = false
  for (const field of CUT_ORDER) {
    const next = BODY_FIELDS.has(field) ? cutBody(cut, field, max, measure, project) : cutList(cut, field, max, measure, project)
    if (next === null) continue
    cut = next
    cutAny = true
    if (measure(cut) <= max) break
  }
  // A result with nothing to shorten goes out whole rather than marked cut.
  return cutAny ? cut : result
}

/**
 * What a cut shortens, the least needed first: the HTML bodies, then the structured lists (images, links, tables),
 * then the Markdown, the page's content. Every cut is re-verified through `project`, so a check on what was cut (a
 * table's rows, a phrase in the Markdown) no longer passes (F6).
 */
const CUT_ORDER = ['rawHtml', 'html', 'images', 'links', 'tables', 'markdown'] as const
const BODY_FIELDS: ReadonlySet<string> = new Set(['rawHtml', 'html', 'markdown'])

/** The longest prefix of a binary search's range for which `fits` holds; 0 when none does. */
function longest(high: number, fits: (keep: number) => boolean): number {
  let low = 0
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (fits(mid)) low = mid
    else high = mid - 1
  }
  return low
}

/** A page body shortened to the longest prefix that fits, or null when there is none to shorten. */
function cutBody(cut: Json, field: string, max: number, measure: Measure, project: (value: Json) => Json): Json | null {
  const body = cut[field]
  if (typeof body !== 'string' || body === '') return null
  const keeping = (keep: number): Json => verdictFirst(project({ ...cut, [field]: body.slice(0, keep), truncated: true, truncatedAt: keep, agentHints: hintsWith(cut, field, keep) }))
  // JSON escapes make the text longer than the body, so search rather than subtract.
  return keeping(longest(body.length, keep => measure(keeping(keep)) <= max))
}

/** A list kept to the longest prefix that fits, a table that does not fit whole cut by rows; null when it fits or is empty. */
function cutList(cut: Json, field: string, max: number, measure: Measure, project: (value: Json) => Json): Json | null {
  const list = cut[field]
  if (!Array.isArray(list) || list.length === 0) return null
  const keeping = (keep: number, rows?: number): Json => {
    const kept = rows !== undefined ? [...list.slice(0, keep), tableRows(list[keep], rows)] : list.slice(0, keep)
    return verdictFirst(project({ ...cut, [field]: kept, truncated: true, agentHints: listHintsWith(cut, field, kept.length, list.length, rows === undefined ? null : { rows, of: rowCount(list[keep]) }) }))
  }
  const whole = longest(list.length, keep => measure(keeping(keep)) <= max)
  if (whole === list.length) return null
  if (field === 'tables' && rowCount(list[whole]) > 0) {
    const rows = longest(rowCount(list[whole]), keep => measure(keeping(whole, keep)) <= max)
    if (rows > 0) return keeping(whole, rows)
  }
  return keeping(whole)
}

function rowCount(table: unknown): number {
  return isObject(table) && Array.isArray(table.rows) ? table.rows.length : 0
}

/** A table with its first `rows` rows, its CSV (RFC 4180, each row ending in CRLF) and digest written again for them. */
function tableRows(table: unknown, rows: number): unknown {
  if (!isObject(table) || !Array.isArray(table.rows)) return table
  const kept = (table.rows as unknown[][]).slice(0, rows)
  const field = (cell: unknown): string => {
    const text = String(cell ?? '')
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  // As the lanes write it (bench errorPage.ts tableCsv): every row, the last too, ends in CRLF.
  const csv = kept.map((row) => `${row.map(field).join(',')}\r\n`).join('')
  return { ...table, rows: kept, headerRows: Math.min(Number(table.headerRows) || 0, kept.length), csv, csvSha256: createHash('sha256').update(csv, 'utf8').digest('hex') }
}

function listHintsWith(result: Json, field: string, kept: number, of: number, rows: { rows: number; of: number } | null): string[] {
  const hints = Array.isArray(result.agentHints) ? (result.agentHints as unknown[]).filter((hint): hint is string => typeof hint === 'string' && !LIST_CUT_HINT.test(hint)) : []
  const which = rows === null ? `${kept} of ${of}` : `${kept} of ${of}, the last with ${rows.rows} of its ${rows.of} rows`
  return [...hints.slice(0, MAX_HINTS - 1), `the ${field} were cut to ${which} to fit this answer; ask for fewer formats, or narrow the page with includeTags or excludeTags`]
}
const LIST_CUT_HINT = /^the (images|links|tables) were cut to \d+ of \d+/

function hintsWith(result: Json, field: string, at: number): string[] {
  const hints = Array.isArray(result.agentHints) ? (result.agentHints as unknown[]).filter((hint): hint is string => typeof hint === 'string' && !CUT_HINT.test(hint)) : []
  return [...hints.slice(0, MAX_HINTS - 1), `the ${field} was cut at character ${at} to fit this answer; narrow it with onlyMainContent, includeTags or excludeTags`]
}
const CUT_HINT = /^the (rawHtml|html|markdown) was cut at character \d+ to fit this answer/

/** The API's cursor after a page: base64url of its createdAt and id, as @w2l/runtime's encodeStepCursor writes it (kept here so the stdio package stays free of the runtime). */
function cursorAfter(page: unknown): string | null {
  if (!isObject(page) || typeof page.createdAt !== 'string' || typeof page.id !== 'string') return null
  return Buffer.from(JSON.stringify({ createdAt: page.createdAt, id: page.id }), 'utf8').toString('base64url')
}

/**
 * A page list over the budget, stopped after the last page that fits, with the cursor that reads on from there
 * (W8.4). A first page alone over the budget is cut instead.
 */
function pageListWithinBudget(list: Json, max = RESULT_TEXT_MAX): Json {
  const items = (list.items as unknown[]).map((item) => (isObject(item) ? verdictFirst(item) : item))
  const all = { ...list, items }
  if (whole(all) <= max) return all
  const stopped = (kept: unknown[]) => ({ ...list, items: kept, nextCursor: cursorAfter(kept.at(-1)), hasMore: true, stoppedBy: 'size' })
  // Each page costs its own length and a comma; the envelope, with a cursor as long as the first page's, the rest.
  const envelope = whole(stopped(items.slice(0, 1))) - whole(items[0])
  let size = envelope
  let count = 0
  for (const item of items) {
    const next = size + whole(item) + (count === 0 ? 0 : 1)
    if (next > max) break
    size = next
    count += 1
  }
  // Another page's cursor can be a few characters longer.
  while (count > 1 && whole(stopped(items.slice(0, count))) > max) count -= 1
  if (count === 0) {
    const first = items[0]
    const cutFirst = isObject(first) ? withinBudget(first, max - envelope, whole) : first
    return items.length === 1 ? { ...all, items: [cutFirst] } : stopped([cutFirst])
  }
  return stopped(items.slice(0, count))
}
