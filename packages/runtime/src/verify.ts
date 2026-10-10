/**
 * The task verifier (ADR 0006, ROADMAP PA item 10): a contract's checks judged against one view of a page, as
 * research/access/run-set.mjs judges its tasks, so a task sent as a contract gets the runner's own verdict.
 *
 * A view is the result itself, or another reading of the same page (item 11 judges the page's DOM text). A partial view
 * may lack what a check reads; that check is then `passed: null`, neither passed nor failed. On the result's own view,
 * what is missing is judged as the runner judges it.
 */
import { isDataCheck, type JsonValue, type Verification, type VerificationCheck, type VerifyCheck, type VerifyContract } from '@w2l/contracts'
import { sha256Utf8 } from '@w2l/http-core'
import { canonicalJson } from './evidenceRecord.js'

/** Changes when any check is judged differently, as EXTRACTOR_VERSION does for the Markdown. */
export const VERIFIER_VERSION = 'verify/1'

/**
 * What the checks read: the result's own fields (status, markdown, list, tables, json and any other a `field` check
 * names), and `tableCount`, which replaces the count of GFM tables in the Markdown when a view has its own (a DOM view
 * counts the tables it shows).
 */
export type VerifyView = { status?: unknown; markdown?: unknown; tableCount?: number } & Record<string, unknown>

export interface VerifyOptions {
  /** A view that holds only some of the page's readings: a check that reads what it lacks is `passed: null`. */
  partial?: boolean
}

const READ = new Set(['success', 'partial'])

const get = (obj: unknown, path: string): unknown => path.split('.').reduce<unknown>((v, k) => (v === undefined || v === null ? undefined : (v as Record<string, unknown>)[k]), obj)
const gfmTableCount = (md: string): number => (md.match(/^\|.*\|\s*\n\|\s*:?-{3,}/gm) ?? []).length
const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

/** A value in a sentence without the page's text: a string by its length. */
function described(value: unknown): string {
  if (value === undefined) return 'absent'
  if (value === null) return 'null'
  if (typeof value === 'string') return value === '' ? 'an empty string' : `a string of ${plural(value.length, 'character')}`
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return Array.isArray(value) ? `a list of ${plural(value.length, 'item')}` : 'an object'
}

/** The contract's SHA-256: of its canonical JSON (RFC 8785), so the same contract written twice has one hash. */
export function contractSha256(contract: VerifyContract): string {
  return sha256Utf8(canonicalJson(contract as unknown as JsonValue))
}

type Judged = Pick<VerificationCheck, 'passed' | 'observed' | 'observedCount' | 'asked'>

function judge(check: VerifyCheck, view: VerifyView, partial: boolean): Judged {
  const unavailable: Judged = { passed: null, observed: 'not available in this view' }
  const hasMarkdown = typeof view.markdown === 'string'
  const md = hasMarkdown ? view.markdown as string : ''
  const counted = (n: number, min: number, what: string, after = ''): Judged => ({ passed: n >= min, observedCount: n, asked: min, observed: `${plural(n, what)}${after}, at least ${min} asked` })
  switch (check.type) {
    case 'markdownIncludes':
      if (partial && !hasMarkdown) return unavailable
      return md.includes(check.text) ? { passed: true, observed: 'the text is in the Markdown' } : { passed: false, observed: 'the text is not in the Markdown' }
    case 'markdownMatches':
      if (partial && !hasMarkdown) return unavailable
      return new RegExp(check.pattern, check.flags ?? 'm').test(md) ? { passed: true, observed: 'the pattern matches the Markdown' } : { passed: false, observed: 'the pattern does not match the Markdown' }
    case 'markdownCountMin':
      if (partial && !hasMarkdown) return unavailable
      return counted((md.match(new RegExp(check.pattern, (check.flags ?? '').replace('g', '') + 'g')) ?? []).length, check.min, 'match')
    case 'minTables':
      if (partial && !hasMarkdown && view.tableCount === undefined) return unavailable
      return counted(view.tableCount ?? gfmTableCount(md), check.min, 'table')
    case 'listRecordsMin': {
      const path = check.path ?? 'list.records'
      if (partial && !(path.split('.')[0]! in view)) return unavailable
      const records = get(view, path)
      return counted(Array.isArray(records) ? records.length : 0, check.min, 'record')
    }
    case 'recordFields': {
      if (partial && !('list' in view)) return unavailable
      const records = get(view, 'list.records')
      const whole = Array.isArray(records) ? records.filter((record) => {
        const values = (record as { values?: Record<string, unknown> } | null)?.values ?? {}
        const missing = (record as { missing?: unknown } | null)?.missing
        return check.fields.every((field) => !(Array.isArray(missing) && missing.includes(field)) && values[field] !== undefined && values[field] !== null && values[field] !== '')
      }).length : 0
      return counted(whole, check.min, 'record', ' with every field')
    }
    case 'field': {
      if (partial && !(check.path.split('.')[0]! in view)) return unavailable
      const value = get(view, check.path)
      const passed = check.equals !== undefined ? value === check.equals
        : check.in !== undefined ? check.in.includes(value as string | number | boolean | null)
          : check.present !== undefined ? (value !== undefined && value !== null && value !== '') === check.present
            : typeof value === 'number' && value >= (check.min ?? -Infinity) && value <= (check.max ?? Infinity)
      return { passed, observed: `${check.path} is ${described(value)}` }
    }
  }
}

/**
 * The verification of one view against a contract: `not_requested` without one; for a page not read as content (a
 * status other than success, partial or empty_verified) `failed`/`page_not_read` with no check run; for
 * `empty_verified`, `passed` when the contract allows an empty result, else `failed`/`empty_not_allowed`; otherwise
 * each check judged, `passed` when every one that could be judged passed.
 */
export function verify(contract: VerifyContract | undefined, view: VerifyView, options: VerifyOptions = {}): Verification {
  if (contract === undefined) return { status: 'not_requested' }
  const base = { verifier: VERIFIER_VERSION, contractSha256: contractSha256(contract) }
  if (view.status === 'empty_verified') {
    return contract.emptyOk === true ? { status: 'passed', ...base, reason: null, checks: [] } : { status: 'failed', ...base, reason: 'empty_not_allowed', checks: [] }
  }
  if (!READ.has(view.status as string)) return { status: 'failed', ...base, reason: 'page_not_read', checks: [] }
  const partial = options.partial === true
  const checks: VerificationCheck[] = contract.checks.map((check, index) => ({ index, type: check.type, data: isDataCheck(check), ...judge(check, view, partial) }))
  const judged = checks.filter((check) => check.passed !== null)
  const passed = judged.length > 0 && judged.every((check) => check.passed === true)
  return passed ? { status: 'passed', ...base, reason: null, checks } : { status: 'failed', ...base, reason: 'checks_failed', checks }
}
