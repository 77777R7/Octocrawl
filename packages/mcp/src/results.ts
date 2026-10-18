/**
 * The longest result text the MCP server answers for scrape and the page lists (docs/mcp-client-ux-tasks.md W8.3, D11):
 * Claude Code saves a longer one to a file instead of showing it. On a scrape, base64 captures (the screenshot, which
 * also comes as an image block, and action captures) are not counted, as they cannot be cut; on a page list they are,
 * since the list stops before a page instead. get_scrape is not capped: it carries no page body.
 */
import type { VerifyContract } from '@w2l/contracts'
import { resultProjection } from './resultVerification.js'

export const RESULT_TEXT_MAX = 50_000

/** The fields that say what happened, serialised before the page body (W8.2). */
const VERDICT_KEYS = ['status', 'failureReason', 'blockReason', 'verification', 'readiness', 'agentHints', 'truncated', 'truncatedAt'] as const
/** The page bodies a cut shortens, the least needed first; truncatedAt is the offset in the last one cut. */
const CUT_FIELDS = ['rawHtml', 'html', 'markdown'] as const
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
 * truncated, truncatedAt (the offset in the last body cut) and a hint naming the body and how to narrow it.
 */
function withinBudget(result: Json, max: number, measure: Measure, project = resultProjection(result)): Json {
  if (measure(result) <= max) return result
  let cut = result
  let cutAny = false
  for (const field of CUT_FIELDS) {
    const body = cut[field]
    if (typeof body !== 'string' || body === '') continue
    const base = cut
    const keeping = (keep: number): Json => verdictFirst(project({ ...base, [field]: body.slice(0, keep), truncated: true, truncatedAt: keep, agentHints: hintsWith(base, field, keep) }))
    // The longest prefix that fits; JSON escapes make the text longer than the body, so search rather than subtract.
    let low = 0
    let high = body.length
    while (low < high) {
      const mid = Math.ceil((low + high) / 2)
      if (measure(keeping(mid)) <= max) low = mid
      else high = mid - 1
    }
    cut = keeping(low)
    cutAny = true
    if (measure(cut) <= max) break
  }
  // A result with no page body to shorten (a huge links list) goes out whole rather than marked cut.
  return cutAny ? cut : result
}

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
